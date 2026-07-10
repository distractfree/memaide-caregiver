"""Thin WebSocket server carrying both Ray-Ban media streams over one connection.

Inbound messages are demuxed by ``type``: ``frame`` feeds the vision pipeline, ``audio``
feeds the voice loop, ``hello`` opens the session, ``bye`` closes it. Unknown/malformed
messages are ignored (forward-compatible). Two concurrent tasks run per connection: the
interval-throttled ``VisionPipeline`` (keeps the latest scene + echoes ``vision_context``)
and the turn-based ``VoiceLoop``. The describer supplies only ``advisory_flags``; the
rule-based ``flags`` come from an injected ``VisionCheck`` (``StubVisionCheck`` default).
"""

import asyncio
import base64
import json
import logging
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Callable

from memaide import config
from memaide.agent.session import AgentSession
from memaide.schemas import HandoffType, PatientContext, VisionContext
from memaide.server.recorder import NullSessionRecorder, SessionRecorder
from memaide.server.voice_loop import VoiceLoop
from memaide.vision.pipeline import VisionPipeline
from memaide.vision.rule_check import StubVisionCheck

_log = logging.getLogger(__name__)

_QUEUE_END = object()


@dataclass
class ServerDeps:
    """Injectable parts so the whole server is built from testable seams."""

    describer: Any
    stt: Any
    tts: Any
    make_brain: Callable[[PatientContext], Any]
    vision_check: Any = field(default_factory=StubVisionCheck)
    interval: float = config.VISION_INTERVAL_SECONDS
    make_recorder: Callable[[str], SessionRecorder] = (
        lambda session_id: NullSessionRecorder()
    )
    # Optional per-described-frame trace/notify seam (see server.vision_observer).
    # Default None -> no behavior change; the bridge server injects a real one.
    observer: Any = None
    # Slice 2: when set, hello correlates context by session_id via the registry, and
    # session events are reported back to koko. Both default None -> legacy behavior
    # (patient carried in hello, no koko callbacks) so the bridge tester app still works.
    registry: Any = None
    reporter: Any = None
    # Slice 2: when set, an escalation also sends the caregiver a WhatsApp caregiver alert.
    # Default None -> no WhatsApp (dev / no key). Built by run_session_server.
    notifier: Any = None


class _QueueSource:
    """Adapts a queue of items into an async iterator that ends on the sentinel."""

    def __init__(self) -> None:
        self._queue: asyncio.Queue = asyncio.Queue()

    async def put(self, item: Any) -> None:
        await self._queue.put(item)

    async def close(self) -> None:
        await self._queue.put(_QUEUE_END)

    async def _iter(self) -> AsyncIterator[Any]:
        while True:
            item = await self._queue.get()
            if item is _QUEUE_END:
                return
            yield item


class WebSocketFrameSource(_QueueSource):
    """A ``FrameSource`` backed by the demuxed inbound ``frame`` messages."""

    def frames(self) -> AsyncIterator[str]:
        return self._iter()


class WebSocketAudioSource:
    """Segments the inbound ``audio`` PCM stream into per-utterance byte streams.

    ``put`` appends a chunk to the current utterance; ``end_utterance`` closes it (the
    client sent ``audio_end`` on a speech pause); ``close`` flushes any open utterance and
    ends the stream (the connection closed). ``utterances`` yields one async byte-iterator
    per utterance, so the STT transcribes one utterance at a time and the voice loop can
    reply per turn instead of only once the whole connection ends.
    """

    def __init__(self) -> None:
        self._utterances: asyncio.Queue = asyncio.Queue()
        self._current: asyncio.Queue | None = None

    async def put(self, pcm: bytes) -> None:
        if self._current is None:
            self._current = asyncio.Queue()
            await self._utterances.put(self._current)
        await self._current.put(pcm)

    async def end_utterance(self) -> None:
        if self._current is not None:  # no-op when no audio buffered -> no empty utterance
            await self._current.put(_QUEUE_END)
            self._current = None

    async def close(self) -> None:
        await self.end_utterance()
        await self._utterances.put(_QUEUE_END)

    async def utterances(self) -> AsyncIterator[AsyncIterator[bytes]]:
        while True:
            queue = await self._utterances.get()
            if queue is _QUEUE_END:
                return
            yield self._drain(queue)

    async def _drain(self, queue: asyncio.Queue) -> AsyncIterator[bytes]:
        while True:
            item = await queue.get()
            if item is _QUEUE_END:
                return
            yield item


def _parse(raw: Any) -> dict | None:
    if isinstance(raw, (bytes, bytearray)):
        try:
            raw = raw.decode("utf-8")
        except Exception:  # noqa: BLE001
            return None
    try:
        msg = json.loads(raw)
    except (TypeError, ValueError):
        return None
    return msg if isinstance(msg, dict) else None


_OUTCOME_HANDOFF = {
    "patient_ended": HandoffType.PATIENT_ENDED,
    "caregiver_joined": HandoffType.CAREGIVER_JOINED,
    "disconnected": None,
}


