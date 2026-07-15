"""The ws ``sink`` streams each described frame to koko via ``reporter.frame``."""

import json

from memaide.audio.stt import STTEvent, StubSpeechToText
from memaide.audio.tts import StubTextToSpeech
from memaide.schemas import AgentDecision, VisionContext
from memaide.server.ws import ServerDeps, handle


class FakeWS:
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


class _FrameReporter:
    """Records only frame() calls; escalation/conclude are no-op stubs."""

    def __init__(self):
        self.frames = []

    async def frame(self, session_id, ctx, frame_url, seq):
        self.frames.append((session_id, ctx, frame_url, seq))

    async def escalation(self, session_id, decision):
        pass

    async def conclude(self, session_id, record, outcome):
        pass


def _deps(**kw):
    base = dict(
        describer=_StubDescriber(),
        stt=StubSpeechToText([STTEvent("final", "hi")]),
        tts=StubTextToSpeech(audio=b"WAV"),
        make_brain=lambda patient: _StubBrain(),
        interval=0.0,
    )
    base.update(kw)
    return ServerDeps(**base)


def _hello(sid="s1"):
    return json.dumps(
        {"type": "hello", "session_id": sid, "patient": {"patient_id": "p1", "name": "Rose"}}
    )


def _frame():
    return json.dumps({"type": "frame", "data_url": "data:image/jpeg;base64,QUJD"})


async def test_sink_reports_each_described_frame_with_incrementing_seq():
    rep = _FrameReporter()
    ws = FakeWS([_hello(), _frame(), _frame(), json.dumps({"type": "bye"})])
    await handle(ws, _deps(reporter=rep))

    assert len(rep.frames) == 2
    assert [f[0] for f in rep.frames] == ["s1", "s1"]
    assert [f[3] for f in rep.frames] == [0, 1]  # monotonic per-session seq
    _, ctx, frame_url, _ = rep.frames[0]
    assert ctx.label == "kitchen"
    assert frame_url == "data:image/jpeg;base64,QUJD"


async def test_sink_does_not_report_without_reporter():
    # reporter defaults to None -> no frame reporting, no error.
    ws = FakeWS([_hello(), _frame(), json.dumps({"type": "bye"})])
    await handle(ws, _deps())  # no reporter
    assert any(m["type"] == "vision_context" for m in ws.sent)
