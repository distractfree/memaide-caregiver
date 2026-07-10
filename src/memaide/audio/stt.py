"""Streaming speech-to-text: audio chunks -> transcript events. A pure converter.

No inference happens here; STT only turns the patient's speech into text for the text
brain. ``SpeechToText`` wraps the OpenAI streaming-transcription API; ``StubSpeechToText``
replays scripted events so the voice loop is testable without audio or network.
"""

import io
import logging
import wave
from dataclasses import dataclass
from typing import Any, AsyncIterator

from memaide import config

_log = logging.getLogger(__name__)


def _pcm_to_wav(pcm: bytes, sample_rate: int) -> bytes:
    """Wrap raw PCM16 mono bytes in a WAV container so the API can decode it."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)  # pcm16
        w.setframerate(sample_rate)
        w.writeframes(pcm)
    return buf.getvalue()


@dataclass
class STTEvent:
    kind: str  # "partial" | "final"
    text: str


class SpeechToText:
    """Transcribes one utterance's audio via a streaming transcription model.

    ``client`` is an OpenAI-SDK-shaped object exposing ``audio.transcriptions.create``.
    The inbound ``audio`` iterator is one utterance (the audio source ends it on
    endpoint); chunks are assembled and sent with ``stream=True`` so output text arrives
    as ``partial`` deltas followed by a single ``final``.
    """

    def __init__(
        self,
        client: Any,
        model: str = config.STT_MODEL,
        language: str | None = None,
    ):
        self._client = client
        self._model = model
        self._language = language

    async def transcribe(self, audio: AsyncIterator[bytes]) -> AsyncIterator[STTEvent]:
        buffer = bytearray()
        async for chunk in audio:
            buffer.extend(chunk)
        wav = _pcm_to_wav(bytes(buffer), config.AUDIO_SAMPLE_RATE)
        kwargs: dict[str, Any] = {
            "model": self._model,
            "file": ("utterance.wav", wav),
            "stream": True,
        }
        if self._language:
            kwargs["language"] = self._language
        stream = await self._client.audio.transcriptions.create(**kwargs)
        async for event in stream:
            etype = getattr(event, "type", "")
            if etype == "transcript.text.delta":
                yield STTEvent(kind="partial", text=getattr(event, "delta", ""))
            elif etype == "transcript.text.done":
                yield STTEvent(kind="final", text=getattr(event, "text", ""))


class StubSpeechToText:
    """Replays a fixed list of ``STTEvent``s, draining (but ignoring) the audio."""

    def __init__(self, events: list[STTEvent]):
        self._events = list(events)

    async def transcribe(self, audio: AsyncIterator[bytes]) -> AsyncIterator[STTEvent]:
        async for _chunk in audio:
            pass
        for event in self._events:
            yield event
