from memaide.prompts.few_shot import FEW_SHOT_EXAMPLES, format_few_shot
from memaide.prompts.system_prompt import build_system_prompt
from memaide.schemas import Medication, PatientContext


def _turns(ex):
    """Flatten an example into its turn(s); single-turn examples are their own turn."""
    return ex.get("turns") or [ex]


def test_few_shot_has_examples_with_required_keys():
    assert 3 <= len(FEW_SHOT_EXAMPLES) <= 12
    turn_keys = {"patient", "reply_text", "wants_escalation", "handoff_ready", "intent"}
    for ex in FEW_SHOT_EXAMPLES:
        assert "situation" in ex
        for turn in _turns(ex):
            assert set(turn) >= turn_keys
    # at least one escalation turn and one non-escalation turn
    all_turns = [t for ex in FEW_SHOT_EXAMPLES for t in _turns(ex)]
    assert any(t["wants_escalation"] for t in all_turns)
    assert any(not t["wants_escalation"] for t in all_turns)


def test_few_shot_includes_a_multi_turn_example():
    multi = [ex for ex in FEW_SHOT_EXAMPLES if len(_turns(ex)) > 1]
    assert multi, "expected at least one multi-turn example"
    # a multi-turn example should render every one of its turns
    text = format_few_shot()
    for turn in multi[0]["turns"]:
        assert turn["patient"] in text


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


def test_system_prompt_covers_dementia_redirect():
    prompt = build_system_prompt(PatientContext(patient_id="p", name="A")).lower()
    assert "dementia" in prompt          # confusion/dementia handling exists
    assert "gently" in prompt            # gentle redirection, not blunt correction
    assert "leave" in prompt             # guidance about wanting to leave / keeping them put


def test_system_prompt_handoff_notes_dementia_episode():
    prompt = build_system_prompt(PatientContext(patient_id="p", name="A")).lower()
    assert "dementia episode" in prompt  # handoff names the episode for the caregiver


def test_system_prompt_includes_age_bio_and_medications_when_present():
    patient = PatientContext(
        patient_id="p1", name="Rose", age=78, bio_info="Lives alone with a cat.",
        medications=[Medication(name="Metformin", dose="500mg", schedule="twice daily")],
    )
    prompt = build_system_prompt(patient)
    assert "78" in prompt
    assert "Lives alone with a cat." in prompt
    assert "Metformin" in prompt
    assert "500mg" in prompt


def test_system_prompt_omits_medication_line_when_none():
    prompt = build_system_prompt(PatientContext(patient_id="p", name="Sam"))
    assert "medications" not in prompt.lower()


def test_system_prompt_skips_inactive_medications():
    patient = PatientContext(
        patient_id="p", name="Sam",
        medications=[Medication(name="OldDrug", active=False)],
    )
    prompt = build_system_prompt(patient)
    assert "OldDrug" not in prompt


def test_system_prompt_refuses_to_guess_about_medicine():
    prompt = build_system_prompt(PatientContext(patient_id="p", name="A")).lower()
    assert "medicine (never guess)" in prompt
    assert "no record of what the person has actually taken" in prompt
    assert "pill boxes" in prompt                      # no working it out with them
    assert "take, skip, or repeat a dose" in prompt
    assert "caregiver can check" in prompt


def test_system_prompt_covers_kitchen_and_vague_prompts():
    prompt = build_system_prompt(PatientContext(patient_id="p", name="A")).lower()
    assert "cooking" in prompt
    assert "remember doing so far" in prompt           # ask before checking anything
    assert "stove and burners are off" in prompt       # then the safety check
    assert "summary for their caregiver" in prompt     # then hand off and stop
    assert "vague" in prompt                           # ask, don't guess at what they meant


def test_few_shot_medicine_example_says_it_does_not_know():
    med = [ex for ex in FEW_SHOT_EXAMPLES if "dose" in ex["situation"].lower()]
    assert med, "expected a medication-uncertainty example"
    turns = _turns(med[0])
    first = turns[0]["reply_text"].lower()
    assert "don't know" in first
    assert "guess" in first
    # the question goes to the caregiver, and it never becomes an emergency
    assert all(t["handoff_ready"] for t in turns)
    assert not any(t["wants_escalation"] for t in turns)
    # and it must not walk them through working it out themselves
    assert "pill box" not in " ".join(t["reply_text"].lower() for t in turns)


def test_few_shot_kitchen_example_checks_the_stove_then_hands_off():
    kitchen = [ex for ex in FEW_SHOT_EXAMPLES if "kitchen" in ex["situation"].lower()
               and "lunch" in ex["situation"].lower()]
    assert kitchen, "expected a lost-track-while-cooking example"
    turns = _turns(kitchen[0])
    replies = [t["reply_text"].lower() for t in turns]
    # asks what they remember before checking anything
    assert "remember doing so far" in replies[0]
    # the safety check names both the stove and the burners
    assert any("stove" in r and "burner" in r for r in replies)
    # and it ends on a caregiver summary, not on more digging
    assert "summary for your caregiver" in replies[-1]
    assert turns[-1]["handoff_ready"] is True
    assert not any(t["wants_escalation"] for t in turns)


def test_few_shot_has_a_vague_prompt_example():
    vague = [ex for ex in FEW_SHOT_EXAMPLES if "vague" in ex["situation"].lower()]
    assert vague, "expected a vague/random-prompt example"
    turn = _turns(vague[0])[0]
    assert "help you with" in turn["reply_text"].lower()
    assert not turn["wants_escalation"]


def test_few_shot_has_a_dementia_redirect_example():
    dementia = [ex for ex in FEW_SHOT_EXAMPLES if "dementia" in ex["situation"].lower()]
    assert dementia, "expected a dementia example"
    ex = dementia[0]
    # it must be multi-turn and end with a handoff-ready turn
    turns = ex.get("turns") or [ex]
    assert len(turns) > 1
    assert turns[-1]["handoff_ready"] is True
    # the example never escalates (confusion without a red flag)
    assert not any(t["wants_escalation"] for t in turns)
    # it renders into the few-shot block
    assert ex["situation"] in format_few_shot()
