from memaide.vision.describer import VisionDescriber
from memaide.vision.rule_check import StubVisionCheck, VisionCheck


def test_stub_vision_check_returns_configured_flags():
    check = StubVisionCheck(flags=["person_on_floor"])
    assert check.check(frame=None) == ["person_on_floor"]


def test_stub_vision_check_defaults_to_empty():
    assert StubVisionCheck().check() == []


def test_stub_is_a_vision_check():
    assert isinstance(StubVisionCheck(), VisionCheck)


class RecordingClient:
    """Fake JSON client: records the request and returns a fixed payload."""

    def __init__(self, payload):
        self.payload = payload
        self.last_messages = None
        self.last_model = None
        self.last_temperature = None

    async def complete_json(self, messages, model=None, temperature=None):
        self.last_messages = messages
        self.last_model = model
        self.last_temperature = temperature
        return self.payload


async def test_describer_returns_vision_context_with_advisory_flags():
    client = RecordingClient(
        {"description": "A person sits at a kitchen table.", "label": "kitchen",
         "flags": ["person_seated", "tv_on"]}
    )
    describer = VisionDescriber(client=client)
    ctx = await describer.describe("data:image/jpeg;base64,QUJD")
    assert ctx.description == "A person sits at a kitchen table."
    assert ctx.label == "kitchen"
    assert ctx.advisory_flags == ["person_seated", "tv_on"]
    assert ctx.flags == []  # describer never populates the rule-based flags


async def test_describer_sends_image_part_with_configured_model_and_detail():
    client = RecordingClient({"description": "d", "label": "l", "flags": []})
    describer = VisionDescriber(client=client, model="gpt-5.4-mini", detail="high")
    await describer.describe("data:image/png;base64,QUJD")

    assert client.last_model == "gpt-5.4-mini"
    user_msg = client.last_messages[-1]
    assert user_msg["role"] == "user"
    image_part = [p for p in user_msg["content"] if p["type"] == "image_url"][0]
    assert image_part["image_url"]["url"] == "data:image/png;base64,QUJD"
    assert image_part["image_url"]["detail"] == "high"


async def test_describer_tolerates_missing_flags():
    client = RecordingClient({"description": "d", "label": "l"})
    ctx = await VisionDescriber(client=client).describe("data:image/jpeg;base64,QUJD")
    assert ctx.advisory_flags == []
