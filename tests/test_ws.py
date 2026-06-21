import base64
import json

from memaide.audio.stt import STTEvent, StubSpeechToText
from memaide.audio.tts import StubTextToSpeech
from memaide.schemas import AgentDecision, VisionContext
from memaide.server.ws import ServerDeps, _parse, handle


class FakeWS:
    """Async-iterable fake: a single shared message iterator + recorded sends."""

    def __init__(self, messages):
        self._it = iter(messages)
        self.sent = []

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            return next(self._it)
        except StopIteration:
            raise StopAsyncIteration

    async def send(self, msg):
        self.sent.append(json.loads(msg))


class _StubDescriber:
    async def describe(self, frame):
        return VisionContext(
            description="a kitchen", label="kitchen", advisory_flags=["tv_on"]
        )


class _StubBrain:
    async def respond(self, transcript, vision=None):
        return AgentDecision(reply_text="I'm here.")


def _deps(**kw):
    base = dict(
        describer=_StubDescriber(),
        stt=StubSpeechToText([STTEvent("final", "I'm cold")]),
        tts=StubTextToSpeech(audio=b"WAV"),
        make_brain=lambda patient: _StubBrain(),
        interval=0.0,
    )
    base.update(kw)
    return ServerDeps(**base)


def _hello():
    return json.dumps(
        {"type": "hello", "session_id": "s1",
         "patient": {"patient_id": "p1", "name": "Rose"}}
    )


def _frame():
    return json.dumps({"type": "frame", "data_url": "data:image/jpeg;base64,QUJD"})


def _audio():
    return json.dumps({"type": "audio", "pcm": base64.b64encode(b"xx").decode("ascii")})


def test_parse_ignores_malformed_and_non_dict():
    assert _parse("not json") is None
    assert _parse(json.dumps([1, 2])) is None
    assert _parse(json.dumps({"type": "frame"}))["type"] == "frame"


async def test_handle_demuxes_streams_and_emits_outputs():
    ws = FakeWS([_hello(), _frame(), "GARBAGE", _audio(), json.dumps({"type": "bye"})])
    await handle(ws, _deps())

    types = [m["type"] for m in ws.sent]
    assert "vision_context" in types
    assert "subtitle" in types
    assert "audio_out" in types
    vc = next(m for m in ws.sent if m["type"] == "vision_context")
    assert vc["label"] == "kitchen"
    assert vc["advisory_flags"] == ["tv_on"]
    sub = next(m for m in ws.sent if m["type"] == "subtitle")
    assert "I'm here." in sub["text"]


async def test_handle_exits_cleanly_without_hello():
    ws = FakeWS([json.dumps({"type": "frame", "data_url": "x"})])
    await handle(ws, _deps())
    assert ws.sent == []
