from datetime import datetime, timezone

from memaide.agent.session import AgentSession
from memaide.safety.escalation import EscalationMonitor
from memaide.schemas import (
    HandoffType,
    PatientContext,
    Role,
    SessionStatus,
    VisionContext,
)


class StubBrain:
    def __init__(self, decision):
        self.decision = decision

    async def respond(self, transcript, vision=None):
        return self.decision


def _decision(reply="I'm here.", escalate=False, handoff=False, intent="reassure"):
    from memaide.schemas import AgentDecision

    return AgentDecision(reply_text=reply, wants_escalation=escalate,
                         handoff_ready=handoff, intent=intent)


def _fixed_clock():
    ts = datetime(2026, 6, 6, 12, 0, 0, tzinfo=timezone.utc)
    return lambda: ts


def _session(brain, monitor=None):
    return AgentSession(
        brain=brain,
        patient=PatientContext(patient_id="p1", name="Rose"),
        escalation_monitor=monitor or EscalationMonitor(),
        session_id="s1",
        related_caretaker_id="c1",
        clock=_fixed_clock(),
    )


def test_start_speaks_first_with_opening_line():
    s = _session(StubBrain(_decision()))
    opening = s.start()
    assert opening.role == Role.AGENT
    assert opening.text.endswith("?")
    assert s.transcript == [opening]


async def test_handle_patient_input_appends_patient_then_agent():
    s = _session(StubBrain(_decision(reply="I'm right here.")))
    s.start()
    agent_turn = await s.handle_patient_input("I'm scared")
    assert s.transcript[1].role == Role.PATIENT
    assert s.transcript[1].text == "I'm scared"
    assert s.transcript[2] is agent_turn
    assert agent_turn.role == Role.AGENT
    assert "I'm right here." in agent_turn.text


async def test_rule_based_escalation_sets_flag_and_appends_suggestion():
    s = _session(StubBrain(_decision(reply="Okay.")))
    s.start()
    agent_turn = await s.handle_patient_input("I have chest pain")
    assert s.escalated is True
    assert "911" in agent_turn.text


async def test_brain_requested_escalation_also_escalates():
    s = _session(StubBrain(_decision(reply="Okay.", escalate=True)))
    s.start()
    await s.handle_patient_input("I feel a bit off")
    assert s.escalated is True


async def test_vision_label_recorded_as_final_scene_label():
    s = _session(StubBrain(_decision()))
    s.start()
    vision = VisionContext(description="seated calmly", label="seated")
    await s.handle_patient_input("hello", vision=vision)
    rec = s.stop(HandoffType.PATIENT_RESOLVED)
    assert rec.final_scene_label == "seated"


def test_stop_caregiver_joined_sets_handoff_at():
    s = _session(StubBrain(_decision()))
    s.start()
    rec = s.stop(HandoffType.CAREGIVER_JOINED)
    assert rec.status == SessionStatus.ENDED
    assert rec.handoff_type == HandoffType.CAREGIVER_JOINED
    assert rec.handoff_at is not None
    assert rec.ended_at is not None


def test_stop_timeout_has_no_handoff_at():
    s = _session(StubBrain(_decision()))
    s.start()
    rec = s.stop(HandoffType.TIMEOUT)
    assert rec.handoff_at is None
    assert rec.handoff_type == HandoffType.TIMEOUT
    assert rec.id == "s1"
    assert rec.patient_id == "p1"
    assert rec.related_caretaker_id == "c1"
