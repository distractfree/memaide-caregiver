import io
import wave

from memaide import config
from memaide.audio.stt import STTEvent, SpeechToText, StubSpeechToText


async def _audio(chunks):
    for c in chunks:
        yield c


class _Event:
    def __init__(self, type, **kw):
        self.type = type
        for k, v in kw.items():
            setattr(self, k, v)


class _FakeStream:
    def __init__(self, events):
        self._events = events

    def __aiter__(self):
        return self._aiter()

    async def _aiter(self):
        for e in self._events:
            yield e


class _FakeTranscriptions:
    def __init__(self, events):
        self._events = events
        self.kwargs = None

    async def create(self, **kwargs):
        self.kwargs = kwargs
        return _FakeStream(self._events)


class _FakeClient:
    def __init__(self, events):
        self.audio = type("A", (), {"transcriptions": _FakeTranscriptions(events)})()


async def test_stt_yields_partial_then_final_and_targets_model():
    events = [
        _Event("transcript.text.delta", delta="I'm "),
        _Event("transcript.text.delta", delta="cold"),
        _Event("transcript.text.done", text="I'm cold"),
    ]
    client = _FakeClient(events)
    stt = SpeechToText(client=client)
    out = [e async for e in stt.transcribe(_audio([b"aa", b"bb"]))]
    assert [(e.kind, e.text) for e in out] == [
        ("partial", "I'm "), ("partial", "cold"), ("final", "I'm cold"),
    ]
    assert client.audio.transcriptions.kwargs["model"] == config.STT_MODEL
    assert client.audio.transcriptions.kwargs["stream"] is True


async def test_stt_assembles_all_audio_chunks_into_one_file():
    client = _FakeClient([_Event("transcript.text.done", text="ok")])
    stt = SpeechToText(client=client)
    _ = [e async for e in stt.transcribe(_audio([b"12", b"34", b"56"]))]
    _name, data = client.audio.transcriptions.kwargs["file"]
    with wave.open(io.BytesIO(data), "rb") as w:
        assert w.readframes(w.getnframes()) == b"123456"


async def test_stt_wraps_pcm_as_wav_with_configured_format():
    # The buffered PCM must be sent as a real WAV container (header + fmt), not
    # headerless bytes, or OpenAI transcription rejects/misreads it.
    client = _FakeClient([_Event("transcript.text.done", text="ok")])
    stt = SpeechToText(client=client)
    _ = [e async for e in stt.transcribe(_audio([b"\x01\x02", b"\x03\x04"]))]
    name, data = client.audio.transcriptions.kwargs["file"]
    assert name.endswith(".wav")
    with wave.open(io.BytesIO(data), "rb") as w:
        assert w.getnchannels() == 1
        assert w.getsampwidth() == 2
        assert w.getframerate() == config.AUDIO_SAMPLE_RATE
        assert w.readframes(w.getnframes()) == b"\x01\x02\x03\x04"


async def test_stub_stt_replays_scripted_events_and_drains_audio():
    drained = []

    async def audio():
        for c in [b"x", b"y"]:
            drained.append(c)
            yield c

    stub = StubSpeechToText([STTEvent("partial", "he"), STTEvent("final", "hello")])
    out = [e async for e in stub.transcribe(audio())]
    assert out == [STTEvent("partial", "he"), STTEvent("final", "hello")]
    assert drained == [b"x", b"y"]
