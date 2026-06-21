from memaide import config
from memaide.audio.tts import StubTextToSpeech, TextToSpeech


class _FakeSpeechResp:
    def __init__(self, data):
        self._data = data

    def read(self):
        return self._data


class _FakeSpeech:
    def __init__(self, data):
        self._data = data
        self.kwargs = None

    async def create(self, **kwargs):
        self.kwargs = kwargs
        return _FakeSpeechResp(self._data)


class _FakeClient:
    def __init__(self, data):
        self.audio = type("A", (), {"speech": _FakeSpeech(data)})()


async def test_tts_calls_model_and_voice_and_returns_bytes():
    client = _FakeClient(b"\x00\x01\x02")
    tts = TextToSpeech(client=client)
    out = await tts.synthesize("hello there")
    assert out == b"\x00\x01\x02"
    assert client.audio.speech.kwargs["model"] == config.TTS_MODEL
    assert client.audio.speech.kwargs["voice"] == config.TTS_VOICE
    assert client.audio.speech.kwargs["input"] == "hello there"


async def test_stub_tts_returns_fixed_bytes_and_records_text():
    stub = StubTextToSpeech(audio=b"ZZ")
    out = await stub.synthesize("say this")
    assert out == b"ZZ"
    assert stub.last_text == "say this"
