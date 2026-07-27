"""Writes the situation line the caregiver reads in the WhatsApp alert ({{3}}).

Without this, {{3}} is one of a handful of canned phrases mapped from the trigger code, so
every keyword escalation reads "distress in what they told us" no matter what the person actually
said. This turns the live transcript plus the last scene into one short phrase about *this*
situation.

Same discipline as ``agent.summarizer`` (which writes the portal summary), with two
differences: it runs mid-session on an urgent path, so the leash is shorter; and the result is
dropped into an approved WhatsApp template, so it must be one line of plain text well under
the template's variable limit.

* **Only session facts.** Transcript and scene note in, phrase out. The patient profile is
  structurally out of reach, so it cannot leak into an alert.
* **Fallback beats invention.** Every failure path returns the caller's static phrase, which
  is vague but never wrong. Nothing here raises, so the escalation path can call it unguarded.
"""

import asyncio
import logging
import re

from memaide import config
from memaide.schemas import Role, Turn, VisionContext

_log = logging.getLogger(__name__)

_ROLE_LABEL = {Role.AGENT: "Assistant", Role.PATIENT: "Patient", Role.SYSTEM: "System"}

_SYSTEM_PROMPT = """\
You write the one short phrase a caregiver reads in an urgent WhatsApp alert about the person
they care for, who has just asked for help.

WHAT TO WRITE
- What is actually happening, in the person's own terms: what they said is wrong, plus what
  the camera saw if it adds something the words don't.

RULES
- Use ONLY the transcript and scene note below. Nothing else is known about this person.
- If a detail is not there, leave it out. Never guess at a cause, a diagnosis, an injury, a
  location, or how bad it is. No vital signs, no durations, no severity ratings.
- The phrase is dropped into the sentence "We are detecting signs of ___", so it MUST finish
  that sentence as a noun phrase. Start with a noun or "a"/"an"/"no", never with a verb. No
  capital letter at the start, no full stop at the end, no greeting, no names.
- At most 15 words, one line, plain language.

EXAMPLES
  Said "I slipped getting up and I can't get off the floor. My hip hurts."
    GOOD {"situation": "a fall getting up, with hip pain and unable to get off the floor"}
    BAD  {"situation": "slipped and is on the floor with hip pain"}  (starts with a verb)
  Said "I can't catch my breath, it started on the stairs."
    GOOD {"situation": "trouble catching breath that started on the stairs"}
  Said "I've burnt my hand on the pan and it's blistering."
    GOOD {"situation": "a burnt hand that is blistering"}

Reply with a single JSON object: {"situation": "<your phrase>"}
If the transcript does not say what is wrong, reply {"situation": ""}.
"""


class SituationSummarizer:
    """Turns the live transcript into the alert's ``{{3}}`` phrase, or the fallback.

    ``client`` must expose ``async complete_json(messages, model=?)``, the same seam
    ``AgentBrain`` and ``SessionSummarizer`` use.
    """

    def __init__(
        self,
        client,
        model: str = config.ALERT_SUMMARY_MODEL,
        timeout: float = config.ALERT_SUMMARY_TIMEOUT_SECONDS,
        max_chars: int = config.ALERT_SUMMARY_MAX_CHARS,
    ):
        self._client = client
        self._model = model
        self._timeout = timeout
        self._max_chars = max_chars

    def _render(self, transcript: list[Turn], scene: VisionContext | None) -> str:
        lines = [f"{_ROLE_LABEL[turn.role]}: {turn.text}" for turn in transcript]
        note = f"Last thing the camera saw: {scene.description}" if scene else "No camera view."
        return "TRANSCRIPT\n" + "\n".join(lines) + "\n\nSCENE NOTE\n" + note

    async def phrase(
        self,
        transcript: list[Turn] | None,
        scene: VisionContext | None,
        fallback: str,
    ) -> str:
        if not transcript or not any(turn.role is Role.PATIENT for turn in transcript):
            # Nothing the person said means nothing specific to report. A vision-only
            # escalation is exactly what the static phrases already describe well.
            return fallback
        messages = [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": self._render(transcript, scene)},
        ]
        try:
            data = await asyncio.wait_for(
                self._client.complete_json(messages, model=self._model),
                timeout=self._timeout,
            )
        except Exception as exc:  # noqa: BLE001 - incl. TimeoutError; the alert must still go
            _log.warning("[alert] situation phrase not generated: %s", exc)
            return fallback
        situation = data.get("situation") if isinstance(data, dict) else None
        if not isinstance(situation, str):
            return fallback
        return sanitize(situation, self._max_chars) or fallback


def sanitize(text: str, max_chars: int) -> str:
    """Make model text safe to send as a WhatsApp template variable, or return "".

    Meta rejects a parameter containing a newline, a tab, or four-plus consecutive spaces, so
    all runs of whitespace collapse to one space. Over the cap the phrase is cut back to a
    whole word rather than mid-word, and the trailing full stop goes because the template
    supplies the end of the sentence.
    """
    cleaned = re.sub(r"\s+", " ", text).strip().rstrip(".")
    if len(cleaned) <= max_chars:
        return cleaned
    cut = cleaned.rfind(" ", 0, max_chars)
    return cleaned[:cut].rstrip(",;: ") if cut > 0 else ""
