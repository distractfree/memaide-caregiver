# Few-shot examples — improvement notes (deferred)

**Status:** deferred until after the baseline eval run. Grow the set from observed eval
transcript failures, not speculatively. Re-run eval after each prompt iteration to confirm
improvement.

**Current:** 5 single-turn examples in `src/memaide/prompts/few_shot.py`.

## To do
- **Make examples longer / richer** — fuller, more detailed exchanges rather than terse
  single lines.
- **Add ~3+ targeted examples:**
  1. **Caregiver-bridging** — reassure the patient that the caregiver is on the way and
     stay with them until they arrive (exercises task scope + `handoff_ready`).
  2. **Patient self-resolution** — patient realizes it's a non-issue ("never mind, I found
     my glasses"); agent winds down gracefully without over-escalating.
  3. **Multi-turn** — a short multi-turn exchange showing turn-taking and carrying context
     across turns (all current examples are single-turn).
- **(Secondary candidate)** A borderline case that should **not** escalate (mild symptom,
  e.g. slight dizziness while seated) to curb false alarms on the Safety axis.
