"""Server-side WhatsApp sender over the Meta WhatsApp Cloud API (Graph API).

Sends a text or an approved template message to a number. The HTTP POST is injected
(``poster``) so it is unit-testable without the network; the default uses stdlib ``urllib``
(no extra dependency). All failures are logged and swallowed — a notify must never crash a
caller (e.g. the escalation path).

First-contact note: Meta only allows free-form ``send_text`` within 24h of the recipient
messaging your business number; otherwise the first message must be an approved template
(``send_template``, e.g. ``hello_world``).
"""

import json
import logging
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Callable

_log = logging.getLogger(__name__)

GRAPH_API_VERSION = "v22.0"


@dataclass
class HttpResponse:
    status_code: int
    text: str = ""


Poster = Callable[[str, dict, dict], HttpResponse]


def _urllib_poster(url: str, headers: dict, payload: dict) -> HttpResponse:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return HttpResponse(resp.status, resp.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as exc:  # 4xx/5xx carry a JSON error body worth logging
        return HttpResponse(exc.code, exc.read().decode("utf-8", "replace"))


class WhatsAppSender:
    def __init__(self, token: str, phone_number_id: str, poster: Poster | None = None):
        self._token = token
        self._phone_number_id = phone_number_id
        self._post = poster or _urllib_poster

    @property
    def _url(self) -> str:
        return (
            f"https://graph.facebook.com/{GRAPH_API_VERSION}"
            f"/{self._phone_number_id}/messages"
        )

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
        }

    def _send(self, payload: dict) -> bool:
        try:
            resp = self._post(self._url, self._headers(), payload)
        except Exception as exc:  # noqa: BLE001 - a notify must never crash the caller
            _log.warning("WhatsApp send failed: %s", exc)
            return False
        if 200 <= resp.status_code < 300:
            return True
        _log.warning("WhatsApp send HTTP %s: %s", resp.status_code, resp.text)
        return False

    def send_text(self, to: str, text: str) -> bool:
        return self._send(
            {
                "messaging_product": "whatsapp",
                "to": to,
                "type": "text",
                "text": {"body": text},
            }
        )

    def send_template(self, to: str, template: str = "hello_world", lang: str = "en_US") -> bool:
        return self._send(
            {
                "messaging_product": "whatsapp",
                "to": to,
                "type": "template",
                "template": {"name": template, "language": {"code": lang}},
            }
        )
