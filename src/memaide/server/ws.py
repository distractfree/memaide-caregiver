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
from memaide.schemas import PatientContext, VisionContext
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


class WebSocketAudioSource(_QueueSource):
    """Yields demuxed inbound ``audio`` PCM chunks for STT."""

    def __aiter__(self) -> AsyncIterator[bytes]:
        return self._iter()


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


async def _await_hello(websocket: Any) -> tuple[PatientContext | None, str | None]:
    async for raw in websocket:
        msg = _parse(raw)
        if not msg or msg.get("type") != "hello":
            continue
        data = msg.get("patient") or {}
        try:
            patient = (
                PatientContext(**data)
                if data
                else PatientContext(
                    patient_id=msg.get("session_id", "unknown"), name="Patient"
                )
            )
        except Exception:  # noqa: BLE001 - bad patient payload -> safe default
            patient = PatientContext(patient_id="unknown", name="Patient")
        return patient, msg.get("session_id")
    return None, None


async def handle(websocket: Any, deps: ServerDeps) -> None:
    """Run one connection: read hello, fan frames/audio to the two tasks, clean up."""
    send_lock = asyncio.Lock()

    async def send(msg: dict) -> None:
        async with send_lock:
            await websocket.send(json.dumps(msg))

    patient, session_id = await _await_hello(websocket)
    if patient is None:
        return

    session = AgentSession(
        brain=deps.make_brain(patient), patient=patient, session_id=session_id
    )
    recorder = deps.make_recorder(session_id or "unknown")
    latest: dict[str, VisionContext | None] = {"scene": None}

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
    )

    vision_task = asyncio.create_task(pipeline.run())
    voice_task = asyncio.create_task(loop.run(audio_source))
    try:
        async for raw in websocket:
            msg = _parse(raw)
            if not msg:
                continue
            mtype = msg.get("type")
            if mtype == "frame" and isinstance(msg.get("data_url"), str):
                await recorder.write(msg["data_url"])
                await frame_source.put(msg["data_url"])
            elif mtype == "audio" and isinstance(msg.get("pcm"), str):
                try:
                    await audio_source.put(base64.b64decode(msg["pcm"]))
                except Exception:  # noqa: BLE001 - bad base64 -> drop the chunk
                    continue
            elif mtype == "bye":
                break
            # unknown / malformed -> ignored (forward-compatible)
    finally:
        await frame_source.close()
        await audio_source.close()
        await recorder.close()
        await asyncio.gather(vision_task, voice_task, return_exceptions=True)


async def serve(deps: ServerDeps, host: str = config.WS_HOST, port: int = config.WS_PORT):
    """Start the websockets server (thin wrapper). Requires the ``websockets`` package."""
    import websockets

    async def _handler(websocket):
        await handle(websocket, deps)

    return await websockets.serve(_handler, host, port)
