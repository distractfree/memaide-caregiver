from memaide import config
from memaide.safety.escalation import EscalationMonitor
from memaide.schemas import AgentDecision
from memaide.service.infer import run_infer
from memaide.service.schemas import InferRequest


class StubBrain:
    """Records the transcript/vision/extra_context it was called with."""

    def __init__(self, decision: AgentDecision):
        self._decision = decision
        self.calls: list[dict] = []
        self.patient = None

    async def respond(self, transcript, vision=None, extra_context=None):
        self.calls.append(
            {"transcript": transcript, "vision": vision, "extra_context": extra_context}
        )
        return self._decision


def _make_factory(brain: StubBrain):
    def factory(patient):
        brain.patient = patient
        return brain
    return factory


def _request(**overrides) -> InferRequest:
    data = {
        "session": {"session_id": "s1"},
        "patient": {"patient_id": "p1", "name": "Rose"},
        "latest_message": "I feel a bit dizzy",
    }
    data.update(overrides)
    return InferRequest.model_validate(data)


async def test_run_infer_returns_reply_and_defaults():
    brain = StubBrain(AgentDecision(reply_text="Let's sit down.", intent="reassure"))
    resp = await run_infer(_request(), _make_factory(brain), EscalationMonitor())
    assert resp.reply_text == "Let's sit down."
    assert resp.escalate is False
    assert resp.intent == "reassure"
    assert resp.handoff_ready is False


async def test_run_infer_builds_transcript_from_history_plus_latest():
    brain = StubBrain(AgentDecision(reply_text="ok"))
    req = _request(history=[{"role": "ai", "text": "Hi"}, {"role": "patient", "text": "hello"}])
    await run_infer(req, _make_factory(brain), EscalationMonitor())
    texts = [t.text for t in brain.calls[0]["transcript"]]
    assert texts == ["Hi", "hello", "I feel a bit dizzy"]
    assert brain.calls[0]["transcript"][-1].role.value == "patient"


async def test_run_infer_maps_caregiver_into_patient_notes():
    brain = StubBrain(AgentDecision(reply_text="ok"))
    data = {
        "session": {"session_id": "s1"},
        "patient": {"patient_id": "p1", "name": "Rose", "caregiver": {"name": "John"}},
        "latest_message": "hi",
    }
    await run_infer(InferRequest.model_validate(data), _make_factory(brain), EscalationMonitor())
    assert "John" in (brain.patient.notes or "")


async def test_run_infer_threads_vitals_and_beacons_as_extra_context():
    brain = StubBrain(AgentDecision(reply_text="ok"))
    data = {
        "session": {"session_id": "s1"},
        "patient": {"patient_id": "p1", "name": "Rose"},
        "latest_message": "hi",
        "vitals": {"heart_rate": 82, "motion_state": "still", "step_count": 1203},
        "beacons_triggered": [{"room": "bathroom", "dwell_seconds": 240,
                               "estimated_distance_m": 1.2}],
    }
    await run_infer(InferRequest.model_validate(data), _make_factory(brain), EscalationMonitor())
    extra = brain.calls[0]["extra_context"]
    assert any("[VITALS]" in c and "heart_rate=82" in c and "motion=still" in c for c in extra)
    assert any("[LOCATION] bathroom for 240s" in c and "~1.2m" in c for c in extra)


async def test_run_infer_no_live_context_yields_empty_extra():
    brain = StubBrain(AgentDecision(reply_text="ok"))
    await run_infer(_request(), _make_factory(brain), EscalationMonitor())
    assert brain.calls[0]["extra_context"] == []


async def test_run_infer_escalates_on_distress_keyword_with_rule_reason():
    brain = StubBrain(AgentDecision(reply_text="I'm here."))
    resp = await run_infer(
        _request(latest_message="I can't breathe"), _make_factory(brain), EscalationMonitor()
    )
    assert resp.escalate is True
    assert "distress_keyword" in resp.escalation.triggered_by
    assert config.EMERGENCY_SUGGESTION in resp.reply_text


