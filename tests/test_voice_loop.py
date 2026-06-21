import base64

from memaide.agent.session import AgentSession
from memaide.audio.stt import STTEvent, StubSpeechToText
from memaide.audio.tts import StubTextToSpeech
from memaide.schemas import AgentDecision, PatientContext, VisionContext
from memaide.server.voice_loop import VoiceLoop


class StubBrain:
    def __init__(self, reply="I'm here."):
        self.decision = AgentDecision(reply_text=reply)
        self.seen_vision = "unset"

    async def respond(self, transcript, vision=None):
        self.seen_vision = vision
        return self.decision


class RaisingTTS:
    async def synthesize(self, text):
        raise RuntimeError("tts down")


def _session(brain):
    return AgentSession(
        brain=brain,
        patient=PatientContext(patient_id="p1", name="Rose"),
        session_id="s1",
    )


async def _audio(chunks=(b"x",)):
    for c in chunks:
        yield c


def _collector():
    sent = []

    async def send(msg):
        sent.append(msg)

    return sent, send


def _clock(values):
    it = iter(values)
    return lambda: next(it)


async def test_one_full_turn_sends_subtitle_and_audio_with_latest_vision():
    brain = StubBrain(reply="I'm right here.")
    session = _session(brain)
    sent, send = _collector()
    scene = VisionContext(description="seated", label="living room")
    loop = VoiceLoop(
        session=session,
        stt=StubSpeechToText([STTEvent("partial", "I'm"), STTEvent("final", "I'm cold")]),
        tts=StubTextToSpeech(audio=b"WAV"),
        send=send,
        get_vision=lambda: scene,
    )
    await loop.run(_audio())

    assert brain.seen_vision is scene  # brain saw the latest scene
    types = [m["type"] for m in sent]
    assert "subtitle" in types and "audio_out" in types
    subtitle = next(m for m in sent if m["type"] == "subtitle")
    assert "I'm right here." in subtitle["text"]
    audio_out = next(m for m in sent if m["type"] == "audio_out")
    assert base64.b64decode(audio_out["pcm"]) == b"WAV"


async def test_silence_tick_emits_escalation_and_suggestion():
    session = _session(StubBrain())
    sent, send = _collector()
    scene = VisionContext(
        description="on floor", label="floor", flags=["person_on_floor"]
    )
    loop = VoiceLoop(
        session=session,
        stt=StubSpeechToText([]),
        tts=StubTextToSpeech(),
        send=send,
        get_vision=lambda: scene,
        clock=_clock([0.0, 60.0]),
    )
    await loop.on_silence()

    types = [m["type"] for m in sent]
    assert "escalation" in types
    subtitle = next(m for m in sent if m["type"] == "subtitle")
    assert "911" in subtitle["text"]


async def test_tts_failure_still_sends_subtitle_but_no_audio_out():
    session = _session(StubBrain(reply="Stay calm."))
    sent, send = _collector()
    loop = VoiceLoop(
        session=session,
        stt=StubSpeechToText([STTEvent("final", "hello")]),
        tts=RaisingTTS(),
        send=send,
    )
    await loop.run(_audio())

    types = [m["type"] for m in sent]
    assert "subtitle" in types
    assert "audio_out" not in types
