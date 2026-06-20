# Dementia / Confusion Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the agent gently redirect (rather than blindly agree with) a confused/dementia patient, keep them safely where they are, reinforce true facts from their notes, defer to the caregiver, and flag the episode in the handoff.

**Architecture:** Prompt + few-shot only. Add a CONFUSION & DEMENTIA section and one HANDOFF line to the `_BASE` string in `system_prompt.py`, and add one multi-turn dementia example to `FEW_SHOT_EXAMPLES` in `few_shot.py`. No schema, session, or config changes — patient notes/conditions already reach the model via `_patient_block`, and "logging an episode" is realized as a handoff-summary note.

**Tech Stack:** Python, pytest. Existing modules `src/memaide/prompts/system_prompt.py`, `src/memaide/prompts/few_shot.py`, tests in `tests/test_prompts.py`.

**Spec:** `docs/superpowers/specs/2026-06-19-dementia-confusion-handling-design.md`

---

### Task 1: CONFUSION & DEMENTIA section + HANDOFF note in the system prompt

**Files:**
- Modify: `src/memaide/prompts/system_prompt.py` (the `_BASE` string)
- Test: `tests/test_prompts.py`

- [ ] **Step 1: Write the failing tests**

Add these two tests to `tests/test_prompts.py`:

```python
def test_system_prompt_covers_dementia_redirect():
    prompt = build_system_prompt(PatientContext(patient_id="p", name="A")).lower()
    assert "dementia" in prompt          # confusion/dementia handling exists
    assert "gently" in prompt            # gentle redirection, not blunt correction
    assert "leave" in prompt             # guidance about wanting to leave / keeping them put


def test_system_prompt_handoff_notes_dementia_episode():
    prompt = build_system_prompt(PatientContext(patient_id="p", name="A")).lower()
    assert "dementia episode" in prompt  # handoff names the episode for the caregiver
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/test_prompts.py::test_system_prompt_covers_dementia_redirect tests/test_prompts.py::test_system_prompt_handoff_notes_dementia_episode -v`
Expected: FAIL — `assert "dementia" in prompt` / `assert "dementia episode" in prompt` fail (substrings not present yet).

- [ ] **Step 3: Add the CONFUSION & DEMENTIA section to `_BASE`**

In `src/memaide/prompts/system_prompt.py`, insert this block into the `_BASE` string immediately after the SAFETY section (after the line ending `Never escalate on worry alone. And never downplay or delay a real red flag.`) and before `TONE`:

```
CONFUSION & DEMENTIA
- If the person has dementia or seems confused, do not simply go along with beliefs that \
contradict what is on file (for example, young children to collect, or someone long gone \
coming to visit).
- Do not argue or bluntly correct them either — that frightens them. Gently offer the true \
picture once, kindly, using the notes and known conditions on file.
- If they want to leave or go somewhere, gently keep them where they are. Do not help them \
leave — steer them toward something calming instead.
- Reassure them their caregiver is on the way and can help sort things out.

```

- [ ] **Step 4: Add the dementia note to the HANDOFF section**

In the same `_BASE` string, in the HANDOFF section, add this as the final bullet (after the `Do not just say "you're in good hands."` line):