async def test_run_infer_escalates_on_agent_request_with_fallback_reason():
    brain = StubBrain(AgentDecision(reply_text="This sounds serious.", wants_escalation=True))
    resp = await run_infer(
        _request(latest_message="my vision went dark"), _make_factory(brain), EscalationMonitor()
    )
    assert resp.escalate is True
    assert resp.escalation.reason == "agent_requested"
    assert resp.escalation.triggered_by == ["agent"]
    assert config.EMERGENCY_SUGGESTION in resp.reply_text


async def test_run_infer_no_escalation_leaves_reason_blank_and_no_suffix():
    brain = StubBrain(AgentDecision(reply_text="You're okay."))
    resp = await run_infer(
        _request(latest_message="I feel a little lonely"), _make_factory(brain), EscalationMonitor()
    )
    assert resp.escalate is False
    assert resp.escalation.reason == ""
    assert resp.escalation.triggered_by == []
    assert config.EMERGENCY_SUGGESTION not in resp.reply_text


async def test_run_infer_does_not_double_append_emergency_suffix():
    line = config.EMERGENCY_SUGGESTION
    brain = StubBrain(AgentDecision(reply_text=f"Stay calm. {line}", wants_escalation=True))
    resp = await run_infer(_request(), _make_factory(brain), EscalationMonitor())
    assert resp.reply_text.count(line) == 1


async def test_run_infer_unknown_history_role_maps_to_system():
    brain = StubBrain(AgentDecision(reply_text="ok"))
    req = _request(history=[{"role": "supervisor", "text": "note"}])
    await run_infer(req, _make_factory(brain), EscalationMonitor())
    # the unmapped role falls back to SYSTEM; latest_message is the trailing patient turn
    transcript = brain.calls[0]["transcript"]
    assert transcript[0].role.value == "system"
    assert transcript[0].text == "note"


async def test_run_infer_appends_caregiver_to_existing_notes():
    brain = StubBrain(AgentDecision(reply_text="ok"))
    data = {
        "session": {"session_id": "s1"},
        "patient": {"patient_id": "p1", "name": "Rose", "notes": "Hard of hearing.",
                    "caregiver": {"name": "John"}},
        "latest_message": "hi",
    }
    await run_infer(InferRequest.model_validate(data), _make_factory(brain), EscalationMonitor())
    assert "Hard of hearing." in brain.patient.notes
    assert "Caregiver on call: John." in brain.patient.notes


async def test_run_infer_skips_beacon_without_room():
    brain = StubBrain(AgentDecision(reply_text="ok"))
    data = {
        "session": {"session_id": "s1"},
        "patient": {"patient_id": "p1", "name": "Rose"},
        "latest_message": "hi",
        "beacons_triggered": [{"dwell_seconds": 30}],  # no room -> dropped
    }
    await run_infer(InferRequest.model_validate(data), _make_factory(brain), EscalationMonitor())
    assert not any("[LOCATION]" in c for c in brain.calls[0]["extra_context"])


async def test_run_infer_partial_vitals_only_includes_present_parts():
    brain = StubBrain(AgentDecision(reply_text="ok"))
    data = {
        "session": {"session_id": "s1"},
        "patient": {"patient_id": "p1", "name": "Rose"},
        "latest_message": "hi",
        "vitals": {"heart_rate": 70},  # motion_state / step_count absent
    }
    await run_infer(InferRequest.model_validate(data), _make_factory(brain), EscalationMonitor())
    vitals = next(c for c in brain.calls[0]["extra_context"] if "[VITALS]" in c)
    assert "heart_rate=70" in vitals
    assert "motion=" not in vitals
    assert "steps=" not in vitals


async def test_run_infer_rule_and_agent_both_escalate_rule_reason_wins():
    brain = StubBrain(AgentDecision(reply_text="I'm here.", wants_escalation=True))
    resp = await run_infer(
        _request(latest_message="I can't breathe"), _make_factory(brain), EscalationMonitor()
    )
    assert resp.escalate is True
    assert "distress_keyword" in resp.escalation.triggered_by
    assert "agent" not in resp.escalation.triggered_by
