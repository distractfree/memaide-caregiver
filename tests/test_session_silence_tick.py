from datetime import datetime, timezone

from memaide.agent.session import AgentSession
from memaide.schemas import PatientContext, Role, VisionContext


class _NoBrain:
    async def respond(self, transcript, vision=None):
        raise AssertionError("brain must not be called on a silence tick")


def _session():
    return AgentSession(
        brain=_NoBrain(),
        patient=PatientContext(patient_id="p1", name="Rose"),
        session_id="s1",
        clock=lambda: datetime(2026, 6, 6, 12, 0, tzinfo=timezone.utc),
    )


async def test_silence_tick_escalates_on_silence_plus_abnormal_vision():
    s = _session()
    s.start()
    vision = VisionContext(
        description="on the floor", label="floor", flags=["person_on_floor"]
    )
    turn = s.on_silence_tick(60.0, vision)
    assert turn is not None
    assert turn.role == Role.AGENT
    assert "911" in turn.text
    assert s.escalated is True
    assert s.transcript[-1] is turn
    assert s.last_escalation.escalate is True


async def test_silence_tick_noop_without_abnormal_vision():
    s = _session()
    s.start()
    calm = VisionContext(description="seated", label="seated")  # no flags
    assert s.on_silence_tick(60.0, calm) is None
    assert s.escalated is False


async def test_silence_tick_noop_when_not_silent_long_enough():
    s = _session()
    s.start()
    # tv_on is non-critical, so only the silence+vision rule could fire; 1s < 30s.
    room = VisionContext(description="tv on", label="room", flags=["tv_on"])
    assert s.on_silence_tick(1.0, room) is None
    assert s.escalated is False
