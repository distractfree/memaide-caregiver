from datetime import datetime, timezone

from memaide.schemas import EscalationDecision, HandoffType, Role, SessionRecord, Turn, VisionContext
from memaide.service.koko_reporter import KokoReporter


class FakeClient:
    def __init__(self, raises=False):
        self.calls = []
        self._raises = raises

    async def post(self, url, json=None, headers=None):
        self.calls.append({"url": url, "json": json, "headers": headers})
        if self._raises:
            raise RuntimeError("boom")


def _record():
    return SessionRecord(
        id="s1",
        patient_id="p1",
        started_at=datetime(2026, 7, 7, tzinfo=timezone.utc),
        ended_at=datetime(2026, 7, 7, tzinfo=timezone.utc),
        handoff_type=HandoffType.PATIENT_ENDED,
        transcript=[Turn(role=Role.PATIENT, text="I fell")],
        escalated=True,
    )


def test_disabled_when_no_base_url():
    assert KokoReporter(base_url=None).enabled is False


def test_enabled_with_base_url():
    assert KokoReporter(base_url="http://koko:4000").enabled is True


async def test_escalation_posts_reason_and_triggered_by():
    fc = FakeClient()
    rep = KokoReporter(base_url="http://koko:4000", api_key="k", client=fc)
    await rep.escalation("s1", EscalationDecision(escalate=True, reason="fell", triggered_by=["vision"]))
    assert fc.calls[0]["url"] == "http://koko:4000/api/ai-sessions/s1/escalation"
    assert fc.calls[0]["json"] == {"reason": "fell", "triggered_by": ["vision"]}
    assert fc.calls[0]["headers"] == {"X-Api-Key": "k"}


async def test_conclude_posts_record_plus_outcome():
    fc = FakeClient()
    rep = KokoReporter(base_url="http://koko:4000", client=fc)
    await rep.conclude("s1", _record(), "patient_ended")
    body = fc.calls[0]["json"]
    assert fc.calls[0]["url"] == "http://koko:4000/api/ai-sessions/s1/conclude"
    assert body["outcome"] == "patient_ended"
    assert body["transcript"][0]["text"] == "I fell"
    assert body["escalated"] is True


async def test_conclude_includes_caregiver_summary_when_given():
    fc = FakeClient()
    rep = KokoReporter(base_url="http://koko:4000", client=fc)
    await rep.conclude("s1", _record(), "patient_ended", summary="  She fell in the kitchen.  ")
    assert fc.calls[0]["json"]["summary"] == "She fell in the kitchen."


async def test_conclude_omits_summary_when_absent_or_blank():
    for summary in (None, "", "   "):
        fc = FakeClient()
        rep = KokoReporter(base_url="http://koko:4000", client=fc)
        await rep.conclude("s1", _record(), "patient_ended", summary=summary)
        assert "summary" not in fc.calls[0]["json"]


async def test_no_op_when_disabled_does_not_call_client():
    fc = FakeClient()
    rep = KokoReporter(base_url=None, client=fc)
    await rep.escalation("s1", EscalationDecision(escalate=True))
    await rep.conclude("s1", _record(), "disconnected")
    assert fc.calls == []


async def test_post_failure_is_swallowed():
    fc = FakeClient(raises=True)
    rep = KokoReporter(base_url="http://koko:4000", client=fc)
    await rep.escalation("s1", EscalationDecision(escalate=True))  # must not raise


def _ctx():
    return VisionContext(
        description="An older adult seated at a kitchen table.",
        label="kitchen",
        ts=datetime(2026, 7, 14, 18, 22, 5, tzinfo=timezone.utc),
        flags=["person_seated"],
        advisory_flags=[],
    )


async def test_frame_posts_image_and_vision():
    fc = FakeClient()
    rep = KokoReporter(base_url="http://koko:4000", api_key="k", client=fc)
    await rep.frame("s1", _ctx(), "data:image/jpeg;base64,QUJD", 42)
    call = fc.calls[0]
    assert call["url"] == "http://koko:4000/api/ai-sessions/s1/frames"
    assert call["headers"] == {"X-Api-Key": "k"}
    body = call["json"]
    assert body["seq"] == 42
    assert body["ts"] == "2026-07-14T18:22:05+00:00"
    assert body["image"] == {"mime": "image/jpeg", "b64": "QUJD"}
    assert body["vision"] == {
        "description": "An older adult seated at a kitchen table.",
        "label": "kitchen",
        "flags": ["person_seated"],
        "advisory_flags": [],
    }


async def test_frame_strips_data_url_prefix():
    fc = FakeClient()
    rep = KokoReporter(base_url="http://koko:4000", client=fc)
    await rep.frame("s1", _ctx(), "data:image/jpeg;base64,SGVsbG8=", 0)
    assert fc.calls[0]["json"]["image"]["b64"] == "SGVsbG8="


async def test_frame_omits_image_when_frame_url_none():
    fc = FakeClient()
    rep = KokoReporter(base_url="http://koko:4000", client=fc)
    await rep.frame("s1", _ctx(), None, 7)
    body = fc.calls[0]["json"]
    assert "image" not in body
    assert body["seq"] == 7
    assert body["vision"]["label"] == "kitchen"


async def test_frame_no_op_when_disabled():
    fc = FakeClient()
    rep = KokoReporter(base_url=None, client=fc)
    await rep.frame("s1", _ctx(), "data:image/jpeg;base64,QUJD", 1)
    assert fc.calls == []


async def test_frame_failure_is_swallowed():
    fc = FakeClient(raises=True)
    rep = KokoReporter(base_url="http://koko:4000", client=fc)
    await rep.frame("s1", _ctx(), None, 0)  # must not raise
