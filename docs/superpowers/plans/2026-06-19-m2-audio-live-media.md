# M2 Audio + Live-Media Implementation Plan (Plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the voice + live-media half of Milestone 2 on top of the finished vision pipeline: streaming STT and batch TTS converters, a silence-tick on `AgentSession`, a per-connection `VoiceLoop`, and a thin WebSocket server that carries both the POV-frame and microphone streams into the text brain and back out as spoken replies.

**Architecture:** One WebSocket connection per Help session carries both media streams. The server demuxes inbound messages by `type` (`frame` → vision, `audio` → voice, `hello`/`bye` → control) and runs two concurrent tasks: the already-built `VisionPipeline` (keeps the "latest scene" + echoes it) and a turn-based `VoiceLoop`. The voice path is **STT → text brain → TTS**: the audio models are pure converters and do no reasoning; all judgment stays in the existing `AgentBrain` and the rule-based `EscalationMonitor`. A silence timer fires `AgentSession.on_silence_tick` so the rule-based "silence + abnormal vision" escalation can trigger without patient speech. Every audio/vision seam is injectable so the whole stack is testable with stubs and no network or audio devices.

**Tech Stack:** Python 3.11, pydantic v2, `openai` async SDK (audio transcriptions + speech), `websockets>=12` (lightweight pure-asyncio WS), pytest (`asyncio_mode=auto`).

**Branch:** `feat/agent-foundation-m1` (continue here; do not branch).

**Scope note:** This is Plan B of two. Plan A (the vision pipeline: describer, frame source, `VisionPipeline`, `advisory_flags`, vision eval) is already complete and committed. This plan consumes the "latest scene" Plan A produces and adds only the audio + transport layer.

**Environment note:** Subagents in this environment can't get Edit/Bash permissions approved (they run non-interactively), so subagent-driven execution comes back BLOCKED. Execute this plan **inline** with the same per-task TDD discipline (failing test → implement → green → commit + full-suite verify).

## File structure

| File | Responsibility | New? |
|---|---|---|
| `src/memaide/config.py` | audio + WS settings; deprecate `REALTIME_MODEL` | modify |
| `pyproject.toml` | add `websockets>=12` runtime dep | modify |
| `src/memaide/audio/__init__.py` | new `audio/` package marker | create |
| `src/memaide/audio/stt.py` | `STTEvent`, `SpeechToText`, `StubSpeechToText` | create |
| `src/memaide/audio/tts.py` | `TextToSpeech`, `StubTextToSpeech` | create |
| `src/memaide/agent/session.py` | `on_silence_tick`, `last_escalation` | modify |
| `src/memaide/server/__init__.py` | new `server/` package marker | create |
| `src/memaide/server/voice_loop.py` | `VoiceLoop` (per-connection turn loop) | create |
| `src/memaide/server/ws.py` | demux server, WS media sources, `serve` | create |
| `docs/architecture.md`, `README.md` | document the audio/voice/WS layer | modify |

---

### Task 1: Config + dependency for audio and the WebSocket server

**Files:**
- Modify: `src/memaide/config.py:14` and `src/memaide/config.py:57-60`
- Modify: `pyproject.toml:10-14`
- Test: `tests/test_config.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_config.py`:

```python
def test_audio_and_ws_config_present():
    from memaide import config

    assert config.STT_MODEL == "gpt-4o-mini-transcribe"
    assert config.TTS_MODEL == "gpt-4o-mini-tts"
    assert isinstance(config.TTS_VOICE, str) and config.TTS_VOICE
    assert config.AUDIO_FORMAT
    assert config.AUDIO_SAMPLE_RATE > 0
    assert config.WS_HOST
    assert isinstance(config.WS_PORT, int) and config.WS_PORT > 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python -m pytest tests/test_config.py::test_audio_and_ws_config_present -v`
Expected: FAIL — `AttributeError: module 'memaide.config' has no attribute 'STT_MODEL'`.

- [ ] **Step 3: Add the config**

In `src/memaide/config.py`, change the `REALTIME_MODEL` line (line 14) to mark it deprecated:

```python
REALTIME_MODEL = "gpt-4o-mini-realtime-preview"  # DEPRECATED (M2): superseded by the STT->brain->TTS pipeline; kept, not wired.
```

Then, after the `VISION_PRICING = { ... }` block (currently ending at line 60) and **before** the `# --- Secrets ---` section, insert:

```python
# --- Audio (Milestone 2, Plan B) ---
# STT and TTS are pure converters (no inference); all reasoning stays in the text brain.
STT_MODEL = "gpt-4o-mini-transcribe"  # $0.003/min streaming transcription
TTS_MODEL = "gpt-4o-mini-tts"  # ~$0.015/min batch synthesis
TTS_VOICE = "alloy"
AUDIO_FORMAT = "pcm16"
AUDIO_SAMPLE_RATE = 24000

# --- WebSocket live-media server (Milestone 2, Plan B) ---
WS_HOST = "0.0.0.0"
WS_PORT = 8765
```

