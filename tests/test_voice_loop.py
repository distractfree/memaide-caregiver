import base64

from memaide import config
from memaide.agent.session import AgentSession
from memaide.audio.stt import STTEvent, StubSpeechToText
from memaide.audio.tts import StubTextToSpeech
from memaide.schemas import AgentDecision, PatientContext, VisionContext
from memaide.server.voice_loop import VoiceLoop


class StubBrain:
    def __init__(self, reply="I'm here."):
        self.decision = AgentDecision(reply_text=reply)
        self.seen_vision = "unset"

    async def respond(self, transcript, vision=None, extra_context=None, vision_pending=False):
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
    """One utterance's worth of chunks, wrapped as the single-utterance stream run() takes."""
    async def _chunks():
        for c in chunks:
            yield c

    yield _chunks()


async def _utterances(*utts):
    """A multi-utterance stream: each arg is one utterance's chunk tuple."""
    for chunks in utts:
        async def _chunks(chunks=chunks):
            for c in chunks:
                yield c

        yield _chunks()


class PerUtteranceSTT:
    """Transcribes one utterance to one final whose text is the utterance's bytes."""

    async def transcribe(self, audio):
        buf = bytearray()
        async for c in audio:
            buf.extend(c)
        yield STTEvent("final", buf.decode())


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
    subtitle = next(m for m in sent if m["type"] == "subtitle" and m["role"] == "agent")
    assert "I'm right here." in subtitle["text"]
    audio_out = next(m for m in sent if m["type"] == "audio_out")
    assert base64.b64decode(audio_out["pcm"]) == b"WAV"


async def test_greet_speaks_opening_line_first_and_records_it():
    session = _session(StubBrain())
    sent, send = _collector()
    loop = VoiceLoop(
        session=session,
        stt=StubSpeechToText([]),
        tts=StubTextToSpeech(audio=b"WAV"),
        send=send,
    )
    await loop.greet()

    subtitle = next(m for m in sent if m["type"] == "subtitle")
    assert subtitle["text"] == config.OPENING_LINE
    assert any(m["type"] == "audio_out" for m in sent)
    # Opening is in the transcript so the brain answers the patient instead of re-greeting.
    assert session.transcript[-1].text == config.OPENING_LINE


async def _stream(*items):
    """Yield each item as-is: a bytes tuple becomes one utterance async-iterator, and the
    COMMIT sentinel is yielded straight through (mirrors WebSocketAudioSource.utterances())."""
    from memaide.server.voice_loop import COMMIT

    for item in items:
        if item is COMMIT:
            yield COMMIT
        else:
            async def _chunks(chunks=item):
                for c in chunks:
                    yield c

            yield _chunks()


async def test_utterances_buffer_until_commit_then_one_reply():
    from memaide.server.voice_loop import COMMIT

    session = _session(StubBrain(reply="ok"))
    sent, send = _collector()
    tts = StubTextToSpeech(audio=b"WAV")
    loop = VoiceLoop(session=session, stt=PerUtteranceSTT(), tts=tts, send=send)

    await loop.run(_stream((b"hi",), (b"there",), COMMIT))

    subtitles = [m for m in sent if m["type"] == "subtitle" and m["role"] == "agent"]
    audio_outs = [m for m in sent if m["type"] == "audio_out"]
    assert len(subtitles) == 1       # one coherent reply for the whole turn
    assert len(audio_outs) == 1
    assert tts.last_text == "ok"      # brain ran once over the joined turn, not concatenated


async def test_run_produces_one_turn_per_committed_utterance():
    from memaide.server.voice_loop import COMMIT

    session = _session(StubBrain(reply="ok"))
    sent, send = _collector()
    loop = VoiceLoop(session=session, stt=PerUtteranceSTT(), tts=StubTextToSpeech(audio=b"WAV"), send=send)

    await loop.run(_stream((b"hi",), COMMIT, (b"bye",), COMMIT))

    assert len([m for m in sent if m["type"] == "audio_out"]) == 2  # one reply per committed turn


