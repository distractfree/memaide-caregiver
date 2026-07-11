import base64
import json

import pytest

from memaide import config
from memaide.audio.stt import STTEvent, StubSpeechToText
from memaide.audio.tts import StubTextToSpeech
from memaide.schemas import AgentDecision, PatientContext, VisionContext
from memaide.server.ws import ServerDeps, WebSocketAudioSource, _parse, handle
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


async def test_audio_source_segments_utterances_on_end():
    src = WebSocketAudioSource()
    await src.put(b"aa")
    await src.put(b"bb")
    await src.end_utterance()  # client sent audio_end -> close utterance 1
    await src.put(b"cc")
    await src.close()  # connection closed -> flush utterance 2 + end stream
    collected = []
    async for utt in src.utterances():
        collected.append(b"".join([c async for c in utt]))
    assert collected == [b"aabb", b"cc"]


async def test_audio_source_no_audio_yields_no_utterances():
    src = WebSocketAudioSource()
    await src.close()
    assert [u async for u in src.utterances()] == []


async def test_audio_source_ignores_empty_utterance_markers():
    # audio_end with no preceding audio must not create a phantom empty utterance.
    src = WebSocketAudioSource()
    await src.end_utterance()
    await src.put(b"aa")
    await src.close()
    collected = [b"".join([c async for c in utt]) async for utt in src.utterances()]
    assert collected == [b"aa"]


async def test_audio_source_commit_marker_is_ordered_after_utterance():
    from memaide.server.voice_loop import COMMIT

    src = WebSocketAudioSource()
    await src.put(b"aa")
    await src.end_utterance()   # client sent audio_end -> close utterance 1
    await src.commit()          # client sent commit -> ordered turn-over marker
    await src.put(b"bb")
    await src.close()

    items = []
    async for item in src.utterances():
        if item is COMMIT:
            items.append("COMMIT")
        else:
            items.append(b"".join([c async for c in item]))
    assert items == [b"aa", "COMMIT", b"bb"]  # marker sits between the two utterances


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
    # Skip the opening-line subtitle; the brain's reply to the audio is also present.
    assert any(m["type"] == "subtitle" and "I'm here." in m["text"] for m in ws.sent)


async def test_handle_speaks_opening_line_on_connect():
    # Agent greets first, before any audio arrives (hello then bye, no audio at all).
    ws = FakeWS([_hello(), json.dumps({"type": "bye"})])
    await handle(ws, _deps())

    subs = [m for m in ws.sent if m["type"] == "subtitle"]
    assert any(m["text"] == config.OPENING_LINE for m in subs)
    assert any(m["type"] == "audio_out" for m in ws.sent)


async def test_commit_yields_one_reply_per_turn():
    ws = FakeWS(
        [
            _hello(),
            _audio(), json.dumps({"type": "audio_end"}), json.dumps({"type": "commit"}),
            _audio(), json.dumps({"type": "audio_end"}), json.dumps({"type": "commit"}),
            json.dumps({"type": "bye"}),
        ]
    )
    await handle(ws, _deps())

    audio_outs = [m for m in ws.sent if m["type"] == "audio_out"]
    assert len(audio_outs) == 3  # 1 opening greeting + 1 reply per committed turn


async def test_utterances_without_commit_are_spoken_as_one_reply():
    # Two audio_end utterances then a single commit -> one concatenated spoken reply.
    ws = FakeWS(
        [
            _hello(),
            _audio(), json.dumps({"type": "audio_end"}),
            _audio(), json.dumps({"type": "audio_end"}),
            json.dumps({"type": "commit"}),
            json.dumps({"type": "bye"}),
        ]
    )
    await handle(ws, _deps())

    audio_outs = [m for m in ws.sent if m["type"] == "audio_out"]
    assert len(audio_outs) == 2  # greeting + one concatenated reply for the whole turn


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


class FakeNotifier:
    def __init__(self):
        self.calls = []

    async def notify(self, session_id, patient_name, caregiver, decision):
        self.calls.append((session_id, patient_name, caregiver, decision))


async def test_escalation_invokes_notifier_with_caregiver():
    from memaide.service.schemas import CaregiverInfo

    reg = SessionRegistry()
    reg.put_context(
        "s1",
        SessionContext(
            session_id="s1",
            patient=PatientContext(patient_id="p1", name="Rose"),
            caregiver=CaregiverInfo(name="Anthony", phone="+15551234567"),
        ),
    )
    notifier = FakeNotifier()
    ws = FakeWS([_hello(), _audio(), json.dumps({"type": "bye"})])
    deps = _deps(
        stt=StubSpeechToText([STTEvent("final", "I can't breathe")]),
        registry=reg,
        notifier=notifier,
    )
    await handle(ws, deps)

    assert len(notifier.calls) == 1
    session_id, patient_name, caregiver, decision = notifier.calls[0]
    assert session_id == "s1"
    assert patient_name == "Rose"
    assert caregiver.name == "Anthony"
    assert decision.escalate is True


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
