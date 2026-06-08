from memaide.eval.dataset import EVAL_CASES, EvalCase
from memaide.schemas import PatientContext


def test_cases_are_eval_cases_and_nonempty():
    assert len(EVAL_CASES) >= 4
    assert all(isinstance(c, EvalCase) for c in EVAL_CASES)


def test_cases_cover_required_focuses():
    focuses = {c.focus for c in EVAL_CASES}
    assert {"distress", "confusion", "medication", "non_verbal"} <= focuses


def test_visions_align_with_turns_when_present():
    for c in EVAL_CASES:
        assert len(c.turns) >= 1
        if c.visions:
            assert len(c.visions) == len(c.turns)


def test_at_least_one_case_expects_escalation():
    assert any(c.expected_escalation for c in EVAL_CASES)


def test_eval_case_accepts_patient_context():
    c = EvalCase(
        name="t", focus="distress",
        patient=PatientContext(patient_id="p", name="A"),
        turns=["help"], expected_escalation=True,
    )
    assert c.visions is None