In `pyproject.toml`, add `websockets>=12` to `dependencies` (STT/TTS need no new dep — they use the existing `openai` SDK):

```toml
dependencies = [
    "pydantic>=2.6",
    "openai>=1.40",
    "python-dotenv>=1.0",
    "websockets>=12",
]
```

- [ ] **Step 4: Install the new dependency and run tests**

Run: `.venv\Scripts\python -m pip install "websockets>=12"`
Then: `.venv\Scripts\python -m pytest tests/test_config.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/memaide/config.py pyproject.toml tests/test_config.py
git commit -m "feat(config): add audio + websocket settings; deprecate REALTIME_MODEL"
```

---

### Task 2: `audio/` package — `STTEvent` + streaming `SpeechToText`

**Files:**
- Create: `src/memaide/audio/__init__.py`
- Create: `src/memaide/audio/stt.py`
- Test: `tests/test_stt.py` (new file)

- [ ] **Step 1: Write the failing tests**

Create `src/memaide/audio/__init__.py` (empty file) so the package imports.

Create `tests/test_stt.py`:

```python
from memaide import config
from memaide.audio.stt import STTEvent, SpeechToText, StubSpeechToText


async def _audio(chunks):
    for c in chunks:
        yield c


class _Event:
    def __init__(self, type, **kw):
        self.type = type
        for k, v in kw.items():
            setattr(self, k, v)


class _FakeStream:
    def __init__(self, events):
        self._events = events

    def __aiter__(self):
        return self._aiter()

    async def _aiter(self):
        for e in self._events:
            yield e


class _FakeTranscriptions:
    def __init__(self, events):
        self._events = events
        self.kwargs = None

    async def create(self, **kwargs):
        self.kwargs = kwargs
        return _FakeStream(self._events)


class _FakeClient:
    def __init__(self, events):
        self.audio = type("A", (), {"transcriptions": _FakeTranscriptions(events)})()


async def test_stt_yields_partial_then_final_and_targets_model():
    events = [
        _Event("transcript.text.delta", delta="I'm "),
        _Event("transcript.text.delta", delta="cold"),
        _Event("transcript.text.done", text="I'm cold"),
    ]
    client = _FakeClient(events)
    stt = SpeechToText(client=client)
    out = [e async for e in stt.transcribe(_audio([b"aa", b"bb"]))]
    assert [(e.kind, e.text) for e in out] == [
        ("partial", "I'm "), ("partial", "cold"), ("final", "I'm cold"),
    ]
    assert client.audio.transcriptions.kwargs["model"] == config.STT_MODEL
    assert client.audio.transcriptions.kwargs["stream"] is True


async def test_stt_assembles_all_audio_chunks_into_one_file():
    client = _FakeClient([_Event("transcript.text.done", text="ok")])
    stt = SpeechToText(client=client)
    _ = [e async for e in stt.transcribe(_audio([b"12", b"34", b"5"]))]
    _name, data = client.audio.transcriptions.kwargs["file"]
    assert data == b"12345"


async def test_stub_stt_replays_scripted_events_and_drains_audio():
    drained = []

    async def audio():
        for c in [b"x", b"y"]:
            drained.append(c)
            yield c

    stub = StubSpeechToText([STTEvent("partial", "he"), STTEvent("final", "hello")])
    out = [e async for e in stub.transcribe(audio())]
    assert out == [STTEvent("partial", "he"), STTEvent("final", "hello")]
    assert drained == [b"x", b"y"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python -m pytest tests/test_stt.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'memaide.audio.stt'`.

- [ ] **Step 3: Implement the STT converter**

Create `src/memaide/audio/stt.py`:

