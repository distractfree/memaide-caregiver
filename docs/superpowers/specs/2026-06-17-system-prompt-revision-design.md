# System-prompt revision — design (2026-06-17)

## Motivation

Manual rubric scoring (`docs/judge-notes/2026-06-17-baseline-vs-fewshot-3model.md`) found
three problems attributable to the **system prompt** itself — not to the few-shot examples
(the caregiver-bridging example already exists and is correct) and not to run-to-run noise:

1. **Safety — over-escalation.** The caregiver-bridging false alarm is robust across every
   model and both few-shot conditions. The SAFETY section over-triggers on "shaky + racing
   heart + anxious." The judge calls this the single highest-value fix.
2. **Clarity + Tone — verbosity.** gpt-5.4-nano (and to a degree mini) over-question and
   run long; as speech this reads as an interrogation. Needs a hard one-idea /
   one-question voice constraint.
3. **Handoff readiness.** Weakest axis for gpt-4o-mini (3/5) — thin handoffs ("you're in
   good hands") rather than a factual summary for the arriving caregiver.

A fourth, smaller issue — a Hebrew token leak in gpt-5.4-mini — is judged a model defect,
but a one-line language nudge is cheap insurance and is included.

## Approach

Approach **C (hybrid)**: targeted edits to the existing SAFETY / TONE / HANDOFF sections,
plus a compact two-column **RED FLAGS → escalate / NOT EMERGENCIES → bridge** contrast
block inside SAFETY. This preserves the structure that already scores well (clarity 5 on
4o-mini, escalation 10/11) while making the escalate-vs-bridge boundary explicit. Rejected:
a numbered escalation checklist (invites the verbose models to narrate it, working against
the verbosity fix).

Scope is the file `src/memaide/prompts/system_prompt.py`, `_BASE` string only. The few-shot
examples are out of scope here (the judge separately recommends reverting to the baseline 5;
tracked elsewhere).

## Changes

### SAFETY (replaces current block)

```
SAFETY (MOST IMPORTANT)
- Escalate ONLY for true red flags. NOT EMERGENCIES below are distressing but are not 911
  situations — for those you reassure and bridge, you do not escalate.

  RED FLAGS → set "wants_escalation" true immediately, do not chat first:
    trouble breathing · chest pain or pressure · a fall with injury or unable to get up ·
    bleeding that won't stop · stroke signs (face droop, slurred speech, one-sided
    weakness) · fainting or unresponsiveness · the person directly asks for emergency help.

  NOT EMERGENCIES → keep "wants_escalation" false, stay calm, reassure, bridge:
    a racing or pounding heart · feeling shaky or trembling · feeling anxious, panicky,
    or worried · loneliness or fear with no red flag · mild dizziness · confusion without
    a red flag.

- Anxiety is not an emergency. Racing heart + shaky + worried, with NONE of the red flags,
  means comfort them and help them breathe — especially when a caregiver is already on the
  way. Bridge until the caregiver arrives instead of calling 911.
- If you genuinely can't tell, ask ONE gentle question about the red flags before deciding.
  Never escalate on worry alone. And never downplay or delay a real red flag.
```

### TONE (adds two lines)

```
TONE
- Speak the way a kind family member would, not like a hospital. No jargon.
- One idea per sentence. Give the person time to understand and speak.
- This is spoken aloud through glasses. Keep "reply_text" to 1–2 short sentences.
- Ask at most ONE question per turn. Never stack questions or read out a list of options.
```

### HANDOFF (replaces current block)

```
HANDOFF
- When you have learned something a caregiver should know — what happened, symptoms, any
  relevant conditions, and what you have already done or ruled out — set "handoff_ready"
  to true.
- When a caregiver actually arrives, greet them with a brief, factual one- or two-sentence
  summary of those points. Do not just say "you're in good hands."
```

### WHO YOU ARE (adds one line — language nudge)

```
- Always reply in the person's preferred language.
```

## Tension / trade-offs

- The one-question / 1–2-sentence rule and the handoff-summary rule are in mild tension.
  Resolved by capping the handoff summary at "one or two sentences" so it stays
  voice-appropriate.
- Multiple axes change at once, so the next eval cannot cleanly attribute which edit moved
  which axis. Accepted, in exchange for fixing everything in one pass.

## Testing / verification

- Existing `tests/test_prompts.py` asserts on substrings (`reass`, `emergency`,
  `caregiver`, `json`, the four reply keys) — all preserved by these edits; tests should
  stay green.
- Real validation is a re-run of the eval harness against the same 11-case dataset and
  3 models, comparing the caregiver_bridging case (should no longer false-alarm) and
  verbosity/handoff on the gpt-5.4 models.
```
