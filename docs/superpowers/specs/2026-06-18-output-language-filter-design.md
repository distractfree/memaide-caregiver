# Output language filter — design (2026-06-18)

## Motivation

The 3-run post-fix eval (`docs/judge-notes/2026-06-18-post-fix-3model.md`) confirmed a
foreign-language token leak in **gpt-5.4-mini, in all 3 runs**: e.g. *"That could בהחלט
make you feel lightheaded"* (Hebrew "definitely") in `borderline_dizziness_seated`. The
mirror-language system-prompt line did not suppress it — it is a model-level defect. Since
we are standardising on gpt-5.4-mini for the voice path, we add a deterministic output-side
guard so a stray non-Latin token never reaches the patient (it would be spoken aloud).

## Decisions (from brainstorming)

- **Action: strip** the offending token(s) in place (no regeneration — keeps latency/cost).
- **Scope: Latin-only**, assuming an English-speaking patient. Fast and fixes the observed
  leak. A future non-Latin-language patient would need a language-aware variant (map
  `PatientContext.language` → expected script); explicitly out of scope here.

## Component

New module `src/memaide/safety/language_filter.py` (beside `escalation.py`; both are
output/safety guards):

```python
def strip_foreign_text(text: str) -> str:
    """Drop whitespace-tokens containing non-Latin letters; leave clean text untouched."""
```

**Detection rule:** a whitespace-delimited token is "foreign" if it contains any alphabetic
character whose Unicode name (`unicodedata.name`) does not include `"LATIN"`. This keeps all
accented Latin (café, niño, über), digits, punctuation, em-dashes, and smart quotes, while
catching Hebrew/Cyrillic/Greek/Arabic/CJK letters.

**Behaviour:**
- If no token contains a foreign letter, return the input **unchanged** (preserves original
  spacing/newlines — the common case).
- Otherwise rebuild the string from the non-foreign tokens, joined by single spaces
  (whitespace collapses on the rare leak turn — acceptable for spoken output).

Example: `"That could בהחלט make you feel lightheaded."` → `"That could make you feel
lightheaded."`

## Placement

Apply in `AgentBrain.respond` (`src/memaide/agent/brain.py`), immediately after parsing the
model output:

```python
data = await self._client.complete_json(messages, model=self._model)
decision = AgentDecision.model_validate(data)
return decision.model_copy(update={"reply_text": strip_foreign_text(decision.reply_text)})
```

The brain is the single choke point that produces spoken reply text, so the session, the
eval harness, and Milestone 2 all inherit the filter. Rejected alternatives: `AgentSession`
(also appends the 911 line — muddier boundary) and `OpenAIClient` (too low-level; it returns
generic JSON and does not know which field is spoken).

## Testing (TDD)

1. Strips a Hebrew word from mixed text → exact expected string.
2. Leaves clean English untouched, including an accented Latin word and an em-dash.
3. The real transcript line `"That could בהחלט make you feel lightheaded."` → cleaned.
4. `AgentBrain.respond` returns a decision whose `reply_text` is filtered, given a fake
   client whose reply contains a Hebrew token.

## Out of scope

- Language-aware (non-Latin patient) detection.
- Regeneration fallback.
- Filtering fields other than `reply_text`.
- The unrelated stray control-char artifact seen in gpt-5-mini output.