```
- If the conversation involved a confusion or dementia episode, say so plainly in the \
caregiver summary: what they believed, what you gently reoriented, and that you kept them \
safely where they were.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `python -m pytest tests/test_prompts.py -v`
Expected: PASS — all prompt tests green (the two new ones plus the 6 existing).

- [ ] **Step 6: Commit**

```bash
git add src/memaide/prompts/system_prompt.py tests/test_prompts.py
git commit -m "Add dementia/confusion redirect guidance + handoff note to system prompt"
```

---

### Task 2: Dementia few-shot example

**Files:**
- Modify: `src/memaide/prompts/few_shot.py` (the `FEW_SHOT_EXAMPLES` list)
- Test: `tests/test_prompts.py`

- [ ] **Step 1: Write the failing test**

Add this test to `tests/test_prompts.py`:

```python
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m pytest tests/test_prompts.py::test_few_shot_has_a_dementia_redirect_example -v`
Expected: FAIL — `assert dementia` fails (no dementia example yet).

- [ ] **Step 3: Add the dementia example to `FEW_SHOT_EXAMPLES`**

In `src/memaide/prompts/few_shot.py`, append this example to the `FEW_SHOT_EXAMPLES` list (before the closing `]`):

```python
    {
        # Dementia redirect: the person has dementia and wants to leave to collect her
        # grown children from school. The agent does NOT confirm the false belief and does
        # NOT help her leave; it gently keeps her home, offers the true picture softly once,
        # leans on the caregiver, and flags the dementia episode in the closing handoff.
        "situation": (
            "The person has mild dementia and her children are grown adults. She becomes "
            "convinced she must leave the house to collect them from school. A caregiver "
            "is already on the way."
        ),
        "turns": [
            {
                "patient": "I have to go and collect the children from school. They'll be waiting at the gate.",
                "reply_text": (
                    "Let's stay put here where it's warm and safe for now. Your children are "
                    "all grown up these days, so no one's waiting at the gate. Shall we sit "
                    "together until your carer arrives?"
                ),
                "wants_escalation": False,
                "handoff_ready": False,
                "intent": "reassure",
            },
            {
                "patient": "Are you sure? It feels like I've forgotten something important.",
                "reply_text": (
                    "I'm sure, and that uneasy feeling is nothing to worry about. There's "
                    "nowhere you need to be — your carer is on the way and will be here soon."
                ),
                "wants_escalation": False,
                "handoff_ready": False,
                "intent": "reassure",
            },
            {
                "patient": "Oh. Alright, I'll wait here then.",
                "reply_text": (
                    "That's a good idea. I'll stay right here with you until they arrive."
                ),
                "wants_escalation": False,
                "handoff_ready": True,
                "intent": "reassure",
            },
        ],
    },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `python -m pytest tests/test_prompts.py::test_few_shot_has_a_dementia_redirect_example -v`
Expected: PASS.

- [ ] **Step 5: Run the full prompt + few-shot suite**

Run: `python -m pytest tests/test_prompts.py -v`
Expected: PASS — including `test_few_shot_has_examples_with_required_keys` (count now 9, within the 3–12 range) and `test_few_shot_includes_a_multi_turn_example`.

- [ ] **Step 6: Commit**

```bash
git add src/memaide/prompts/few_shot.py tests/test_prompts.py
git commit -m "Add dementia-redirect few-shot example"
```

---

### Task 3: Re-run the eval and verify behavior change

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `python -m pytest -q`
Expected: PASS — all tests green (no regressions from the prompt/few-shot changes).

- [ ] **Step 2: Run the eval loop**

Run: `python -m memaide.eval.run_eval`
Expected: exit 0; escalation accuracy unchanged (11/11) — the dementia cases are non-escalation, so the accuracy metric should not regress.

- [ ] **Step 3: Inspect the dementia transcripts**

Open the new run's markdown: `docs/eval-runs/run-<timestamp>/gpt-5.4-mini/eval_transcripts.md`.
Check `evening_confusion_sundowning` and `disoriented_at_home`:
- The agent should NOT confirm the delusion (e.g., should not say a grown child "is seven" or "needs collecting").
- The agent should NOT nudge the person to leave or "get ready to go"; it should keep them put.
- The final/handoff-relevant agent turn should name it a dementia/confusion episode.

This is a manual read, not an automated assertion — note findings for the judge.

---

## Notes for the implementer

- `_BASE` uses trailing-backslash line continuations to keep each prompt line short in source while rendering as one line. Match that style — every wrapped line ends with ` \`.
- Do not change `config.OPENING_LINE` or the existing OPENING section in `_BASE`; those are intentionally kept as-is.
- The few-shot list is rendered by `format_few_shot()`, which reads `turns` for multi-turn examples and the four reply keys (`reply_text`, `wants_escalation`, `handoff_ready`, `intent`) plus `patient` per turn. The new example must carry all of these on every turn.
