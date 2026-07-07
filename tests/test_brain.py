from memaide.agent.brain import AgentBrain
from memaide.schemas import AgentDecision, PatientContext, Role, Turn, VisionContext


class StubClient:
    """Async JSON client stub that records the messages it received."""

    def __init__(self, payload):
        self.payload = payload
        self.last_messages = None

    async def complete_json(self, messages, model=None, temperature=0.4):
        self.last_messages = messages
        return self.payload


def _patient():
    return PatientContext(patient_id="p1", name="Rose")


async def test_respond_parses_decision():
    client = StubClient(
        {"reply_text": "I'm here.", "wants_escalation": False,
         "handoff_ready": False, "intent": "reassure"}
    )
    brain = AgentBrain(client=client, patient=_patient())
    decision = await brain.respond([Turn(role=Role.PATIENT, text="I'm scared")])
    assert isinstance(decision, AgentDecision)
    assert decision.reply_text == "I'm here."
    assert decision.intent == "reassure"


async def test_respond_strips_foreign_language_leak_from_reply():
    client = StubClient(
        {"reply_text": "That could בהחלט make you feel lightheaded.",
         "wants_escalation": False, "handoff_ready": False, "intent": "reassure"}
    )
    brain = AgentBrain(client=client, patient=_patient())
    decision = await brain.respond([Turn(role=Role.PATIENT, text="I feel dizzy")])
    assert decision.reply_text == "That could make you feel lightheaded."


async def test_respond_tolerates_missing_optional_fields():
    client = StubClient({"reply_text": "ok"})
    brain = AgentBrain(client=client, patient=_patient())
    decision = await brain.respond([Turn(role=Role.PATIENT, text="hi")])
    assert decision.wants_escalation is False
    assert decision.intent == "assist"


async def test_build_messages_maps_roles_and_includes_system_prompt():
    client = StubClient({"reply_text": "x"})
    brain = AgentBrain(client=client, patient=_patient())
    transcript = [
        Turn(role=Role.AGENT, text="Hi, I'm here to help."),
        Turn(role=Role.PATIENT, text="I feel dizzy"),
    ]
    await brain.respond(transcript)
    msgs = client.last_messages
    assert msgs[0]["role"] == "system"
    assert "MemAide" in msgs[0]["content"]
    assert {"role": "assistant", "content": "Hi, I'm here to help."} in msgs
    assert {"role": "user", "content": "I feel dizzy"} in msgs


async def test_build_messages_appends_vision_context():
    client = StubClient({"reply_text": "x"})
    brain = AgentBrain(client=client, patient=_patient())
    vision = VisionContext(description="A person is on the floor.",
                           label="person_on_floor", flags=["person_on_floor"])
    await brain.respond([Turn(role=Role.PATIENT, text="...")], vision=vision)
    joined = " ".join(m["content"] for m in client.last_messages)
    assert "VISION CONTEXT" in joined
    assert "person_on_floor" in joined


async def test_build_messages_appends_advisory_segment_when_present():
    client = StubClient({"reply_text": "x"})
    brain = AgentBrain(client=client, patient=_patient())
    vision = VisionContext(
        description="A person sits calmly.", label="living room",
        flags=[], advisory_flags=["person_seated", "tv_on"],
    )
    await brain.respond([Turn(role=Role.PATIENT, text="...")], vision=vision)
    joined = " ".join(
        m["content"] for m in client.last_messages if isinstance(m["content"], str)
    )
    assert "Advisory: person_seated, tv_on" in joined


async def test_respond_appends_extra_context_as_system_messages():
    client = StubClient({"reply_text": "x"})
    brain = AgentBrain(client=client, patient=_patient())
    vision = VisionContext(description="A room.", label="living room")
    await brain.respond(
        [Turn(role=Role.PATIENT, text="hi")],
        vision=vision,
        extra_context=["[VITALS] heart_rate=82", "[LOCATION] bathroom for 240s"],
    )
    contents = [m["content"] for m in client.last_messages]
    system_msgs = [
        c for m, c in zip(client.last_messages, contents) if m["role"] == "system"
    ]
    assert any("[VITALS] heart_rate=82" in c for c in system_msgs)
    assert any("[LOCATION] bathroom for 240s" in c for c in system_msgs)
    # extra_context is injected after the transcript but before the vision block
    vitals_idx = next(i for i, c in enumerate(contents) if "[VITALS]" in c)
    vision_idx = next(i for i, c in enumerate(contents) if "VISION CONTEXT" in c)
    assert vitals_idx < vision_idx


async def test_respond_without_extra_context_unchanged():
    client = StubClient({"reply_text": "x"})
    brain = AgentBrain(client=client, patient=_patient())
    await brain.respond([Turn(role=Role.PATIENT, text="hi")])
    system_msgs = [m for m in client.last_messages if m["role"] == "system"]
    assert len(system_msgs) == 1


async def test_build_messages_omits_advisory_segment_when_empty():
    client = StubClient({"reply_text": "x"})
    brain = AgentBrain(client=client, patient=_patient())
    vision = VisionContext(description="d", label="l")  # advisory_flags defaults to []
    await brain.respond([Turn(role=Role.PATIENT, text="...")], vision=vision)
    joined = " ".join(
        m["content"] for m in client.last_messages if isinstance(m["content"], str)
    )
    assert "Advisory:" not in joined
