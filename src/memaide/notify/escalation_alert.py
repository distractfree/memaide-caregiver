"""Build and send the caregiver WhatsApp messages for a live session.

Two sends, both on the 4-variable `caregiver_alert` template ({{1}} caregiver, {{2}} patient,
{{3}} situation, {{4}} portal link):

* ``notify`` fires the moment the session escalates. {{3}} describes what is happening: a
  short line written from the live transcript by an injected ``SituationSummarizer`` when one
  is available, falling back to the static trigger phrase below.
* ``notify_session_end`` fires after every help session, escalated or not, carrying the same
  summary koko's portal shows.

The blocking WhatsApp send is offloaded to a thread so it never stalls the session's event
loop, and all failures are logged and swallowed, because a notify must never crash the
session.
"""

import asyncio
import logging

from memaide import config
from memaide.notify.alert_summary import sanitize
from memaide.notify.whatsapp import WhatsAppSender
from memaide.schemas import EscalationDecision, Turn, VisionContext
from memaide.service.schemas import CaregiverInfo

_log = logging.getLogger(__name__)

# triggered_by code -> caregiver-facing phrase for {{3}}.
_SITUATION_PHRASES = {
    "vision:person_on_floor": "a possible fall",
    "vision:fall_detected": "a fall",
    "vision:no_motion": "no movement or possible unresponsiveness",
    # Reads inside the template's "We are detecting signs of ___", so no phrase here may
    # repeat the word "signs".
    "distress_keyword": "distress in what they told us",
    "silence_with_abnormal_vision": "no response with concerning surroundings",
}
_GENERIC_SITUATION = "a possible emergency"


def situation_phrase(triggered_by: list[str]) -> str:
    """Map escalation trigger codes to one caregiver-facing situation phrase ({{3}})."""
    phrases = [_SITUATION_PHRASES.get(code) for code in triggered_by]
    phrases = [p for p in phrases if p]
    if not phrases:
        return _GENERIC_SITUATION
    return " and ".join(phrases)


class EscalationNotifier:
    """Sends the caregiver `caregiver_alert` WhatsApp on escalation and at session end.

    ``situation_summarizer`` is optional: with one, {{3}} on the escalation alert describes
    what this person actually said; without one (or when it fails), {{3}} is the static
    phrase mapped from the trigger code.
    """

    def __init__(
        self,
        sender: WhatsAppSender,
        *,
        template: str,
        lang: str,
        portal_base_url: str,
        session_path: str,
        fallback_to: str | None,
        situation_summarizer=None,
    ):
        self._sender = sender
        self._template = template
        self._lang = lang
        self._portal_base_url = portal_base_url
        self._session_path = session_path
        self._fallback_to = fallback_to
        self._situation_summarizer = situation_summarizer

    def _session_url(self, session_id: str) -> str:
        return f"{self._portal_base_url}{self._session_path.format(id=session_id)}"

    def _recipient(self, caregiver: CaregiverInfo | None) -> str | None:
        return caregiver.phone if caregiver and caregiver.phone else self._fallback_to

    @staticmethod
    def _caregiver_name(caregiver: CaregiverInfo | None) -> str:
        return caregiver.name if caregiver and caregiver.name else "Caregiver"

    async def _situation(
        self,
        decision: EscalationDecision,
        transcript: list[Turn] | None,
        scene: VisionContext | None,
    ) -> str:
        fallback = situation_phrase(list(decision.triggered_by))
        if self._situation_summarizer is None:
            return fallback
        try:
            return await self._situation_summarizer.phrase(transcript, scene, fallback)
        except Exception as exc:  # noqa: BLE001 - the alert goes out either way
            _log.warning("[notify] situation phrase failed: %s", exc)
            return fallback

    async def _send(self, to: str, variables: list[str], what: str) -> None:
        if self._template == "hello_world":
            _log.warning(
                "WHATSAPP_TEMPLATE is still 'hello_world' (takes no variables); the "
                "caregiver_alert send will be rejected. Set WHATSAPP_TEMPLATE=caregiver_alert."
            )
        try:
            await asyncio.to_thread(
                self._sender.send_template, to, self._template, self._lang, variables
            )
        except Exception as exc:  # noqa: BLE001 - a notify must never crash the session
            _log.warning("[notify] WhatsApp %s failed: %s", what, exc)

    async def notify(
        self,
        session_id: str,
        patient_name: str,
        caregiver: CaregiverInfo | None,
        decision: EscalationDecision,
        transcript: list[Turn] | None = None,
        scene: VisionContext | None = None,
    ) -> None:
        to = self._recipient(caregiver)
        if not to:
            _log.warning("[notify] no caregiver phone and no WHATSAPP_TO; skipping alert")
            return
        variables = [
            self._caregiver_name(caregiver),
            patient_name,
            await self._situation(decision, transcript, scene),
            self._session_url(session_id),
        ]
        await self._send(to, variables, "caregiver alert")

    async def notify_session_end(
        self,
        session_id: str,
        patient_name: str,
        caregiver: CaregiverInfo | None,
        summary: str | None,
    ) -> None:
        """Send the caregiver the wrap-up after any help session, escalated or not.

        ``summary`` is the same text posted to koko's portal; when it is missing (no patient
        speech, or the summarizer declined) {{3}} falls back to a neutral phrase rather than
        the message being dropped, so the caregiver always hears that a session happened.
        """
        to = self._recipient(caregiver)
        if not to:
            _log.warning("[notify] no caregiver phone and no WHATSAPP_TO; skipping wrap-up")
            return
        situation = sanitize(summary or "", config.SESSION_SUMMARY_MAX_CHARS)
        variables = [
            self._caregiver_name(caregiver),
            patient_name,
            situation or config.SESSION_SUMMARY_FALLBACK,
            self._session_url(session_id),
        ]
        await self._send(to, variables, "session wrap-up")