async def _await_hello(websocket: Any) -> dict | None:
    async for raw in websocket:
        msg = _parse(raw)
        if msg and msg.get("type") == "hello":
            return msg
    return None


def _patient_from_hello(msg: dict) -> PatientContext:
    """Legacy path: build the patient from the hello payload (bridge tester app)."""
    data = msg.get("patient") or {}
    try:
        return (
            PatientContext(**data)
            if data
            else PatientContext(patient_id=msg.get("session_id", "unknown"), name="Patient")
        )
    except Exception:  # noqa: BLE001 - bad patient payload -> safe default
        return PatientContext(patient_id="unknown", name="Patient")


async def handle(websocket: Any, deps: ServerDeps) -> None:
    """Run one connection: correlate the session, fan frames/audio to the two tasks,
    then conclude (report the SessionRecord to koko) on exit."""
    send_lock = asyncio.Lock()

    async def send(msg: dict) -> None:
        async with send_lock:
            await websocket.send(json.dumps(msg))

    hello = await _await_hello(websocket)
    if hello is None:
        return
    session_id = hello.get("session_id")

    caregiver = None
    if deps.registry is not None and session_id is not None:
        ctx = await deps.registry.wait_context(session_id)
        if ctx is None:
            await send({"type": "error", "text": "unknown session"})
            return
        patient = ctx.patient
        caregiver = ctx.caregiver
    else:
        patient = _patient_from_hello(hello)

    session = AgentSession(
        brain=deps.make_brain(patient), patient=patient, session_id=session_id
    )
    recorder = deps.make_recorder(session_id or "unknown")
    latest: dict[str, Any] = {"scene": None, "frame_url": None}

    async def sink(ctx: VisionContext) -> None:
        ctx = ctx.model_copy(update={"flags": deps.vision_check.check()})
        latest["scene"] = ctx
        await send(
            {
                "type": "vision_context",
                "description": ctx.description,
                "label": ctx.label,
                "advisory_flags": ctx.advisory_flags,
                "ts": ctx.ts.isoformat(),
            }
        )
        if deps.observer is not None:
            # on_scene swallows its own errors, but guard the connection regardless.
            await deps.observer.on_scene(ctx, session, frame_url=latest["frame_url"])

    on_escalation = None
    if (deps.reporter is not None or deps.notifier is not None) and session_id is not None:
        async def on_escalation(decision):  # noqa: E306 - closure over session_id/deps
            if deps.reporter is not None:
                await deps.reporter.escalation(session_id, decision)
            if deps.notifier is not None:
                await deps.notifier.notify(session_id, patient.name, caregiver, decision)

    frame_source = WebSocketFrameSource()
    audio_source = WebSocketAudioSource()
    pipeline = VisionPipeline(
        source=frame_source, describer=deps.describer, sink=sink, interval=deps.interval
    )
    loop = VoiceLoop(
        session=session,
        stt=deps.stt,
        tts=deps.tts,
        send=send,
        get_vision=lambda: latest["scene"],
        on_escalation=on_escalation,
    )

    vision_task = asyncio.create_task(pipeline.run())
    voice_task = asyncio.create_task(loop.run(audio_source.utterances()))
    outcome = "disconnected"
    try:
        async for raw in websocket:
            msg = _parse(raw)
            if not msg:
                continue
            mtype = msg.get("type")
            if mtype == "frame" and isinstance(msg.get("data_url"), str):
                latest["frame_url"] = msg["data_url"]
                await recorder.write(msg["data_url"])
                await frame_source.put(msg["data_url"])
            elif mtype == "audio" and isinstance(msg.get("pcm"), str):
                try:
                    await audio_source.put(base64.b64decode(msg["pcm"]))
                except Exception:  # noqa: BLE001 - bad base64 -> drop the chunk
                    continue
            elif mtype == "audio_end":
                # Client marked a speech pause -> close this utterance so STT transcribes
                # it now and the patient gets a reply, without ending the connection.
                await audio_source.end_utterance()
            elif mtype == "bye":
                outcome = "patient_ended"
                break
            # unknown / malformed -> ignored (forward-compatible)
    finally:
        await frame_source.close()
        await audio_source.close()
        await recorder.close()
        await asyncio.gather(vision_task, voice_task, return_exceptions=True)
        record = session.stop(_OUTCOME_HANDOFF.get(outcome))
        if deps.reporter is not None and session_id is not None:
            await deps.reporter.conclude(session_id, record, outcome)
        if deps.registry is not None and session_id is not None:
            deps.registry.drop(session_id)


async def serve(deps: ServerDeps, host: str = config.WS_HOST, port: int = config.WS_PORT):
    """Start the websockets server (thin wrapper). Requires the ``websockets`` package."""
    import websockets

    async def _handler(websocket):
        await handle(websocket, deps)

    return await websockets.serve(_handler, host, port)
