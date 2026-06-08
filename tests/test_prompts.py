from memaide.prompts.few_shot import FEW_SHOT_EXAMPLES, format_few_shot
from memaide.prompts.system_prompt import build_system_prompt
from memaide.schemas import PatientContext


def test_few_shot_has_examples_with_required_keys():
    assert 3 <= len(FEW_SHOT_EXAMPLES) <= 10
    for ex in FEW_SHOT_EXAMPLES:
        assert set(ex) >= {"situation", "patient", "reply_text", "wants_escalation",
                           "handoff_ready", "intent"}
    # at least one escalation example and one non-escalation example
    assert any(ex["wants_escalation"] for ex in FEW_SHOT_EXAMPLES)
    assert any(not ex["wants_escalation"] for ex in FEW_SHOT_EXAMPLES)


def test_format_few_shot_renders_json_replies():
    text = format_few_shot()
    assert "reply_text" in text
    assert "wants_escalation" in text


def test_system_prompt_injects_patient_context():
    patient = PatientContext(
        patient_id="p1", name="Rose", preferred_name="Rosie",
        known_conditions=["mild dementia", "hypertension"], notes="lives alone",
    )
    prompt = build_system_prompt(patient)
    assert "Rosie" in prompt
    assert "mild dementia" in prompt
    assert "lives alone" in prompt


def test_system_prompt_covers_persona_safety_tone_scope_and_json():
    prompt = build_system_prompt(PatientContext(patient_id="p", name="A")).lower()
    assert "reass" in prompt          # persona: reassuring
    assert "emergency" in prompt      # safety
    assert "caregiver" in prompt      # task scope: bridge to caregiver
    assert "json" in prompt           # output contract
    for key in ["reply_text", "wants_escalation", "handoff_ready", "intent"]:
        assert key in prompt


def test_system_prompt_handles_missing_optional_fields():
    prompt = build_system_prompt(PatientContext(patient_id="p", name="Sam"))
    assert "Sam" in prompt
    assert "none on file" in prompt   # no known_conditions
