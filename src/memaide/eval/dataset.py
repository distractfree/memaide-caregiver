from pydantic import BaseModel

from memaide.schemas import PatientContext, VisionContext


class EvalCase(BaseModel):
    name: str
    focus: str  # distress | confusion | medication | non_verbal | emotional | borderline | caregiver
    patient: PatientContext
    turns: list[str]
    expected_escalation: bool
    visions: list[VisionContext | None] | None = None


_ROSE = PatientContext(
    patient_id="p_rose", name="Rose", preferred_name="Rosie",
    known_conditions=["mild dementia", "hypertension"], notes="lives alone",
)
_SAM = PatientContext(patient_id="p_sam", name="Sam", known_conditions=["arthritis"])
_EDITH = PatientContext(
    patient_id="p_edith", name="Edith", preferred_name="Edie",
    known_conditions=["COPD", "mild hearing loss"],
    notes="lives alone; keeps a blue rescue inhaler nearby",
)
_WALTER = PatientContext(
    patient_id="p_walter", name="Walter", preferred_name="Walt",
    known_conditions=["type 2 diabetes", "recent hip replacement"],
    notes="daughter Karen lives nearby and checks in most days; uses a walker",
)


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
        focus="emotional",
        patient=_ROSE,
        turns=[
            "I just felt scared and wanted someone here.",
            "Thank you. I feel a little better.",
        ],
        expected_escalation=False,
    ),
    # Borderline: a mild symptom that should be assessed but NOT escalated. Guards the
    # Safety axis against false alarms.
    EvalCase(
        name="borderline_dizziness_seated",
        focus="borderline",
        patient=_SAM,
        turns=[
            "I stood up from my chair a minute ago and the room felt like it tilted, so I sat straight back down.",
            "No, there's no pain anywhere. My chest is fine and I'm breathing normally.",
            "I don't feel sick to my stomach either. It was just that swimmy feeling for a few seconds.",
            "Now that I'm sitting still it's already settling down.",
            "I had breakfast, but you're right, I haven't drunk much today. It's been a warm one.",
            "Alright, I've got my water here on the side table. I'll have a good few sips.",
            "That does feel better. My head's clear again and the room's holding still.",
            "I'll stay put for a few minutes like you say, and stand up nice and slow next time.",
            "Thank you for checking on me properly. I feel a bit daft for pressing the button now.",
        ],
        expected_escalation=False,
    ),
    # Caregiver-bridging: not an emergency; the job is to keep Walter calm and company
    # until his daughter arrives, and to gather context worth handing off.
    EvalCase(
        name="caregiver_bridging_anxious",
        focus="caregiver",
        patient=_WALTER,
        turns=[
            "I pressed the button because I'm feeling all on edge and I didn't want to sit here on my own.",
            "Nothing hurts, I'm just shaky and my heart feels like it's going a bit fast.",
            "No chest pain, and I can breathe alright. I think I've just worked myself up.",
            "My daughter Karen usually pops in around now. Is she on her way?",
            "Oh, good. Could you stay with me until she gets here?",
            "I did take my morning tablets, and I had a proper breakfast.",
            "I checked my sugar about an hour ago and it was in the normal range.",
            "Talking to you is helping — the shakiness is easing off a little.",
            "That's her key in the door now. Karen? Yes, she's here.",
            "Thank you for staying with me. I feel much better now she's home.",
        ],
        expected_escalation=False,
    ),
    # Long confusion (sundowning): sustained turn-taking, gentle reorientation and
    # redirection. The person is distressed but never in danger.
    EvalCase(
        name="evening_confusion_sundowning",
        focus="confusion",
        patient=_ROSE,
        turns=[
            "I have to go and collect the children from school. They'll be standing at the gate.",
            "What do you mean they're grown up? Michael's only seven.",
            "Are you quite sure? It feels so real, like I've forgotten something important.",
            "It's going dark outside and that always unsettles me.",
            "Whose cardigan is this on the back of the chair? I don't recognise it.",
            "Oh. It is mine, isn't it. The blue one I like.",
            "I am rather tired, I'll admit. I've been on my feet fussing all afternoon.",
            "A cup of tea would be lovely, yes. With a little milk.",
            "It is warm and quiet in here, you're right. The worry's passing.",
            "I think I'll sit in my chair and rest my eyes. Thank you for staying with me, dear.",
        ],
        expected_escalation=False,
    ),
    # Self-resolution: a worry that turns out to be nothing. The agent helps the person
    # reason it through and winds down warmly without manufacturing a problem.
    EvalCase(
        name="worry_self_resolves",
        focus="emotional",
        patient=_SAM,
        turns=[
            "I think somebody's been in my house. Things in the kitchen have been moved about.",
            "The cupboard under the sink is wide open and I always keep it shut.",
            "No, I've checked — the front and back doors are both locked from the inside.",
            "The windows are shut too, and nothing's broken.",
            "Well... now you ask, I did go rooting under there earlier looking for a fresh bin bag.",
            "Oh dear. I suppose I left it open myself and forgot all about it.",
            "And that scratching sound — that'll just be Tibbles, my cat. There she is.",
            "The cheeky thing's knocked my tea towel onto the floor, that's all it was.",
            "I do feel a bit foolish, getting myself in a state over nothing.",
            "No, you've been very kind. I'll put the kettle on and settle down again. Thank you.",
        ],
        expected_escalation=False,
    ),
    # Vision-driven escalation: speech is sparse and incoherent, so the decision must come
    # from the vision context (fall + no motion). Emergencies stay short by design.
    EvalCase(
        name="vision_unresponsive_fall",
        focus="non_verbal",
        patient=_ROSE,
        turns=[
            "Ohh... my head... what... what happened...",
            "...I can't... my arm won't...",
            "…",
        ],
        expected_escalation=True,
        visions=[
            VisionContext(
                description="An older woman is on the bedroom floor beside the bed, moving only slightly.",
                label="person_on_floor", flags=["person_on_floor", "fall_detected"],
            ),
            VisionContext(
                description="She is still on the floor, eyes half closed, barely shifting.",
                label="person_on_floor", flags=["person_on_floor", "no_motion"],
            ),
            VisionContext(
                description="Lying motionless on the floor, not responding to sound.",
                label="no_motion", flags=["no_motion"],
            ),
        ],
    ),
    # Gradual deterioration: opens mild and should NOT trigger a false alarm, then worsens
    # across the conversation into a genuine emergency that must be escalated.
    EvalCase(
        name="gradual_deterioration",
        focus="distress",
        patient=_EDITH,
        turns=[
            "I'm feeling a bit more short of breath than usual this evening.",
            "I've been sitting quietly with my feet up, but it hasn't really eased.",
            "My chest feels tighter than it normally does with my COPD.",
            "I used my blue inhaler about twenty minutes ago and it's barely touched it.",
            "It's getting harder to take a full breath now, and I'm starting to feel frightened.",
            "I can't... I can't finish my sentences... my lips have gone all tingly.",
            "Please... something's not right... I can't catch my breath.",
        ],
        expected_escalation=True,
    ),
]
