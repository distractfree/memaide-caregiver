from memaide import config
from memaide.notify.escalation_alert import EscalationNotifier, situation_phrase
from memaide.schemas import EscalationDecision, Role, Turn, VisionContext
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


def _notifier(sender, template="caregiver_alert", fallback_to="+1999", summarizer=None):
    return EscalationNotifier(
        sender,
        template=template,
        lang="en_US",
        portal_base_url="https://caregiver.guardianova.com",
        session_path="/session/{id}",
        fallback_to=fallback_to,
        situation_summarizer=summarizer,
    )


class _FakeSituation:
    """Stands in for SituationSummarizer: records its inputs, returns a fixed phrase."""

    def __init__(self, phrase="a fall in the kitchen and a hurt hip", error=None):
        self._phrase = phrase
        self._error = error
        self.calls = []

    async def phrase(self, transcript, scene, fallback):
        self.calls.append((transcript, scene, fallback))
        if self._error:
            raise self._error
        return self._phrase


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
    assert variables[2] == "distress in what they told us"


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


# --- situation-specific {{3}} ---

async def test_notify_uses_the_situation_summarizer_for_variable_three():
    sender = _FakeSender()
    situation = _FakeSituation()
    transcript = [Turn(role=Role.PATIENT, text="I fell and my hip hurts")]
    scene = VisionContext(description="A person on the kitchen floor.", label="person_on_floor")
    await _notifier(sender, summarizer=situation).notify(
        "123", "John", None, _decision(["distress_keyword"]), transcript=transcript, scene=scene
    )
    _to, _t, _l, variables = sender.calls[-1]
    assert variables[2] == "a fall in the kitchen and a hurt hip"
    # the summarizer sees the session facts and the static phrase to fall back on
    sent_transcript, sent_scene, fallback = situation.calls[-1]
    assert sent_transcript == transcript
    assert sent_scene is scene
    assert fallback == "distress in what they told us"


async def test_notify_falls_back_to_static_phrase_when_summarizer_raises():
    sender = _FakeSender()
    situation = _FakeSituation(error=RuntimeError("boom"))
    await _notifier(sender, summarizer=situation).notify(
        "123", "John", None, _decision(["vision:person_on_floor"]),
        transcript=[Turn(role=Role.PATIENT, text="help")],
    )
    _to, _t, _l, variables = sender.calls[-1]
    assert variables[2] == "a possible fall"


async def test_notify_without_summarizer_keeps_static_phrase():
    sender = _FakeSender()
    await _notifier(sender).notify("123", "John", None, _decision(["vision:no_motion"]))
    _to, _t, _l, variables = sender.calls[-1]
    assert variables[2] == "no movement or possible unresponsiveness"


# --- end-of-session wrap-up ---

async def test_notify_session_end_sends_the_summary():
    sender = _FakeSender()
    cg = CaregiverInfo(name="Anthony", phone="+15551234567")
    await _notifier(sender).notify_session_end(
        "123", "John", cg, "John said he felt dizzy after standing up. I kept him seated."
    )
    to, template, _l, variables = sender.calls[-1]
    assert to == "+15551234567"
    assert template == "caregiver_alert"
    assert variables == [
        "Anthony",
        "John",
        "John said he felt dizzy after standing up. I kept him seated",
        "https://caregiver.guardianova.com/session/123",
    ]


async def test_notify_session_end_falls_back_without_a_summary():
    sender = _FakeSender()
    await _notifier(sender).notify_session_end("123", "John", None, None)
    _to, _t, _l, variables = sender.calls[-1]
    assert variables[2] == config.SESSION_SUMMARY_FALLBACK


async def test_notify_session_end_flattens_a_multiline_summary():
    sender = _FakeSender()
    await _notifier(sender).notify_session_end("123", "John", None, "He fell.\nHe is up now.")
    _to, _t, _l, variables = sender.calls[-1]
    assert "\n" not in variables[2]


async def test_notify_session_end_skips_when_no_recipient():
    sender = _FakeSender()
    await _notifier(sender, fallback_to=None).notify_session_end("123", "John", None, "x")
    assert sender.calls == []


async def test_notify_session_end_swallows_sender_failure():
    class _Boom:
        def send_template(self, *a, **k):
            raise RuntimeError("network down")

    # Must not raise: a failed wrap-up cannot break session teardown.
    await _notifier(_Boom()).notify_session_end("123", "John", None, "x")
