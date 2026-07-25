"""Writes the caregiver-facing summary of a concluded session.

koko's dashboard shows one ``summary`` line per AI session. Without this it falls back to a
template built from ``outcome`` + ``final_scene_label``, which never says what the patient
actually said or why they asked for help. This turns the ``SessionRecord`` into two short
sentences a caregiver can read at a glance.

Two properties matter more than coverage here:

* **Only session facts.** The summarizer is handed the record — transcript, final scene label,
  escalation flag — and nothing else. The patient profile (conditions, medications, address)
  is structurally out of reach, so it cannot leak into a summary or be embellished from.
* **Silence beats invention.** Every failure path returns ``None``: no patient speech to
  summarize, a model error, a timeout, a malformed reply, or output too long to trim cleanly.
  ``None`` means the field is left off the conclude callback and koko's template stands. A
  generic summary is a small problem; a confident wrong one about someone's emergency is not.

Never raises, so the conclude path at session teardown can call it unguarded.
"""

import asyncio
import logging

from memaide import config
from memaide.schemas import Role, SessionRecord

_log = logging.getLogger(__name__)

_ROLE_LABEL = {Role.AGENT: "Assistant", Role.PATIENT: "Patient", Role.SYSTEM: "System"}

_SYSTEM_PROMPT = """\
You write the one-line summary a caregiver reads about an assistance session that just ended.

WHAT TO WRITE
- Lead with why help was requested, in the patient's own terms.
- Then what you did about it: what you reassured, reoriented, or ruled out.
- If the session involved confusion or a dementia episode, say so plainly: what they believed
  and that you kept them safely where they were.

RULES
- Use ONLY what appears in the transcript and scene notes below. Nothing else is known.
- If a detail is not there, leave it out. Never guess at a cause, a diagnosis, a location, a
  time, or whether someone is hurt. An incomplete summary is correct; an invented one is not.
- Do not quantify what was not measured. No vital signs, no durations, no severity ratings.
- Two sentences maximum. Plain language, past tense, no bullet points, no greeting.
- Refer to the patient as "the patient" or by the name they used for themselves.

Reply with a single JSON object: {"summary": "<your summary>"}
If the transcript does not say why help was requested, reply {"summary": ""}.
"""


class SessionSummarizer:
    """Turns a concluded ``SessionRecord`` into a short caregiver summary, or ``None``.

    ``client`` must expose ``async complete_json(messages, model=?, temperature=?)`` — the same
    seam ``AgentBrain`` uses.
    """

    def __init__(
        self,
        client,
        model: str = config.SUMMARY_MODEL,
        timeout: float = config.SUMMARY_TIMEOUT_SECONDS,
        max_chars: int = config.SUMMARY_MAX_CHARS,
    ):
        self._client = client
        self._model = model
        self._timeout = timeout
        self._max_chars = max_chars

    def _render(self, record: SessionRecord, outcome: str) -> str:
        lines = [f"{_ROLE_LABEL[turn.role]}: {turn.text}" for turn in record.transcript]
        notes = [f"Session ended with outcome: {outcome}."]
        if record.final_scene_label:
            notes.append(f"Last thing the camera saw: {record.final_scene_label}.")
        if record.escalated:
            notes.append("This session was escalated to the caregiver as a possible emergency.")
        return "TRANSCRIPT\n" + "\n".join(lines) + "\n\nSCENE NOTES\n" + " ".join(notes)

    def _clamp(self, summary: str) -> str | None:
        """Keep the summary short without cutting mid-thought.

        Over the cap, drop back to the last sentence that ends inside it. A blob with no
        sentence break can't be shortened without changing what it says, so it's discarded.
        """
        if len(summary) <= self._max_chars:
            return summary
        cut = summary.rfind(".", 0, self._max_chars)
        if cut == -1:
            _log.warning("[summary] discarded: %d chars with no sentence break", len(summary))
            return None
        return summary[: cut + 1]

    async def summarize(self, record: SessionRecord, outcome: str) -> str | None:
        if not any(turn.role is Role.PATIENT for turn in record.transcript):
            # Nothing the patient said means nothing to summarize. Don't ask the model to
            # narrate a session it would have to imagine.
            return None
        messages = [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": self._render(record, outcome)},
        ]
        try:
            data = await asyncio.wait_for(
                self._client.complete_json(messages, model=self._model),
                timeout=self._timeout,
            )
        except Exception as exc:  # noqa: BLE001 - incl. TimeoutError; summary is optional
            _log.warning("[summary] not generated for %s: %s", record.id, exc)
            return None
        summary = data.get("summary") if isinstance(data, dict) else None
        if not isinstance(summary, str) or not summary.strip():
            return None
        return self._clamp(summary.strip())
