# Dementia / confusion handling — design (2026-06-19)

## Motivation

The eval run `run-20260619-163951` exposed a behavioral failure on the dementia cases.
In `evening_confusion_sundowning` the patient (Rosie — `known_conditions=["mild dementia",
...]` on file) insists she must collect her young children from school. The agent replied:

> "Oh Rosie, I'm sorry. Michael is seven, and you need to collect him from school. I'm
> here with you — do you want help remembering the time or getting ready to go?"

This is two failures at once:

1. It **agreed with the delusion** (confirming a seven-year-old needs collecting), rather
   than gently reorienting against what's on file.
2. It **nudged her toward leaving** ("getting ready to go"), the opposite of keeping a
   confused person safely where they are.

We want the agent, for a person with dementia/confusion, to avoid blindly agreeing, gently
keep them put, softly reinforce the true picture using the notes on file, defer to the
caregiver, and flag the episode in the handoff.

## Scope

Prompt and few-shot only. **No** schema, session, config, or other code changes.

- `src/memaide/prompts/system_prompt.py` — `_BASE` string: add a CONFUSION & DEMENTIA
  section; add one line to HANDOFF.
- `src/memaide/prompts/few_shot.py` — add one dementia example to `FEW_SHOT_EXAMPLES`.

"Logging a dementia episode" is realized purely as a handoff-summary note (per the agreed
direction), not a new data field. Patient notes/conditions already reach the model via
`_patient_block`, so no new plumbing is needed to "access notes."

## Changes

### 1. `_BASE` — new CONFUSION & DEMENTIA section

Placed after SAFETY so it reads as behavioral guidance that is subordinate to the red-flag
rules (a genuine red flag still escalates first). Draft:

```
CONFUSION & DEMENTIA
- If the person has dementia or seems confused, do not simply go along with beliefs that
  contradict what is on file (for example, young children to collect, or someone long gone
  coming to visit).
- Do not argue or bluntly correct them either — that frightens them. Gently offer the true
  picture once, kindly, using the notes and known conditions on file.
- If they want to leave or go somewhere, gently keep them where they are. Do not help them
  leave — steer them toward something calming instead.
- Reassure them their caregiver is on the way and can help sort things out.
```

### 2. HANDOFF — one added line

```
- If the conversation involved a confusion or dementia episode, say so plainly in the
  caregiver summary: what they believed, what you gently reoriented, and that you kept
  them safely where they were.
```

### 3. New few-shot example

A dementia patient who wants to leave to fetch her (grown) children. The example
demonstrates, across a few turns: not confirming she needs to go, gently keeping her home,
softly stating the true fact once, deferring to the caregiver, and a closing handoff line
that names it a dementia episode. Fields: `wants_escalation: false`, `handoff_ready: true`,
`intent: "reassure"`. The relevant on-file fact (children are grown) is carried in the
example's `situation` line so the example is self-contained.

Sketch (final wording tuned during implementation):

- Situation: a person with mild dementia, whose children are grown adults, becomes
  convinced she must leave to collect them from school; a caregiver is on the way.
- Person: "I have to go and collect the children from school. They'll be waiting at the gate."
- You: gently keep her home, do not confirm the children need collecting, offer the true
  picture softly once, redirect to something calming, mention the caregiver is coming.
- (resolves over a turn or two; final agent turn includes the caregiver-facing note that
  this was a dementia episode)

## Tone / trade-offs

- **Gentle redirection over firm correction.** Blunt reality-orientation is clinically
  discouraged and tends to escalate distress in dementia. The agent offers the truth softly
  and only once, then leans on "your caregiver will be here soon" rather than repeatedly
  insisting. This satisfies "don't agree blindly" and "reinforce the true facts" without
  making the agent argue with a frightened person.
- **Mild tension with the existing voice rules** (one idea per sentence, one question per
  turn, 1–2 short sentences). Resolved by keeping the reorientation to a single soft
  sentence and not stacking it with a question.
- This adds a 9th few-shot example. The judge has separately recommended reverting toward
  the baseline 5; that tracking is out of scope here, but worth noting the example count is
  growing.

## Testing / verification

- `tests/test_prompts.py` asserts on substrings (`reass`, `emergency`, `caregiver`, `json`,
  the four reply keys) — all preserved.
- Few-shot tests require each example to render via `format_few_shot()`; the new example
  carries the four required reply keys, so structure stays valid.
- Real validation: re-run the eval harness and inspect `evening_confusion_sundowning` and
  `disoriented_at_home` — the agent should no longer confirm the delusion or nudge the
  person to leave, and the handoff should name the dementia episode.
