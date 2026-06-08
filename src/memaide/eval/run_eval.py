"""Run the agent over the eval dataset, score with the judge, and report."""

import asyncio
from typing import Any, Callable

from pydantic import BaseModel

from memaide.agent.brain import AgentBrain
from memaide.agent.session import AgentSession
from memaide.eval.dataset import EVAL_CASES, EvalCase
from memaide.eval.judge import Judge, ScoreCard
from memaide.io.openai_client import OpenAIClient
from memaide.schemas import HandoffType, PatientContext, Turn

_AXES = ["safety", "clarity", "task_completion", "tone", "handoff_readiness"]


class CaseResult(BaseModel):
    name: str
    focus: str
    escalated: bool
    expected_escalation: bool
    escalation_correct: bool
    scores: ScoreCard
    transcript: list[Turn]


async def run_case(
    case: EvalCase,
    brain_factory: Callable[[PatientContext], Any],
    judge: Judge,
) -> CaseResult:
    session = AgentSession(brain=brain_factory(case.patient), patient=case.patient)
    session.start()
    for i, text in enumerate(case.turns):
        vision = case.visions[i] if case.visions else None
        await session.handle_patient_input(text, vision=vision)
    session.stop(HandoffType.TIMEOUT)

    scores = await judge.score(case, session.transcript)
    return CaseResult(
        name=case.name,
        focus=case.focus,
        escalated=session.escalated,
        expected_escalation=case.expected_escalation,
        escalation_correct=(session.escalated == case.expected_escalation),
        scores=scores,
        transcript=session.transcript,
    )


def summarize(results: list[CaseResult]) -> dict:
    n = len(results)
    avg = {
        axis: round(sum(getattr(r.scores, axis) for r in results) / n, 3)
        for axis in _AXES
    }
    accuracy = sum(1 for r in results if r.escalation_correct) / n
    return {"n": n, "avg": avg, "escalation_accuracy": round(accuracy, 3)}


async def main() -> None:
    openai_client = OpenAIClient()
    judge = Judge()

    def brain_factory(patient: PatientContext) -> AgentBrain:
        return AgentBrain(client=openai_client, patient=patient)

    results = [await run_case(case, brain_factory, judge) for case in EVAL_CASES]

    print(f"{'case':<22}{'focus':<12}{'esc?':<6}{'ok?':<5}" + "".join(f"{a[:4]:>6}" for a in _AXES))
    for r in results:
        scores = "".join(f"{getattr(r.scores, a):>6}" for a in _AXES)
        print(f"{r.name:<22}{r.focus:<12}{str(r.escalated):<6}{str(r.escalation_correct):<5}{scores}")

    summary = summarize(results)
    print("\nSummary:", summary)


if __name__ == "__main__":
    asyncio.run(main())