```python
"""Streaming speech-to-text: audio chunks -> transcript events. A pure converter.

No inference happens here; STT only turns the patient's speech into text for the text
brain. ``SpeechToText`` wraps the OpenAI streaming-transcription API; ``StubSpeechToText``
replays scripted events so the voice loop is testable without audio or network.
"""

import logging
from dataclasses import dataclass
from typing import Any, AsyncIterator

from memaide import config

_log = logging.getLogger(__name__)


@dataclass
class STTEvent:
    kind: str  # "partial" | "final"
    text: str


class SpeechToText:
    """Transcribes one utterance's audio via a streaming transcription model.

    ``client`` is an OpenAI-SDK-shaped object exposing ``audio.transcriptions.create``.
    The inbound ``audio`` iterator is one utterance (the audio source ends it on
    endpoint); chunks are assembled and sent with ``stream=True`` so output text arrives
    as ``partial`` deltas followed by a single ``final``.
    """

    def __init__(
        self,
        client: Any,
        model: str = config.STT_MODEL,
        language: str | None = None,
    ):
        self._client = client
        self._model = model
        self._language = language

    async def transcribe(self, audio: AsyncIterator[bytes]) -> AsyncIterator[STTEvent]:
        buffer = bytearray()
        async for chunk in audio:
            buffer.extend(chunk)
        kwargs: dict[str, Any] = {
            "model": self._model,
            "file": ("utterance.wav", bytes(buffer)),
            "stream": True,
        }
        if self._language:
            kwargs["language"] = self._language
        stream = await self._client.audio.transcriptions.create(**kwargs)
        async for event in stream:
            etype = getattr(event, "type", "")
            if etype == "transcript.text.delta":
                yield STTEvent(kind="partial", text=getattr(event, "delta", ""))
            elif etype == "transcript.text.done":
                yield STTEvent(kind="final", text=getattr(event, "text", ""))


class StubSpeechToText:
    """Replays a fixed list of ``STTEvent``s, draining (but ignoring) the audio."""

    def __init__(self, events: list[STTEvent]):
        self._events = list(events)

    async def transcribe(self, audio: AsyncIterator[bytes]) -> AsyncIterator[STTEvent]:
        async for _chunk in audio:
            pass
        for event in self._events:
            yield event
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python -m pytest tests/test_stt.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/memaide/audio/__init__.py src/memaide/audio/stt.py tests/test_stt.py
git commit -m "feat(audio): add streaming SpeechToText converter and stub"
```

---

### Task 3: Batch `TextToSpeech`

**Files:**
- Create: `src/memaide/audio/tts.py`
- Test: `tests/test_tts.py` (new file)

- [ ] **Step 1: Write the failing tests**

Create `tests/test_tts.py`:

```python
from memaide import config
from memaide.audio.tts import StubTextToSpeech, TextToSpeech


class _FakeSpeechResp:
    def __init__(self, data):
        self._data = data

    def read(self):
        return self._data


class _FakeSpeech:
    def __init__(self, data):
        self._data = data
        self.kwargs = None

    async def create(self, **kwargs):
        self.kwargs = kwargs
        return _FakeSpeechResp(self._data)


class _FakeClient:
    def __init__(self, data):
        self.audio = type("A", (), {"speech": _FakeSpeech(data)})()


async def test_tts_calls_model_and_voice_and_returns_bytes():
    client = _FakeClient(b"\x00\x01\x02")
    tts = TextToSpeech(client=client)
    out = await tts.synthesize("hello there")
    assert out == b"\x00\x01\x02"
    assert client.audio.speech.kwargs["model"] == config.TTS_MODEL
    assert client.audio.speech.kwargs["voice"] == config.TTS_VOICE
    assert client.audio.speech.kwargs["input"] == "hello there"


async def test_stub_tts_returns_fixed_bytes_and_records_text():
    stub = StubTextToSpeech(audio=b"ZZ")
    out = await stub.synthesize("say this")
    assert out == b"ZZ"
    assert stub.last_text == "say this"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python -m pytest tests/test_tts.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'memaide.audio.tts'`.

- [ ] **Step 3: Implement the TTS converter**

Create `src/memaide/audio/tts.py`:

```python
"""Batch text-to-speech: reply text -> spoken audio bytes. A pure converter.

No inference happens here. ``TextToSpeech`` wraps the OpenAI speech API;
``StubTextToSpeech`` returns fixed bytes so the voice loop is testable offline. This is
the swap point if a lower-latency TTS vendor is needed later.
"""

from typing import Any

from memaide import config


class TextToSpeech:
    """Synthesizes one short reply in a single call (the reply is short, so batch)."""

    def __init__(
        self,
        client: Any,
        model: str = config.TTS_MODEL,
        voice: str = config.TTS_VOICE,
        response_format: str = "pcm",
    ):
        self._client = client
        self._model = model
        self._voice = voice
        self._format = response_format

    async def synthesize(self, text: str) -> bytes:
        resp = await self._client.audio.speech.create(
            model=self._model,
            voice=self._voice,
            input=text,
            response_format=self._format,
        )
        return resp.read()


class StubTextToSpeech:
    """Returns fixed audio bytes; records the last text synthesized."""

    def __init__(self, audio: bytes = b"AUDIO"):
        self._audio = audio
        self.last_text: str | None = None

    async def synthesize(self, text: str) -> bytes:
        self.last_text = text
        return self._audio
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python -m pytest tests/test_tts.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/memaide/audio/tts.py tests/test_tts.py
git commit -m "feat(audio): add batch TextToSpeech converter and stub"
```

---

### Task 4: `AgentSession.on_silence_tick` + `last_escalation`

**Files:**
- Modify: `src/memaide/agent/session.py:6-14` (import), `:43-50` (init), `:72` (set last_escalation), add method after `handle_patient_input`
- Test: `tests/test_session_silence_tick.py` (new file)

- [ ] **Step 1: Write the failing tests**

Create `tests/test_session_silence_tick.py`:

