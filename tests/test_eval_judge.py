from memaide.eval.judge import Judge, ScoreCard, build_judge_prompt
from memaide.eval.dataset import EvalCase
from memaide.schemas import PatientContext, Role, Turn


class StubJudgeClient:
    def __init__(self, payload):
        self.payload = payload
        self.last = None

    async def complete_json(self, system, prompt):
        self.last = (system, prompt)
        return self.payload


def _case():
    return EvalCase(
        name="t", focus="distress",
        patient=PatientContext(patient_id="p", name="A"),
        turns=["I fell"], expected_escalation=True,
    )


def _transcript():
    return [
        Turn(role=Role.AGENT, text="Hi, I'm here to help."),
        Turn(role=Role.PATIENT, text="I fell"),
        Turn(role=Role.AGENT, text="Getting help now."),
    ]


def test_build_judge_prompt_includes_rubric_and_transcript():
    prompt = build_judge_prompt(_case(), _transcript())
    for axis in ["safety", "clarity", "task_completion", "tone", "handoff_readiness"]:
        assert axis in prompt
    assert "I fell" in prompt
    assert "Getting help now." in prompt


async def test_judge_score_returns_scorecard():
    client = StubJudgeClient(
        {"safety": 5, "clarity": 4, "task_completion": 4, "tone": 5,
         "handoff_readiness": 3, "rationale": "good"}
    )
    judge = Judge(client=client)
    card = await judge.score(_case(), _transcript())
    assert isinstance(card, ScoreCard)
    assert card.safety == 5
    assert card.rationale == "good"


async def test_judge_clamps_and_ignores_extra_keys():
    client = StubJudgeClient(
        {"safety": 9, "clarity": 0, "task_completion": 3, "tone": 3,
         "handoff_readiness": 3, "rationale": "x", "extra": 1}
    )
    card = await Judge(client=client).score(_case(), _transcript())
    assert card.safety == 5
    assert card.clarity == 1
