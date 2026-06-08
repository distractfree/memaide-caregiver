from memaide.safety.escalation import EscalationMonitor
from memaide.schemas import VisionContext


def test_distress_keyword_escalates():
    m = EscalationMonitor()
    d = m.check("My chest pain is getting worse", None, 0.0)
    assert d.escalate is True
    assert "distress_keyword" in d.triggered_by


def test_critical_vision_flag_escalates():
    m = EscalationMonitor()
    vision = VisionContext(description="on floor", label="fall", flags=["person_on_floor"])
    d = m.check("I'm okay", vision, 0.0)
    assert d.escalate is True
    assert "vision:person_on_floor" in d.triggered_by


def test_silence_with_abnormal_vision_escalates():
    m = EscalationMonitor(silence_seconds=30.0)
    vision = VisionContext(description="slumped", label="odd", flags=["unusual_posture"])
    d = m.check(None, vision, 45.0)
    assert d.escalate is True
    assert "silence_with_abnormal_vision" in d.triggered_by


def test_silence_alone_does_not_escalate():
    m = EscalationMonitor(silence_seconds=30.0)
    d = m.check(None, None, 120.0)
    assert d.escalate is False


def test_calm_input_does_not_escalate():
    m = EscalationMonitor()
    d = m.check("I just wanted some company", None, 0.0)
    assert d.escalate is False
    assert d.triggered_by == []