```python
from datetime import datetime, timezone

from memaide.agent.session import AgentSession
from memaide.schemas import PatientContext, Role, VisionContext


class _NoBrain:
    async def respond(self, transcript, vision=None):
        raise AssertionError("brain must not be called on a silence tick")


def _session():
    return AgentSession(
        brain=_NoBrain(),
        patient=PatientContext(patient_id="p1", name="Rose"),
        session_id="s1",
        clock=lambda: datetime(2026, 6, 6, 12, 0, tzinfo=timezone.utc),
    )


async def test_silence_tick_escalates_on_silence_plus_abnormal_vision():
    s = _session()
    s.start()
    vision = VisionContext(
        description="on the floor", label="floor", flags=["person_on_floor"]
    )
    turn = s.on_silence_tick(60.0, vision)
    assert turn is not None
    assert turn.role == Role.AGENT
    assert "911" in turn.text
    assert s.escalated is True
    assert s.transcript[-1] is turn
    assert s.last_escalation.escalate is True


async def test_silence_tick_noop_without_abnormal_vision():
    s = _session()
    s.start()
    calm = VisionContext(description="seated", label="seated")  # no flags
    assert s.on_silence_tick(60.0, calm) is None
    assert s.escalated is False


async def test_silence_tick_noop_when_not_silent_long_enough():
    s = _session()
    s.start()
    # tv_on is non-critical, so only the silence+vision rule could fire; 1s < 30s.
    room = VisionContext(description="tv on", label="room", flags=["tv_on"])
    assert s.on_silence_tick(1.0, room) is None
    assert s.escalated is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python -m pytest tests/test_session_silence_tick.py -v`
Expected: FAIL — `AttributeError: 'AgentSession' object has no attribute 'on_silence_tick'`.

- [ ] **Step 3: Implement the silence tick**

In `src/memaide/agent/session.py`, add `EscalationDecision` to the schema import (the `from memaide.schemas import (...)` block):

```python
from memaide.schemas import (
    EscalationDecision,
    HandoffType,
    PatientContext,
    Role,
    SessionRecord,
    SessionStatus,
    Turn,
    VisionContext,
)
```

In `__init__`, after `self._final_scene_label: str | None = None`, add:

```python
        self.last_escalation: EscalationDecision | None = None
```

In `handle_patient_input`, change the escalation line to also record the decision:

```python
        escalation = self.escalation.check(text, vision, seconds_since_last_speech)
        self.last_escalation = escalation
```

Then add this method immediately after `handle_patient_input`:

