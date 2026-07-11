"""Ties STT + the latest vision scene + AgentSession + TTS into one live turn loop.

One VoiceLoop per WebSocket connection. It consumes STT ``final`` transcripts, runs a
brain turn (the only inference) with the latest vision scene, and sends back a subtitle
and synthesized audio. A separate silence tick lets the rule-based escalation fire when
the patient has gone quiet.
"""

import base64
import logging
import time
from typing import Any, AsyncIterator, Awaitable, Callable

from memaide.schemas import VisionContext

_log = logging.getLogger(__name__)

# Marker the WebSocket audio source rides through the utterance FIFO to signal the client's
# hold-out silence (the turn is over). Because it is processed in FIFO order, it always
# follows the preceding utterance's full STT+brain, letting the loop flush the pending reply
# as one TTS call without any cross-task locking.
COMMIT = object()


class VoiceLoop:
    def __init__(
        self,
        session: Any,
        stt: Any,
        tts: Any,
        send: Callable[[dict], Awaitable[None]],
        get_vision: Callable[[], VisionContext | None] | None = None,
        clock: Callable[[], float] | None = None,
        on_escalation: Callable[[Any], Awaitable[None]] | None = None,
    ):
        self._session = session
        self._stt = stt
        self._tts = tts
        self._send = send
        self._get_vision = get_vision or (lambda: None)
        self._clock = clock or time.monotonic
        self._last_speech_at = self._clock()
        self._seq = 0
        self._on_escalation = on_escalation
        self._escalation_reported = False
        self._pending_text: list[str] = []  # patient utterance texts awaiting one reply
        self._speaking = False              # True while generating+sending a reply

    @property
    def is_speaking(self) -> bool:
        """True while a reply is being generated/sent, so the server can ignore inbound
        mic audio (half-duplex) until the reply has gone out."""
        return self._speaking

    async def greet(self) -> None:
        """Speak the opening line immediately (not part of a patient turn)."""
        await self._emit_immediate(self._session.start())

    async def run(self, stream: AsyncIterator[Any]) -> None:
        """Drive turns from the demuxed stream of utterances and ``COMMIT`` markers.

        Each utterance's transcript is buffered (no brain call yet) and shown as an interim
        subtitle. A ``COMMIT`` marker speaks the whole buffered turn as one brain reply. A
        red-flag utterance speaks early (see ``_handle_final``). One utterance's STT failure
        is logged and skipped. When the stream ends (bye/disconnect) any pending turn is
        spoken so it is not lost.
        """
        async for item in stream:
            if item is COMMIT:
                await self._speak_turn()
                continue
            try:
                async for event in self._stt.transcribe(item):
                    if event.kind == "final":
                        await self._handle_final(event.text)
            except Exception as exc:  # noqa: BLE001 - a bad utterance must not end the loop
                _log.warning("STT failed on utterance; skipping: %s", exc)
        await self._speak_turn()  # safety flush: bye/disconnect must not drop a pending turn

    async def _handle_final(self, text: str) -> None:
        """Buffer one utterance's transcript. Show it as an interim subtitle but do NOT call
        the brain yet — the whole turn is answered once on commit. A rule-based red-flag
        check (no brain call) lets emergencies speak immediately instead of waiting."""
        self._pending_text.append(text)
        await self._send({"type": "subtitle", "text": text, "role": "patient"})
        decision = self._session.escalation.check(text, self._get_vision(), 0.0)
        if decision.escalate:
            await self._speak_turn()  # emergency: answer + escalate now, don't wait for commit

    async def on_silence(self) -> None:
        """Fire a silence tick; if it escalates, speak the suggestion immediately."""
        seconds = self._clock() - self._last_speech_at
        turn = self._session.on_silence_tick(seconds, self._get_vision())
        if turn is not None:
            await self._emit_immediate(turn)

    async def _speak_turn(self) -> None:
        """Run the brain ONCE over the whole buffered turn and speak one reply. Snapshot and
        clear the buffer before awaiting so a new utterance during synthesis starts fresh."""
        if not self._pending_text:
            return
        text = " ".join(self._pending_text)
        self._pending_text = []
        self._speaking = True
        try:
            now = self._clock()
            seconds = now - self._last_speech_at
            self._last_speech_at = now
            turn = await self._session.handle_patient_input(
                text, vision=self._get_vision(), seconds_since_last_speech=seconds
            )
            await self._send({"type": "subtitle", "text": turn.text, "role": "agent"})
            await self._handle_escalation()
            await self._synthesize_and_send(turn.text)
        finally:
            self._speaking = False

    async def _emit_immediate(self, turn: Any) -> None:
        """Subtitle + escalation + speak now (greeting and silence-tick suggestions)."""
        self._speaking = True
        try:
            await self._send({"type": "subtitle", "text": turn.text, "role": "agent"})
            await self._handle_escalation()
            await self._synthesize_and_send(turn.text)
        finally:
            self._speaking = False

    async def _handle_escalation(self) -> bool:
        """If the last brain decision escalated, send the escalation message and fire the
        callback (at most once per connection). Returns whether an escalation occurred."""
        decision = getattr(self._session, "last_escalation", None)
        if decision is None or not decision.escalate:
            return False
        await self._send(
            {
                "type": "escalation",
                "reason": decision.reason,
                "triggered_by": list(decision.triggered_by),
            }
        )
        if self._on_escalation is not None and not self._escalation_reported:
            self._escalation_reported = True
            await self._on_escalation(decision)
        return True

    async def _synthesize_and_send(self, text: str) -> None:
        try:
            audio = await self._tts.synthesize(text)
        except Exception as exc:  # noqa: BLE001 - audio failure must not lose the reply
            _log.warning("TTS failed; subtitle already sent: %s", exc)
            await self._send({"type": "audio_error", "text": text})
            return
        self._seq += 1
        await self._send(
            {
                "type": "audio_out",
                "pcm": base64.b64encode(audio).decode("ascii"),
                "seq": self._seq,
            }
        )
