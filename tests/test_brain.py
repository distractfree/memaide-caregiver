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
