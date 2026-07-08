from datetime import datetime, timezone

from memaide.schemas import EscalationDecision, HandoffType, Role, SessionRecord, Turn
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
    assert fc.calls[0]["url"] == "http://koko:4000/ai-sessions/s1/escalation"
    assert fc.calls[0]["json"] == {"reason": "fell", "triggered_by": ["vision"]}
    assert fc.calls[0]["headers"] == {"X-Api-Key": "k"}


async def test_conclude_posts_record_plus_outcome():
    fc = FakeClient()
    rep = KokoReporter(base_url="http://koko:4000", client=fc)
    await rep.conclude("s1", _record(), "patient_ended")
    body = fc.calls[0]["json"]
    assert fc.calls[0]["url"] == "http://koko:4000/ai-sessions/s1/conclude"
    assert body["outcome"] == "patient_ended"
    assert body["transcript"][0]["text"] == "I fell"
    assert body["escalated"] is True


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
