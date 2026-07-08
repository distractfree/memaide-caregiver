from memaide.notify.escalation_alert import EscalationNotifier, situation_phrase
from memaide.schemas import EscalationDecision
from memaide.service.schemas import CaregiverInfo


def test_situation_phrase_maps_known_code():
    assert situation_phrase(["vision:person_on_floor"]) == "a possible fall"


def test_situation_phrase_joins_multiple():
    assert (
        situation_phrase(["vision:person_on_floor", "vision:no_motion"])
        == "a possible fall and no movement or possible unresponsiveness"
    )


def test_situation_phrase_unknown_code_falls_back():
    assert situation_phrase(["mystery"]) == "a possible emergency"


def test_situation_phrase_empty_falls_back():
    assert situation_phrase([]) == "a possible emergency"


def _decision(triggered):
    return EscalationDecision(
        escalate=True, reason="; ".join(triggered), triggered_by=triggered
    )


class _FakeSender:
    def __init__(self, ok=True):
        self.calls = []
        self._ok = ok

    def send_template(self, to, template="hello_world", lang="en_US", variables=None):
        self.calls.append((to, template, lang, variables))
        return self._ok


def _notifier(sender, template="caregiver_alert", fallback_to="+1999"):
    return EscalationNotifier(
        sender,
        template=template,
        lang="en_US",
        portal_base_url="https://caregiver.guardianova.com",
        session_path="/session/{id}",
        fallback_to=fallback_to,
    )


async def test_notify_builds_four_variables_and_uses_caregiver_phone():
    sender = _FakeSender()
    cg = CaregiverInfo(name="Anthony", phone="+15551234567")
    await _notifier(sender).notify("123", "John", cg, _decision(["vision:person_on_floor"]))
    to, template, lang, variables = sender.calls[-1]
    assert to == "+15551234567"
    assert template == "caregiver_alert"
    assert variables == [
        "Anthony",
        "John",
        "a possible fall",
        "https://caregiver.guardianova.com/session/123",
    ]


async def test_notify_falls_back_to_configured_recipient_without_phone():
    sender = _FakeSender()
    cg = CaregiverInfo(name="Anthony", phone=None)
    await _notifier(sender, fallback_to="+1999").notify(
        "123", "John", cg, _decision(["distress_keyword"])
    )
    to, _t, _l, variables = sender.calls[-1]
    assert to == "+1999"
    assert variables[0] == "Anthony"
    assert variables[2] == "verbal signs of distress"


async def test_notify_uses_default_name_when_no_caregiver():
    sender = _FakeSender()
    await _notifier(sender).notify("123", "John", None, _decision(["vision:fall_detected"]))
    to, _t, _l, variables = sender.calls[-1]
    assert variables[0] == "Caregiver"
    assert to == "+1999"


async def test_notify_swallows_sender_failure():
    class _Boom:
        def send_template(self, *a, **k):
            raise RuntimeError("network down")

    # Must not raise.
    await _notifier(_Boom()).notify("123", "John", None, _decision(["distress_keyword"]))


async def test_notify_skips_when_no_recipient():
    sender = _FakeSender()
    await _notifier(sender, fallback_to=None).notify(
        "123", "John", None, _decision(["distress_keyword"])
    )
    assert sender.calls == []
