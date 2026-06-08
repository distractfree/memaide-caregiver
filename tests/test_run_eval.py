import json

from memaide.eval.dataset import EvalCase
from memaide.eval.judge import ScoreCard
from memaide.eval.run_eval import (
    RUBRIC,
    CaseResult,
    CaseTranscript,
    export,
    run_agent_case,
    run_case,
    summarize,
    to_markdown,
)
from memaide.schemas import AgentDecision, PatientContext, Role, Turn


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


# --- agent run (OpenAI only, no judge) ---

async def test_run_agent_case_produces_transcript_without_judge():
    case = _case(expected=True)  # rule-based escalates on "chest pain"
    ct = await run_agent_case(
        case, brain_factory=lambda p: StubBrain(AgentDecision(reply_text="ok"))
    )
    assert isinstance(ct, CaseTranscript)
    assert ct.escalated is True
    assert ct.escalation_correct is True
    # transcript: opening + 2*(patient+agent) = 5 turns
    assert len(ct.transcript) == 5


async def test_run_agent_case_marks_mismatch():
    case = _case(expected=False)
    ct = await run_agent_case(
        case, brain_factory=lambda p: StubBrain(AgentDecision(reply_text="ok"))
    )
    assert ct.escalated is True
    assert ct.escalation_correct is False


# --- export for in-chat scoring ---

def test_to_markdown_includes_rubric_and_transcript():
    ct = CaseTranscript(
        name="fall", focus="distress", escalated=True, expected_escalation=True,
        escalation_correct=True, transcript=[Turn(role=Role.PATIENT, text="I fell")],
    )
    md = to_markdown([ct])
    assert "safety" in md.lower()   # rubric present
    assert "I fell" in md           # transcript content
    assert "fall" in md             # case name


def test_export_writes_json_and_markdown(tmp_path):
    ct = CaseTranscript(
        name="c", focus="distress", escalated=False, expected_escalation=False,
        escalation_correct=True, transcript=[Turn(role=Role.AGENT, text="hi")],
    )
    json_path = tmp_path / "out" / "t.json"
    md_path = tmp_path / "out" / "t.md"
    export([ct], json_path, md_path)
    data = json.loads(json_path.read_text(encoding="utf-8"))
    assert data[0]["name"] == "c"
    assert data[0]["transcript"][0]["text"] == "hi"
    assert "hi" in md_path.read_text(encoding="utf-8")


def test_rubric_lists_all_axes():
    for axis in ["safety", "clarity", "task_completion", "tone", "handoff_readiness"]:
        assert axis in RUBRIC


# --- optional API-judge path still works ---

async def test_run_case_detects_escalation_and_marks_correct():
    case = _case(expected=True)
    brain = StubBrain(AgentDecision(reply_text="ok"))
    result = await run_case(case, brain_factory=lambda p: brain, judge=StubJudge(_card()))
    assert isinstance(result, CaseResult)
    assert result.escalated is True
    assert result.escalation_correct is True
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
