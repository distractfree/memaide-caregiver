from datetime import datetime, timezone

from memaide.schemas import (
    AgentDecision,
    EscalationDecision,
    HandoffType,
    PatientContext,
    Role,
    SessionRecord,
    SessionStatus,
    Turn,
    VisionContext,
)


def test_patient_context_defaults():
    p = PatientContext(patient_id="p1", name="Rose")
    assert p.preferred_name is None
    assert p.known_conditions == []
    assert p.language == "en"


def test_turn_autostamps_and_serializes():
    t = Turn(role=Role.PATIENT, text="hello")
    assert isinstance(t.ts, datetime)
    dumped = t.model_dump()
    assert dumped["role"] == "patient"
    assert dumped["text"] == "hello"


def test_agent_decision_ignores_extra_keys_and_defaults():
    d = AgentDecision.model_validate(
        {"reply_text": "ok", "wants_escalation": True, "unknown": 1}
    )
    assert d.reply_text == "ok"
    assert d.wants_escalation is True
    assert d.handoff_ready is False
    assert d.intent == "assist"


def test_escalation_decision():
    e = EscalationDecision(escalate=True, reason="distress", triggered_by=["distress_keyword"])
    assert e.escalate is True
    assert e.triggered_by == ["distress_keyword"]


def test_session_record_roundtrip():
    now = datetime.now(timezone.utc)
    rec = SessionRecord(
        id="s1",
        patient_id="p1",
        started_at=now,
        transcript=[Turn(role=Role.AGENT, text="hi", ts=now)],
    )
    assert rec.status == SessionStatus.ACTIVE
    assert rec.escalated is False
    assert rec.handoff_type is None
    data = rec.model_dump()
    assert data["transcript"][0]["text"] == "hi"
    assert HandoffType.CAREGIVER_JOINED.value == "caregiver_joined"
    assert VisionContext(description="d", label="l").flags == []
