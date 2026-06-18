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


def test_negated_distress_keyword_does_not_escalate():
    # A patient ruling a symptom OUT must not trip the keyword monitor. This is the
    # caregiver_bridging eval false alarm: "no chest pain" substring-matched "chest pain".
    m = EscalationMonitor()
    d = m.check("No chest pain, and I can breathe alright", None, 0.0)
    assert d.escalate is False
    assert d.triggered_by == []


def test_negation_does_not_suppress_a_real_emergency():
    # "No" here answers a question; it is comma-separated and does not negate the
    # symptom. A real emergency must still escalate.
    m = EscalationMonitor()
    d = m.check("No, I can't breathe", None, 0.0)
    assert d.escalate is True
    assert "distress_keyword" in d.triggered_by


def test_unnegated_keyword_after_a_negated_one_still_escalates():
    m = EscalationMonitor()
    d = m.check("No chest pain earlier, but now my chest pain is back", None, 0.0)
    assert d.escalate is True
