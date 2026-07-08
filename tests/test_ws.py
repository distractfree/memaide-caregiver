import base64
import json

import pytest

from memaide.audio.stt import STTEvent, StubSpeechToText
from memaide.audio.tts import StubTextToSpeech
from memaide.schemas import AgentDecision, PatientContext, VisionContext
from memaide.server.ws import ServerDeps, _parse, handle
from memaide.service.session_registry import SessionContext, SessionRegistry


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


class _RecordingObserver:
    def __init__(self):
        self.calls = []

    async def on_scene(self, ctx, session, frame_url=None):
        self.calls.append((ctx, frame_url))


async def test_handle_invokes_observer_with_scene_and_frame():
    obs = _RecordingObserver()
    ws = FakeWS([_hello(), _frame(), json.dumps({"type": "bye"})])
    await handle(ws, _deps(observer=obs))

    assert len(obs.calls) == 1
    ctx, frame_url = obs.calls[0]
    assert ctx.label == "kitchen"
    assert frame_url == "data:image/jpeg;base64,QUJD"


async def test_handle_without_observer_is_unaffected():
    ws = FakeWS([_hello(), _frame(), json.dumps({"type": "bye"})])
    await handle(ws, _deps())  # observer defaults to None -> no error
    assert any(m["type"] == "vision_context" for m in ws.sent)


async def test_handle_exits_cleanly_without_hello():
    ws = FakeWS([json.dumps({"type": "frame", "data_url": "x"})])
    await handle(ws, _deps())
    assert ws.sent == []


async def test_handle_records_frames_through_recorder(tmp_path):
    from memaide.server.recorder import FileSessionRecorder

    ws = FakeWS([_hello(), _frame(), json.dumps({"type": "bye"})])
    await handle(
        ws,
        _deps(make_recorder=lambda sid: FileSessionRecorder(sid, tmp_path)),
    )

    session_dir = tmp_path / "s1"
    jpgs = list(session_dir.glob("*.jpg"))
    assert len(jpgs) == 1
    assert jpgs[0].read_bytes() == b"ABC"  # _frame() payload is base64 of "ABC"
    assert (session_dir / "manifest.json").exists()


async def test_handle_defaults_to_no_recording(tmp_path):
    ws = FakeWS([_hello(), _frame(), json.dumps({"type": "bye"})])
    await handle(ws, _deps())  # default NullSessionRecorder
    assert list(tmp_path.iterdir()) == []


class FakeReporter:
    def __init__(self):
        self.escalations = []
        self.concludes = []

    async def escalation(self, session_id, decision):
        self.escalations.append((session_id, decision))

    async def conclude(self, session_id, record, outcome):
        self.concludes.append((session_id, record, outcome))


def _hello_id_only(sid="s1"):
    return json.dumps({"type": "hello", "session_id": sid})


def _registry_with(sid="s1"):
    reg = SessionRegistry(wait_timeout=0.1)
    reg.put_context(
        sid, SessionContext(session_id=sid, patient=PatientContext(patient_id="p1", name="Rose"))
    )
    return reg


async def test_hello_correlates_context_from_registry():
    reg = _registry_with("s1")
    ws = FakeWS([_hello_id_only("s1"), _frame(), json.dumps({"type": "bye"})])
    await handle(ws, _deps(registry=reg))
    assert any(m["type"] == "vision_context" for m in ws.sent)


async def test_unknown_session_closes_with_error():
    reg = SessionRegistry(wait_timeout=0.05)  # no context put
    ws = FakeWS([_hello_id_only("nope"), _frame()])
    await handle(ws, _deps(registry=reg))
    assert ws.sent == [{"type": "error", "text": "unknown session"}]


async def test_bye_concludes_with_patient_ended_and_drops_context():
    reg = _registry_with("s1")
    rep = FakeReporter()
    ws = FakeWS([_hello_id_only("s1"), _frame(), json.dumps({"type": "bye"})])
    await handle(ws, _deps(registry=reg, reporter=rep))
    assert len(rep.concludes) == 1
    sid, record, outcome = rep.concludes[0]
    assert sid == "s1" and outcome == "patient_ended"
    assert record.handoff_type.value == "patient_ended"
    assert await reg.wait_context("s1", timeout=0.01) is None  # dropped


async def test_disconnect_without_bye_concludes_with_disconnected():
    reg = _registry_with("s1")
    rep = FakeReporter()
    ws = FakeWS([_hello_id_only("s1"), _frame()])  # stream ends, no bye
    await handle(ws, _deps(registry=reg, reporter=rep))
    assert rep.concludes[0][2] == "disconnected"
    assert rep.concludes[0][1].handoff_type is None
