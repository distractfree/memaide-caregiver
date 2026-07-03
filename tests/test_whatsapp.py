from memaide.notify.whatsapp import HttpResponse, WhatsAppSender


class _FakePoster:
    """Records the last POST and returns a canned response (or raises)."""

    def __init__(self, response: HttpResponse | None = None, exc: Exception | None = None):
        self.response = response or HttpResponse(200, '{"messages":[{"id":"wamid.X"}]}')
        self.exc = exc
        self.calls: list[tuple[str, dict, dict]] = []

    def __call__(self, url: str, headers: dict, payload: dict) -> HttpResponse:
        self.calls.append((url, headers, payload))
        if self.exc is not None:
            raise self.exc
        return self.response


def _sender(poster: _FakePoster) -> WhatsAppSender:
    return WhatsAppSender(token="TKN", phone_number_id="PNID", poster=poster)


def test_send_text_posts_expected_request_and_returns_true():
    poster = _FakePoster()
    ok = _sender(poster).send_text("+15551234567", "hello there")

    assert ok is True
    url, headers, payload = poster.calls[-1]
    assert url == "https://graph.facebook.com/v22.0/PNID/messages"
    assert headers["Authorization"] == "Bearer TKN"
    assert payload == {
        "messaging_product": "whatsapp",
        "to": "+15551234567",
        "type": "text",
        "text": {"body": "hello there"},
    }


def test_send_template_posts_template_payload():
    poster = _FakePoster()
    ok = _sender(poster).send_template("+15551234567", "hello_world", "en_US")

    assert ok is True
    _url, _headers, payload = poster.calls[-1]
    assert payload == {
        "messaging_product": "whatsapp",
        "to": "+15551234567",
        "type": "template",
        "template": {"name": "hello_world", "language": {"code": "en_US"}},
    }


def test_send_returns_false_on_http_error_status():
    poster = _FakePoster(HttpResponse(400, '{"error":{"message":"bad"}}'))
    assert _sender(poster).send_text("+15551234567", "x") is False


def test_send_swallows_exception_and_returns_false():
    poster = _FakePoster(exc=RuntimeError("network down"))
    # Must not raise.
    assert _sender(poster).send_text("+15551234567", "x") is False
