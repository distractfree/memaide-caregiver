"""End-to-end (in-process) smoke of the Part A bridge path: a frame flowing through
handle() -> pipeline -> sink -> VisionObserver -> FramePreviewWriter + escalation notify.

Only the LLM describer and the socket are faked; everything else is the real wiring.
"""

import base64
import json

from memaide import config
from memaide.audio.stt import StubSpeechToText
from memaide.audio.tts import StubTextToSpeech
from memaide.schemas import AgentDecision, VisionContext
from memaide.server.frame_preview import FramePreviewWriter
from memaide.server.vision_observer import VisionObserver
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


class _FloorDescriber:
    async def describe(self, frame):
        return VisionContext(
            description="An older person is lying on the kitchen floor.",
            label="person on floor",
            advisory_flags=["person_on_floor", "no_motion"],
        )


class _Brain:
    async def respond(self, transcript, vision=None):
        return AgentDecision(reply_text="ok")


def _promote(ctx):
    return sorted(set(ctx.advisory_flags) & config.CRITICAL_VISION_FLAGS)


def _hello():
    return json.dumps({"type": "hello", "session_id": "s1",
                       "patient": {"patient_id": "p1", "name": "Rose"}})


def _frame():
    payload = base64.b64encode(b"REALJPEGBYTES").decode("ascii")
    return json.dumps({"type": "frame", "data_url": "data:image/jpeg;base64," + payload})


async def test_floor_frame_writes_preview_and_fires_notify(tmp_path):
    notified = []
    observer = VisionObserver(
        notify=lambda decision, ctx: notified.append(decision),
        preview=FramePreviewWriter(tmp_path),
        flag_source=_promote,
    )
    deps = ServerDeps(
        describer=_FloorDescriber(),
        stt=StubSpeechToText([]),
        tts=StubTextToSpeech(audio=b""),
        make_brain=lambda patient: _Brain(),
        interval=0.0,
        observer=observer,
    )
    ws = FakeWS([_hello(), _frame(), json.dumps({"type": "bye"})])
    await handle(ws, deps)

    # Escalation fired exactly once, driven by the promoted advisory flag.
    assert len(notified) == 1
    assert "vision:person_on_floor" in notified[0].triggered_by

    # Live-preview snapshot written from the actual frame bytes + trace.
    assert (tmp_path / "latest.jpg").read_bytes() == b"REALJPEGBYTES"
    meta = json.loads((tmp_path / "latest.json").read_text())
    assert meta["label"] == "person on floor"
    assert meta["escalate"] is True
