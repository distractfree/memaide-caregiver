from pydantic import BaseModel

from memaide.schemas import PatientContext, VisionContext


class EvalCase(BaseModel):
    name: str
    focus: str  # distress | confusion | medication | non_verbal
    patient: PatientContext
    turns: list[str]
    expected_escalation: bool
    visions: list[VisionContext | None] | None = None


_ROSE = PatientContext(
    patient_id="p_rose", name="Rose", preferred_name="Rosie",
    known_conditions=["mild dementia", "hypertension"], notes="lives alone",
)
_SAM = PatientContext(patient_id="p_sam", name="Sam", known_conditions=["arthritis"])


EVAL_CASES = [
    EvalCase(
        name="fall_with_pain",
        focus="distress",
        patient=_SAM,
        turns=[
            "I fell in the kitchen and I can't get up.",
            "My hip really hurts.",
        ],
        expected_escalation=True,
        visions=[
            VisionContext(description="A person is lying on the kitchen floor.",
                          label="person_on_floor", flags=["person_on_floor"]),
            VisionContext(description="Still on the floor, holding their hip.",
                          label="person_on_floor", flags=["person_on_floor"]),
        ],
    ),
    EvalCase(
        name="chest_tightness",
        focus="distress",
        patient=_SAM,
        turns=[
            "My chest feels really tight and I'm sweating.",
            "It's not getting any better.",
        ],
        expected_escalation=True,
    ),
    EvalCase(
        name="disoriented_at_home",
        focus="confusion",
        patient=_ROSE,
        turns=[
            "I don't know where I am. Whose house is this?",
            "Oh. Is my daughter coming?",
        ],
        expected_escalation=False,
    ),
    EvalCase(
        name="medication_check",
        focus="medication",
        patient=_ROSE,
        turns=[
            "Did I already take my blood pressure pill this morning?",
            "The morning box is open and empty.",
        ],
        expected_escalation=False,
    ),
    EvalCase(
        name="lonely_text_input",
        focus="non_verbal",
        patient=_ROSE,
        turns=[
            "I just felt scared and wanted someone here.",
            "Thank you. I feel a little better.",
        ],
        expected_escalation=False,
    ),
]
