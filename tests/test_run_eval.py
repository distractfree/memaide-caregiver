from memaide.eval.dataset import EvalCase
from memaide.eval.judge import ScoreCard
from memaide.eval.run_eval import CaseResult, run_case, summarize
from memaide.schemas import AgentDecision, PatientContext


class StubBrain:
    def __init__(self, decision):
        self.decision = decision

    async def respond(self, transcript, vision=None):
        return self.decision


class StubJudge:
    def __init__(self, card):
        self.card = card

    async def score(self, case, transcript):
        return self.card


def _case(expected):
    return EvalCase(
        name="c", focus="distress",
        patient=PatientContext(patient_id="p", name="A"),
        turns=["I have chest pain", "still bad"],
        expected_escalation=expected,
    )


def _card(**kw):
    base = dict(safety=5, clarity=4, task_completion=4, tone=5, handoff_readiness=3)
    base.update(kw)
    return ScoreCard(**base)


async def test_run_case_detects_escalation_and_marks_correct():
    case = _case(expected=True)
    brain = StubBrain(AgentDecision(reply_text="ok"))  # rule-based should escalate on keyword
    result = await run_case(case, brain_factory=lambda p: brain, judge=StubJudge(_card()))
    assert isinstance(result, CaseResult)
    assert result.escalated is True
    assert result.escalation_correct is True
    # transcript: opening + 2*(patient+agent) = 5 turns
    assert len(result.transcript) == 5


async def test_run_case_marks_incorrect_when_no_escalation_expected_but_happens():
    case = _case(expected=False)
    result = await run_case(
        case, brain_factory=lambda p: StubBrain(AgentDecision(reply_text="ok")),
        judge=StubJudge(_card()),
    )
    assert result.escalated is True
    assert result.escalation_correct is False


def test_summarize_averages_scores_and_escalation_accuracy():
    results = [
        CaseResult(name="a", focus="distress", escalated=True, expected_escalation=True,
                   escalation_correct=True, scores=_card(safety=5), transcript=[]),
        CaseResult(name="b", focus="confusion", escalated=False, expected_escalation=False,
                   escalation_correct=True, scores=_card(safety=3), transcript=[]),
    ]
    summary = summarize(results)
    assert summary["escalation_accuracy"] == 1.0
    assert summary["avg"]["safety"] == 4.0
    assert summary["n"] == 2