```python
    def on_silence_tick(
        self,
        seconds_since_last_speech: float,
        vision: VisionContext | None = None,
    ) -> Turn | None:
        """Let the rule-based silence+abnormal-vision escalation fire without speech.

        Runs the escalation check with no patient text; if it escalates, appends an
        agent Turn carrying the emergency suggestion and flips ``escalated``. Returns
        the Turn, or None when nothing escalates. Additive — the normal turn flow is
        unchanged and the brain is not called.
        """
        decision = self.escalation.check(None, vision, seconds_since_last_speech)
        self.last_escalation = decision
        if not decision.escalate:
            return None
        self.escalated = True
        if vision is not None:
            self._final_scene_label = vision.label
        turn = Turn(
            role=Role.AGENT, text=config.EMERGENCY_SUGGESTION, ts=self._clock()
        )
        self.transcript.append(turn)
        return turn
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python -m pytest tests/test_session_silence_tick.py tests/test_session.py -v`
Expected: PASS (new silence tests + all existing session tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/memaide/agent/session.py tests/test_session_silence_tick.py
git commit -m "feat(agent): add on_silence_tick and last_escalation to AgentSession"
```

---

### Task 5: `VoiceLoop` (per-connection turn loop)

**Files:**
- Create: `src/memaide/server/__init__.py`
- Create: `src/memaide/server/voice_loop.py`
- Test: `tests/test_voice_loop.py` (new file)

- [ ] **Step 1: Write the failing tests**

Create `src/memaide/server/__init__.py` (empty file).

Create `tests/test_voice_loop.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python -m pytest tests/test_voice_loop.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'memaide.server.voice_loop'`.

- [ ] **Step 3: Implement the voice loop**

Create `src/memaide/server/voice_loop.py`:

```python
"""Ties STT + the latest vision scene + AgentSession + TTS into one live turn loop.

One VoiceLoop per WebSocket connection. It consumes STT ``final`` transcripts, runs a
brain turn (the only inference) with the latest vision scene, and sends back a subtitle
and synthesized audio. A separate silence tick lets the rule-based escalation fire when
the patient has gone quiet.
"""

import base64
import logging
import time
from typing import Any, AsyncIterator, Awaitable, Callable

from memaide.schemas import VisionContext

_log = logging.getLogger(__name__)


class VoiceLoop:
    def __init__(
        self,
        session: Any,
        stt: Any,
        tts: Any,
        send: Callable[[dict], Awaitable[None]],
        get_vision: Callable[[], VisionContext | None] | None = None,
        clock: Callable[[], float] | None = None,
    ):
        self._session = session
        self._stt = stt
        self._tts = tts
        self._send = send
        self._get_vision = get_vision or (lambda: None)
        self._clock = clock or time.monotonic
        self._last_speech_at = self._clock()
        self._seq = 0

    async def run(self, audio: AsyncIterator[bytes]) -> None:
        """Drive turns from the patient's audio until the stream ends.

        A failing STT stream is logged and ends the loop; the rule-based silence-tick
        escalation remains a backstop on the connection.
        """
        try:
            async for event in self._stt.transcribe(audio):
                if event.kind == "final":
                    await self._handle_final(event.text)
        except Exception as exc:  # noqa: BLE001 - a bad STT stream must not crash the server
            _log.warning("STT failed; ending voice loop: %s", exc)

    async def _handle_final(self, text: str) -> None:
        now = self._clock()
        seconds = now - self._last_speech_at
        self._last_speech_at = now
        turn = await self._session.handle_patient_input(
            text, vision=self._get_vision(), seconds_since_last_speech=seconds
        )
        await self._emit_turn(turn)

    async def on_silence(self) -> None:
        """Fire a silence tick; if it escalates, emit the suggestion turn."""
        seconds = self._clock() - self._last_speech_at
        turn = self._session.on_silence_tick(seconds, self._get_vision())
        if turn is not None:
            await self._emit_turn(turn)

    async def _emit_turn(self, turn: Any) -> None:
        await self._send({"type": "subtitle", "text": turn.text, "role": "agent"})
        decision = getattr(self._session, "last_escalation", None)
        if decision is not None and decision.escalate:
            await self._send(
                {
                    "type": "escalation",
                    "reason": decision.reason,
                    "triggered_by": list(decision.triggered_by),
                }
            )
        try:
            audio = await self._tts.synthesize(turn.text)
        except Exception as exc:  # noqa: BLE001 - audio failure must not lose the reply
            _log.warning("TTS failed; subtitle already sent: %s", exc)
            await self._send({"type": "audio_error", "text": turn.text})
            return
        self._seq += 1
        await self._send(
            {
                "type": "audio_out",
                "pcm": base64.b64encode(audio).decode("ascii"),
                "seq": self._seq,
            }
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python -m pytest tests/test_voice_loop.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/memaide/server/__init__.py src/memaide/server/voice_loop.py tests/test_voice_loop.py
git commit -m "feat(server): add per-connection VoiceLoop (STT->brain->TTS)"
```

---

### Task 6: WebSocket server — demux + media sources + `serve`

**Files:**
- Create: `src/memaide/server/ws.py`
- Test: `tests/test_ws.py` (new file)

The server carries both streams over one connection. `_parse` and `handle` are fully
testable with a fake websocket; `serve` is a thin `websockets.serve` wrapper whose import
is lazy so the test suite never needs a live socket.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_ws.py`:

```python
import base64
import json

from memaide.audio.stt import STTEvent, StubSpeechToText
from memaide.audio.tts import StubTextToSpeech
from memaide.schemas import AgentDecision, VisionContext
from memaide.server.ws import ServerDeps, _parse, handle


class FakeWS:
    """Async-iterable fake: a single shared message iterator + recorded sends."""

    def __init__(self, messages):
        self._it = iter(messages)
        self.sent = []

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            return next(self._it)
        except StopIteration:
            raise StopAsyncIteration

    async def send(self, msg):
        self.sent.append(json.loads(msg))


class _StubDescriber:
    async def describe(self, frame):
        return VisionContext(
            description="a kitchen", label="kitchen", advisory_flags=["tv_on"]
        )


class _StubBrain:
    async def respond(self, transcript, vision=None):
        return AgentDecision(reply_text="I'm here.")


def _deps(**kw):
    base = dict(
        describer=_StubDescriber(),
        stt=StubSpeechToText([STTEvent("final", "I'm cold")]),
        tts=StubTextToSpeech(audio=b"WAV"),
        make_brain=lambda patient: _StubBrain(),
        interval=0.0,
    )
    base.update(kw)
    return ServerDeps(**base)


def _hello():
    return json.dumps(
        {"type": "hello", "session_id": "s1",
         "patient": {"patient_id": "p1", "name": "Rose"}}
    )


def _frame():
    return json.dumps({"type": "frame", "data_url": "data:image/jpeg;base64,QUJD"})


def _audio():
    return json.dumps({"type": "audio", "pcm": base64.b64encode(b"xx").decode("ascii")})


def test_parse_ignores_malformed_and_non_dict():
    assert _parse("not json") is None
    assert _parse(json.dumps([1, 2])) is None
    assert _parse(json.dumps({"type": "frame"}))["type"] == "frame"


async def test_handle_demuxes_streams_and_emits_outputs():
    ws = FakeWS([_hello(), _frame(), "GARBAGE", _audio(), json.dumps({"type": "bye"})])
    await handle(ws, _deps())

    types = [m["type"] for m in ws.sent]
    assert "vision_context" in types
    assert "subtitle" in types
    assert "audio_out" in types
    vc = next(m for m in ws.sent if m["type"] == "vision_context")
    assert vc["label"] == "kitchen"
    assert vc["advisory_flags"] == ["tv_on"]
    sub = next(m for m in ws.sent if m["type"] == "subtitle")
    assert "I'm here." in sub["text"]


async def test_handle_exits_cleanly_without_hello():
    ws = FakeWS([json.dumps({"type": "frame", "data_url": "x"})])
    await handle(ws, _deps())
    assert ws.sent == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python -m pytest tests/test_ws.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'memaide.server.ws'`.

- [ ] **Step 3: Implement the WebSocket server**

Create `src/memaide/server/ws.py`:

```python
"""Thin WebSocket server carrying both Ray-Ban media streams over one connection.

Inbound messages are demuxed by ``type``: ``frame`` feeds the vision pipeline, ``audio``
feeds the voice loop, ``hello`` opens the session, ``bye`` closes it. Unknown/malformed
messages are ignored (forward-compatible). Two concurrent tasks run per connection: the
interval-throttled ``VisionPipeline`` (keeps the latest scene + echoes ``vision_context``)
and the turn-based ``VoiceLoop``. The describer supplies only ``advisory_flags``; the
rule-based ``flags`` come from an injected ``VisionCheck`` (``StubVisionCheck`` default).
"""

import asyncio
import base64
import json
import logging
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Callable

from memaide import config
from memaide.agent.session import AgentSession
from memaide.schemas import PatientContext, VisionContext
from memaide.server.voice_loop import VoiceLoop
from memaide.vision.pipeline import VisionPipeline
from memaide.vision.rule_check import StubVisionCheck

_log = logging.getLogger(__name__)

_QUEUE_END = object()


@dataclass
class ServerDeps:
    """Injectable parts so the whole server is built from testable seams."""

    describer: Any
    stt: Any
    tts: Any
    make_brain: Callable[[PatientContext], Any]
    vision_check: Any = field(default_factory=StubVisionCheck)
    interval: float = config.VISION_INTERVAL_SECONDS


class _QueueSource:
    """Adapts a queue of items into an async iterator that ends on the sentinel."""

    def __init__(self) -> None:
        self._queue: asyncio.Queue = asyncio.Queue()

    async def put(self, item: Any) -> None:
        await self._queue.put(item)

    async def close(self) -> None:
        await self._queue.put(_QUEUE_END)

    async def _iter(self) -> AsyncIterator[Any]:
        while True:
            item = await self._queue.get()
            if item is _QUEUE_END:
                return
            yield item


class WebSocketFrameSource(_QueueSource):
    """A ``FrameSource`` backed by the demuxed inbound ``frame`` messages."""

    def frames(self) -> AsyncIterator[str]:
        return self._iter()


class WebSocketAudioSource(_QueueSource):
    """Yields demuxed inbound ``audio`` PCM chunks for STT."""

    def __aiter__(self) -> AsyncIterator[bytes]:
        return self._iter()


def _parse(raw: Any) -> dict | None:
    if isinstance(raw, (bytes, bytearray)):
        try:
            raw = raw.decode("utf-8")
        except Exception:  # noqa: BLE001
            return None
    try:
        msg = json.loads(raw)
    except (TypeError, ValueError):
        return None
    return msg if isinstance(msg, dict) else None


async def _await_hello(websocket: Any) -> tuple[PatientContext | None, str | None]:
    async for raw in websocket:
        msg = _parse(raw)
        if not msg or msg.get("type") != "hello":
            continue
        data = msg.get("patient") or {}
        try:
            patient = (
                PatientContext(**data)
                if data
                else PatientContext(
                    patient_id=msg.get("session_id", "unknown"), name="Patient"
                )
            )
        except Exception:  # noqa: BLE001 - bad patient payload -> safe default
            patient = PatientContext(patient_id="unknown", name="Patient")
        return patient, msg.get("session_id")
    return None, None


async def handle(websocket: Any, deps: ServerDeps) -> None:
    """Run one connection: read hello, fan frames/audio to the two tasks, clean up."""
    send_lock = asyncio.Lock()

    async def send(msg: dict) -> None:
        async with send_lock:
            await websocket.send(json.dumps(msg))

    patient, session_id = await _await_hello(websocket)
    if patient is None:
        return

    session = AgentSession(
        brain=deps.make_brain(patient), patient=patient, session_id=session_id
    )
    latest: dict[str, VisionContext | None] = {"scene": None}

    async def sink(ctx: VisionContext) -> None:
        ctx = ctx.model_copy(update={"flags": deps.vision_check.check()})
        latest["scene"] = ctx
        await send(
            {
                "type": "vision_context",
                "description": ctx.description,
                "label": ctx.label,
                "advisory_flags": ctx.advisory_flags,
                "ts": ctx.ts.isoformat(),
            }
        )

    frame_source = WebSocketFrameSource()
    audio_source = WebSocketAudioSource()
    pipeline = VisionPipeline(
        source=frame_source, describer=deps.describer, sink=sink, interval=deps.interval
    )
    loop = VoiceLoop(
        session=session,
        stt=deps.stt,
        tts=deps.tts,
        send=send,
        get_vision=lambda: latest["scene"],
    )

    vision_task = asyncio.create_task(pipeline.run())
    voice_task = asyncio.create_task(loop.run(audio_source))
    try:
        async for raw in websocket:
            msg = _parse(raw)
            if not msg:
                continue
            mtype = msg.get("type")
            if mtype == "frame" and isinstance(msg.get("data_url"), str):
                await frame_source.put(msg["data_url"])
            elif mtype == "audio" and isinstance(msg.get("pcm"), str):
                try:
                    await audio_source.put(base64.b64decode(msg["pcm"]))
                except Exception:  # noqa: BLE001 - bad base64 -> drop the chunk
                    continue
            elif mtype == "bye":
                break
            # unknown / malformed -> ignored (forward-compatible)
    finally:
        await frame_source.close()
        await audio_source.close()
        await asyncio.gather(vision_task, voice_task, return_exceptions=True)


async def serve(deps: ServerDeps, host: str = config.WS_HOST, port: int = config.WS_PORT):
    """Start the websockets server (thin wrapper). Requires the ``websockets`` package."""
    import websockets

    async def _handler(websocket):
        await handle(websocket, deps)

    return await websockets.serve(_handler, host, port)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python -m pytest tests/test_ws.py -v`
Expected: PASS (parse, demux + emit, no-hello exit).

- [ ] **Step 5: Commit**

```bash
git add src/memaide/server/ws.py tests/test_ws.py
git commit -m "feat(server): add WebSocket media server (demux frames + audio)"
```

---

### Task 7: Documentation

**Files:**
- Modify: `docs/architecture.md`
- Modify: `README.md`

- [ ] **Step 1: Update architecture doc**

In `docs/architecture.md`, after the existing "Vision pipeline (M2)" section, append:

```markdown
## Audio + live-media layer (M2, Plan B)

One WebSocket connection per Help session (`server/ws.py`) carries both media streams.
Inbound messages are demuxed by `type`: `frame` → the vision path, `audio` → the voice
path, `hello`/`bye` → control. Unknown or malformed messages are ignored. Two concurrent
tasks run per connection:

- **Vision (continuous):** a `WebSocketFrameSource` feeds the existing `VisionPipeline`,
  which throttles to one describe per `VISION_INTERVAL_SECONDS`, stores the result as the
  "latest scene", and echoes a `vision_context` message. The describer supplies only
  `advisory_flags`; the rule-based `flags` come from an injected `VisionCheck`
  (`StubVisionCheck` by default until the real CV drop-in lands).
- **Voice (turn-based):** `VoiceLoop` (`server/voice_loop.py`) consumes STT `final`
  transcripts and runs the pipeline **STT → text brain → TTS**. `SpeechToText`
  (`audio/stt.py`, `gpt-4o-mini-transcribe`) and `TextToSpeech` (`audio/tts.py`,
  `gpt-4o-mini-tts`) are pure converters — no inference happens in them; all reasoning
  stays in `AgentBrain` and the rule-based `EscalationMonitor`. Each turn calls
  `AgentSession.handle_patient_input(text, vision=<latest scene>, …)`, sends a `subtitle`,
  then synthesizes audio and sends `audio_out`. A TTS failure still delivers the subtitle.

A silence timer fires `AgentSession.on_silence_tick(seconds, vision)`, which runs the
rule-based escalation with no patient text so "silence + abnormal vision" can suggest 911
without the patient speaking — emitted as an `escalation` message for the caregiver portal.

`REALTIME_MODEL` is deprecated: the STT→brain→TTS pipeline supersedes the bundled realtime
path, keeping the already-tuned text brain (few-shot + language filter) as the single
source of reasoning and letting STT/TTS be swapped independently.

### WebSocket message protocol

Client → server: `hello` (session_id + patient context), `frame` (`data_url`), `audio`
(`pcm` base64 chunk), `bye`. Server → client: `vision_context`
(`description`/`label`/`advisory_flags`/`ts`), `subtitle` (`text`/`role`), `audio_out`
(`pcm` base64/`seq`), `escalation` (`reason`/`triggered_by`). The Ray-Ban mobile app (Meta
Wearables toolkit) implements the client side; on-device capture/encoding is out of scope.
```

- [ ] **Step 2: Update README**

In `README.md`, after the vision-describer eval section, add:

```markdown
### Live voice + media server (M2)

The WebSocket server (`memaide.server.ws`) carries the Ray-Ban POV-camera and microphone
streams over one connection and runs two concurrent tasks per session: the throttled
vision pipeline (keeps the latest scene) and a turn-based voice loop
(**STT → text brain → TTS**). The audio models (`gpt-4o-mini-transcribe`,
`gpt-4o-mini-tts`) are pure converters; all reasoning stays in the text brain and the
rule-based safety monitor. A silence tick lets the "silence + abnormal vision" escalation
fire without patient speech.

Every seam (describer, STT, TTS, brain) is injected via `ServerDeps`, so the whole stack
runs against stubs in tests with no network or audio devices. To run a real server you
provide a `ServerDeps` with live `VisionDescriber`, `SpeechToText`, `TextToSpeech`, and a
brain factory, then `await serve(deps)` (needs `OPENAI_API_KEY` and the `websockets`
package). The Ray-Ban mobile app (Meta Wearables toolkit) is the client; on-device capture
is out of scope for this repo.
```

- [ ] **Step 3: Commit**

```bash
git add docs/architecture.md README.md
git commit -m "docs: document the M2 audio + live-media layer"
```

---

### Task 8: Full suite green

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `.venv\Scripts\python -m pytest -q`
Expected: all tests pass — the prior 80 plus the new config, STT, TTS, silence-tick,
voice-loop, and WS tests (≈ 80 + ~16 new). No failures, no errors.

- [ ] **Step 2: Import smoke check**

Run: `.venv\Scripts\python -c "from memaide.server.ws import serve, ServerDeps; from memaide.audio.stt import SpeechToText; from memaide.audio.tts import TextToSpeech; print('imports ok')"`
Expected: `imports ok` (confirms `websockets` is installed and the modules import cleanly).

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-06-18-vision-context-rayban-ingestion-design.md`, audio/live-media portions):
- `SpeechToText` (component 4) → Task 2. ✅ `transcribe(audio) -> AsyncIterator[STTEvent]`, partial/final events, targets `STT_MODEL`, `StubSpeechToText`, optional language hint.
- `TextToSpeech` (component 5) → Task 3. ✅ `synthesize(text) -> bytes`, `TTS_MODEL`/`TTS_VOICE`, `StubTextToSpeech`, injectable swap point.
- Live session loop (component 6) → Task 5. ✅ STT final → `handle_patient_input(latest vision)` → subtitle + audio_out; silence tick → escalation; `seconds_since_last_speech` from clock; TTS-failure resilience.
- WebSocket server (component 7) → Task 6. ✅ demux by type, `WebSocketFrameSource`/`WebSocketAudioSource`, two concurrent tasks, `vision_context`/`subtitle`/`audio_out`/`escalation` out, malformed ignored, `serve` thin wrapper, advisory vs rule-based flags via injected `VisionCheck`.
- `on_silence_tick` (other edits) → Task 4. ✅ runs `escalation.check(None, vision, seconds)`, appends suggestion Turn + sets `escalated`, no-op otherwise; additive.
- Config additions (`STT_MODEL`, `TTS_MODEL`, `TTS_VOICE`, `AUDIO_FORMAT`, `AUDIO_SAMPLE_RATE`, `WS_HOST`, `WS_PORT`; `REALTIME_MODEL` deprecated) → Task 1. ✅
- `pyproject.toml` `websockets>=12` → Task 1. ✅ (STT/TTS add no dep — existing `openai` SDK.)
- WS message protocol → Task 6 + documented in Task 7. ✅
- Error handling (STT failure skips turn/ends loop, TTS failure still sends subtitle, malformed WS ignored, brain handles `vision=None`) → Tasks 5–6. ✅
- Docs (architecture.md, README) → Task 7. ✅
- **Out of scope (unchanged):** bundled realtime path (deprecated), the Ray-Ban mobile app + on-device capture, real CV `VisionCheck`, barge-in/streaming TTS, binary WS audio frames, live capture eval.

**Placeholder scan:** No TBD/TODO/"add error handling" placeholders — every code step shows complete code; error handling is implemented inline (try/except in STT/TTS/loop/demux).

**Type consistency:** `STTEvent(kind, text)` dataclass used in Tasks 2, 5, 6. `SpeechToText.transcribe(audio) -> AsyncIterator[STTEvent]` and `StubSpeechToText` match across Tasks 2, 5, 6. `TextToSpeech.synthesize(text) -> bytes` / `StubTextToSpeech` consistent in Tasks 3, 5, 6. `AgentSession.on_silence_tick(seconds, vision) -> Turn | None` and `last_escalation` defined in Task 4, consumed in Task 5. `VoiceLoop(session, stt, tts, send, get_vision=, clock=)` defined Task 5, constructed in Task 6. `ServerDeps(describer, stt, tts, make_brain, vision_check=, interval=)` defined and consumed in Task 6. `VisionPipeline(source, describer, sink, interval=)` matches the existing Plan-A signature. `VisionContext.model_copy(update={"flags": ...})` uses the existing pydantic field.
```
