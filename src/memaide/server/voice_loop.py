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

    async def run(self, utterances: AsyncIterator[AsyncIterator[bytes]]) -> None:
        """Drive one turn per utterance until the connection's utterance stream ends.

        Each utterance is transcribed on its own (the client marks boundaries with
        ``audio_end``), so the patient hears a reply per turn rather than only once the
        whole connection closes. A single utterance's STT failure is logged and skipped so
        one bad chunk does not end the session; the silence-tick escalation is a backstop.
        """
        async for utterance in utterances:
            try:
                async for event in self._stt.transcribe(utterance):
                    if event.kind == "final":
                        await self._handle_final(event.text)
            except Exception as exc:  # noqa: BLE001 - a bad utterance must not end the loop
                _log.warning("STT failed on utterance; skipping: %s", exc)

    async def _handle_final(self, text: str) -> None:
        now = self._clock()
        seconds = now - self._last_speech_at
        self._last_speech_at = now
        turn = await self._session.handle_patient_input(
            text, vision=self._get_vision(), seconds_since_last_speech=seconds
        )
        await self._emit_turn(turn)

    async def on_silence(self) -> None:
        """Fire a silence tick; if it escalates, emit the suggestion turn."""
        seconds = self._clock() - self._last_speech_at
        turn = self._session.on_silence_tick(seconds, self._get_vision())
        if turn is not None:
            await self._emit_turn(turn)

    async def _emit_turn(self, turn: Any) -> None:
        await self._send({"type": "subtitle", "text": turn.text, "role": "agent"})
        decision = getattr(self._session, "last_escalation", None)
        if decision is not None and decision.escalate:
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
        try:
            audio = await self._tts.synthesize(turn.text)
        except Exception as exc:  # noqa: BLE001 - audio failure must not lose the reply
            _log.warning("TTS failed; subtitle already sent: %s", exc)
            await self._send({"type": "audio_error", "text": turn.text})
            return
        self._seq += 1
        await self._send(
            {
                "type": "audio_out",
                "pcm": base64.b64encode(audio).decode("ascii"),
                "seq": self._seq,
            }
        )