async def test_audio_end_sends_subtitle_but_no_audio_out_before_commit():
    # A transcribed utterance is shown immediately but not spoken until a commit/flush.
    session = _session(StubBrain(reply="ok"))
    sent, send = _collector()
    loop = VoiceLoop(session=session, stt=PerUtteranceSTT(), tts=StubTextToSpeech(audio=b"WAV"), send=send)

    await loop._handle_final("hello")  # drive one utterance's final; no commit, no stream end

    assert any(m["type"] == "subtitle" for m in sent)
    assert not any(m["type"] == "audio_out" for m in sent)


async def test_pending_turn_is_flushed_when_stream_ends_without_commit():
    # bye/disconnect ends the stream; an in-progress turn must still be spoken, not lost.
    session = _session(StubBrain(reply="ok"))
    sent, send = _collector()
    loop = VoiceLoop(session=session, stt=PerUtteranceSTT(), tts=StubTextToSpeech(audio=b"WAV"), send=send)

    await loop.run(_stream((b"hi",)))  # utterance but no COMMIT before the stream ends

    assert len([m for m in sent if m["type"] == "audio_out"]) == 1


class FlakyFirstSTT:
    """Raises on the first utterance, transcribes the second to one final."""

    def __init__(self):
        self._seen = 0

    async def transcribe(self, audio):
        async for _ in audio:
            pass
        self._seen += 1
        if self._seen == 1:
            raise RuntimeError("stt hiccup")
        yield STTEvent("final", "second")


async def test_run_skips_failed_utterance_and_continues():
    session = _session(StubBrain(reply="ok"))
    sent, send = _collector()
    loop = VoiceLoop(
        session=session,
        stt=FlakyFirstSTT(),
        tts=StubTextToSpeech(audio=b"WAV"),
        send=send,
    )
    await loop.run(_utterances((b"one",), (b"two",)))

    # First utterance's STT error is skipped; the second still yields a turn.
    assert len([m for m in sent if m["type"] == "audio_out"]) == 1


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


async def test_on_escalation_fires_once_across_multiple_escalating_turns():
    session = _session(StubBrain())
    sent, send = _collector()
    reported = []

    async def on_escalation(decision):
        reported.append(decision)

    loop = VoiceLoop(
        session=session,
        stt=StubSpeechToText([STTEvent("final", "I fell"), STTEvent("final", "I fell again")]),
        tts=StubTextToSpeech(audio=b"WAV"),
        send=send,
        on_escalation=on_escalation,
    )
    await loop.run(_audio((b"x", b"y")))

    # "I fell" trips the rule-based monitor on the first turn; callback fires exactly once.
    assert len(reported) == 1
    assert reported[0].escalate is True


async def test_escalating_utterance_flushes_immediately_without_commit():
    # A red-flag utterance must be spoken at once, not held for a commit.
    session = _session(StubBrain())
    sent, send = _collector()
    loop = VoiceLoop(
        session=session,
        stt=StubSpeechToText([]),  # unused; we drive _handle_final directly
        tts=StubTextToSpeech(audio=b"WAV"),
        send=send,
    )

    await loop._handle_final("I fell")  # trips the rule monitor -> escalation bypass

    types = [m["type"] for m in sent]
    assert "escalation" in types
    assert "audio_out" in types  # spoken now, before any commit or stream end


async def test_no_on_escalation_callback_is_fine():
    session = _session(StubBrain())
    sent, send = _collector()
    loop = VoiceLoop(
        session=session,
        stt=StubSpeechToText([STTEvent("final", "I fell")]),
        tts=StubTextToSpeech(audio=b"WAV"),
        send=send,
    )
    await loop.run(_audio())  # no callback provided -> must not raise
    assert any(m["type"] == "escalation" for m in sent)
