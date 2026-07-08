"""Build and send the caregiver WhatsApp alert on a live-session escalation.

Turns an EscalationDecision into the 4-variable `caregiver_alert` template message. The blocking
WhatsApp send is offloaded to a thread so it never stalls the session's event loop, and all
failures are logged and swallowed — a notify must never crash the session.
"""

import asyncio
import logging

from memaide.notify.whatsapp import WhatsAppSender
from memaide.schemas import EscalationDecision
from memaide.service.schemas import CaregiverInfo

_log = logging.getLogger(__name__)

# triggered_by code -> caregiver-facing phrase for {{3}}.
_SITUATION_PHRASES = {
    "vision:person_on_floor": "a possible fall",
    "vision:fall_detected": "a fall",
    "vision:no_motion": "no movement or possible unresponsiveness",
    "distress_keyword": "verbal signs of distress",
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
    """Sends the caregiver `caregiver_alert` WhatsApp for a live-session escalation."""

    def __init__(
        self,
        sender: WhatsAppSender,
        *,
        template: str,
        lang: str,
        portal_base_url: str,
        session_path: str,
        fallback_to: str | None,
    ):
        self._sender = sender
        self._template = template
        self._lang = lang
        self._portal_base_url = portal_base_url
        self._session_path = session_path
        self._fallback_to = fallback_to

    def _session_url(self, session_id: str) -> str:
        return f"{self._portal_base_url}{self._session_path.format(id=session_id)}"

    def _build(
        self,
        session_id: str,
        patient_name: str,
        caregiver: CaregiverInfo | None,
        decision: EscalationDecision,
    ) -> tuple[str | None, list[str]]:
        caregiver_name = caregiver.name if caregiver and caregiver.name else "Caregiver"
        to = caregiver.phone if caregiver and caregiver.phone else self._fallback_to
        variables = [
            caregiver_name,
            patient_name,
            situation_phrase(list(decision.triggered_by)),
            self._session_url(session_id),
        ]
        return to, variables

    async def notify(
        self,
        session_id: str,
        patient_name: str,
        caregiver: CaregiverInfo | None,
        decision: EscalationDecision,
    ) -> None:
        if self._template == "hello_world":
            _log.warning(
                "WHATSAPP_TEMPLATE is still 'hello_world' (takes no variables); the "
                "caregiver_alert send will be rejected. Set WHATSAPP_TEMPLATE=caregiver_alert."
            )
        to, variables = self._build(session_id, patient_name, caregiver, decision)
        if not to:
            _log.warning("[notify] no caregiver phone and no WHATSAPP_TO; skipping alert")
            return
        try:
            await asyncio.to_thread(
                self._sender.send_template, to, self._template, self._lang, variables
            )
        except Exception as exc:  # noqa: BLE001 - a notify must never crash the session
            _log.warning("[notify] WhatsApp caregiver alert failed: %s", exc)
