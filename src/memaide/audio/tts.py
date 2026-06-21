"""Batch text-to-speech: reply text -> spoken audio bytes. A pure converter.

No inference happens here. ``TextToSpeech`` wraps the OpenAI speech API;
``StubTextToSpeech`` returns fixed bytes so the voice loop is testable offline. This is
the swap point if a lower-latency TTS vendor is needed later.
"""

from typing import Any

from memaide import config


class TextToSpeech:
    """Synthesizes one short reply in a single call (the reply is short, so batch)."""

    def __init__(
        self,
        client: Any,
        model: str = config.TTS_MODEL,
        voice: str = config.TTS_VOICE,
        response_format: str = "pcm",
    ):
        self._client = client
        self._model = model
        self._voice = voice
        self._format = response_format

    async def synthesize(self, text: str) -> bytes:
        resp = await self._client.audio.speech.create(
            model=self._model,
            voice=self._voice,
            input=text,
            response_format=self._format,
        )
        return resp.read()


class StubTextToSpeech:
    """Returns fixed audio bytes; records the last text synthesized."""

    def __init__(self, audio: bytes = b"AUDIO"):
        self._audio = audio
        self.last_text: str | None = None

    async def synthesize(self, text: str) -> bytes:
        self.last_text = text
        return self._audio
