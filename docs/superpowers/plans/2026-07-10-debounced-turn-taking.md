# Debounced Turn-Taking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Speak exactly one reply per real spoken turn — buffer per-utterance replies and synthesize them as a single TTS call only once the client confirms (via a new `commit` message) that the patient is actually done.

**Architecture:** The client owns timing (it already computes audio energy) via a two-threshold VAD: a short pause emits `audio_end` (prepare a reply), a longer hold-out emits `commit` (turn over). The server's `VoiceLoop` accumulates each utterance's `reply_text` in a pending buffer, sending interim subtitles but no audio; on `commit` it concatenates the buffer into one TTS call. Escalation, `bye`, and disconnect flush immediately. The `commit` signal rides the existing utterance FIFO as an ordered sentinel, so it is naturally processed *after* the preceding utterance's STT+brain finish — no locks needed.

**Tech Stack:** Python (asyncio, `websockets`, pytest) for the server; Kotlin (Android, JUnit) for the client.

**Source spec:** `docs/superpowers/specs/2026-07-10-debounced-turn-taking-design.md`

---

## Worktree / branch map

This feature spans two branches of the mem_aide repo. Each phase is committed on its own branch/worktree; paths below are repo-relative within that worktree.

| Phase | Branch | Worktree | Repo-relative paths |
|-------|--------|----------|---------------------|
| 1 — Server | `anthony/student3-work` | `C:/Users/Anthony/Documents/CS/memaide-fix` | `src/memaide/server/…`, `tests/…` |
| 2 — Client | `anthony/phone-mic` | `C:/Users/Anthony/Documents/CS/memaide-phonemic` | `app/src/main/java/com/example/memaid/data/…`, `app/src/test/java/com/example/memaid/…` |

**Deploy note:** every server change requires a droplet redeploy (`git pull` + `systemctl restart memaide-session`) to take effect on `wss://ai.guardianova.com` — do this after Phase 1 lands.

**Correctness deviation from the spec (read before Phase 2):** the spec says "this spec only wires the phone-mic client." But the server contract change is global — after Phase 1, the server buffers and only speaks on `commit` (or escalation/bye). If the watch path (`PhoneListenerService`) kept sending only `audio_end`, the watch user would hear nothing until disconnect. So Task 9 wires **both** callers (phone-mic and watch) to send `commit`. The two-threshold tuning is still validated only on the phone-mic path under test.

---

## File Structure

**Server (Phase 1):**
- `src/memaide/server/voice_loop.py` — add the `COMMIT` sentinel and rework `VoiceLoop` to buffer replies and flush on commit/escalation/stream-end. This file owns all turn/reply timing.
- `src/memaide/server/ws.py` — `WebSocketAudioSource` gains a `commit()` that enqueues the ordered `COMMIT` marker; the demux loop routes the new `commit` message to it.
- `tests/test_voice_loop.py` — buffering/flush/escalation-bypass unit tests.
- `tests/test_ws.py` — audio-source ordering + end-to-end commit integration tests.

**Client (Phase 2):**
- `app/src/main/java/com/example/memaid/data/SpeechEndpointer.kt` — two-threshold detector returning an `Endpoint` event enum.
- `app/src/main/java/com/example/memaid/data/VoiceBridge.kt` — add `sendCommit()`.
- `app/src/main/java/com/example/memaid/data/PhoneVoiceSession.kt` — route `accept()`'s event to `sendAudioEnd()`/`sendCommit()`.
- `app/src/main/java/com/example/memaid/data/PhoneListenerService.kt` — same routing for the watch path (keeps it compiling and speaking).
- `app/src/test/java/com/example/memaid/SpeechEndpointerTest.kt` — new JUnit unit test (pure logic, no Android deps).

---

# Phase 1 — Server (branch `anthony/student3-work`, worktree `memaide-fix`)

Run all server commands from `C:/Users/Anthony/Documents/CS/memaide-fix`.

## Task 1: Ordered `COMMIT` sentinel in the audio source

**Files:**
- Modify: `src/memaide/server/voice_loop.py` (add module-level `COMMIT` sentinel)
- Modify: `src/memaide/server/ws.py:84-125` (`WebSocketAudioSource`) and import
- Test: `tests/test_ws.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_ws.py`:

```python
async def test_audio_source_commit_marker_is_ordered_after_utterance():
    from memaide.server.voice_loop import COMMIT

    src = WebSocketAudioSource()
    await src.put(b"aa")
    await src.end_utterance()   # client sent audio_end -> close utterance 1
    await src.commit()          # client sent commit -> ordered turn-over marker
    await src.put(b"bb")
    await src.close()

    items = []
    async for item in src.utterances():
        if item is COMMIT:
            items.append("COMMIT")
        else:
            items.append(b"".join([c async for c in item]))
    assert items == [b"aa", "COMMIT", b"bb"]  # marker sits between the two utterances
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_ws.py::test_audio_source_commit_marker_is_ordered_after_utterance -v`
Expected: FAIL — `AttributeError: 'WebSocketAudioSource' object has no attribute 'commit'` (and `ImportError` for `COMMIT`).

- [ ] **Step 3: Add the `COMMIT` sentinel to `voice_loop.py`**

At module scope in `src/memaide/server/voice_loop.py`, just after `_log = logging.getLogger(__name__)`:

```python
# Marker the WebSocket audio source rides through the utterance FIFO to signal the client's
# hold-out silence (the turn is over). Because it is processed in FIFO order, it always
# follows the preceding utterance's full STT+brain, letting the loop flush the pending reply
# as one TTS call without any cross-task locking.
COMMIT = object()
```

- [ ] **Step 4: Add `commit()` and route the marker in `WebSocketAudioSource`**

In `src/memaide/server/ws.py`, update the import at the top:

```python
from memaide.server.voice_loop import VoiceLoop, COMMIT
```

Add a `commit()` method to `WebSocketAudioSource` (after `end_utterance`):

```python
    async def commit(self) -> None:
        """Client sent ``commit``: close any open utterance, then enqueue the turn-over
        marker. The marker rides the same FIFO as utterances, so the voice loop reaches it
        only after the preceding utterance is fully transcribed and answered."""
        await self.end_utterance()  # no-op if audio_end already closed it
        await self._utterances.put(COMMIT)
```

Update `utterances()` to yield the marker through:

```python
    async def utterances(self) -> AsyncIterator[Any]:
        while True:
            queue = await self._utterances.get()
            if queue is _QUEUE_END:
                return
            if queue is COMMIT:
                yield COMMIT
                continue
            yield self._drain(queue)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest tests/test_ws.py::test_audio_source_commit_marker_is_ordered_after_utterance -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/memaide/server/voice_loop.py src/memaide/server/ws.py tests/test_ws.py
git commit -m "feat: ordered commit marker in WebSocketAudioSource"
```

---

## Task 2: `VoiceLoop` buffers replies and flushes on commit / stream-end

This reworks `VoiceLoop` so per-utterance replies are buffered (subtitle only) and spoken as one concatenated TTS on `COMMIT`, with a safety flush when the stream ends (bye/disconnect).

**Files:**
- Modify: `src/memaide/server/voice_loop.py` (whole `VoiceLoop` class body)
- Test: `tests/test_voice_loop.py`

- [ ] **Step 1: Write the failing tests**

In `tests/test_voice_loop.py`, **replace** `test_run_produces_one_turn_per_utterance` (it asserts the old per-utterance-audio contract) with the four tests below. `PerUtteranceSTT`, `StubBrain`, `_session`, `_collector` already exist in the file.

```python
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


async def test_utterances_buffer_until_commit_then_one_concatenated_audio_out():
    from memaide.server.voice_loop import COMMIT

    session = _session(StubBrain(reply="ok"))
    sent, send = _collector()
    tts = StubTextToSpeech(audio=b"WAV")
    loop = VoiceLoop(session=session, stt=PerUtteranceSTT(), tts=tts, send=send)

    await loop.run(_stream((b"hi",), (b"there",), COMMIT))

    subtitles = [m for m in sent if m["type"] == "subtitle"]
    audio_outs = [m for m in sent if m["type"] == "audio_out"]
    assert len(subtitles) == 2       # a subtitle per utterance (interim text)
    assert len(audio_outs) == 1      # but only one spoken reply, on commit
    assert tts.last_text == "ok ok"  # the two replies concatenated into one TTS call


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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_voice_loop.py -v`
Expected: the four new tests FAIL (e.g. `test_audio_end_sends_subtitle_but_no_audio_out_before_commit` fails because the current `_handle_final` synthesizes immediately, so an `audio_out` is present).

- [ ] **Step 3: Rewrite `VoiceLoop` to buffer and flush**

Replace the entire `VoiceLoop` class in `src/memaide/server/voice_loop.py` with this (leave the imports, `_log`, and the new `COMMIT` sentinel from Task 1 above it unchanged):

```python
class VoiceLoop:
    def __init__(
        self,
        session: Any,
        stt: Any,
        tts: Any,
        send: Callable[[dict], Awaitable[None]],
        get_vision: Callable[[], VisionContext | None] | None = None,
        clock: Callable[[], float] | None = None,
        on_escalation: Callable[[Any], Awaitable[None]] | None = None,
    ):
        self._session = session
        self._stt = stt
        self._tts = tts
        self._send = send
        self._get_vision = get_vision or (lambda: None)
        self._clock = clock or time.monotonic
        self._last_speech_at = self._clock()
        self._seq = 0
        self._on_escalation = on_escalation
        self._escalation_reported = False
        self._pending: list[str] = []  # reply texts awaiting a commit -> spoken as one TTS

    async def greet(self) -> None:
        """Speak the opening line immediately (not buffered) so the agent talks first."""
        await self._emit_immediate(self._session.start())

    async def run(self, stream: AsyncIterator[Any]) -> None:
        """Drive turns from the demuxed stream of utterances and ``COMMIT`` markers.

        Each utterance is transcribed and its reply buffered (subtitle only). A ``COMMIT``
        marker speaks the buffered replies as one turn. A single utterance's STT failure is
        logged and skipped so one bad chunk never ends the session. When the stream ends
        (``bye``/disconnect) any pending reply is flushed so it is not lost.
        """
        async for item in stream:
            if item is COMMIT:
                await self._flush()
                continue
            try:
                async for event in self._stt.transcribe(item):
                    if event.kind == "final":
                        await self._handle_final(event.text)
            except Exception as exc:  # noqa: BLE001 - a bad utterance must not end the loop
                _log.warning("STT failed on utterance; skipping: %s", exc)
        await self._flush()  # safety flush: bye/disconnect must not drop a pending turn

    async def _handle_final(self, text: str) -> None:
        now = self._clock()
        seconds = now - self._last_speech_at
        self._last_speech_at = now
        turn = await self._session.handle_patient_input(
            text, vision=self._get_vision(), seconds_since_last_speech=seconds
        )
        await self._send({"type": "subtitle", "text": turn.text, "role": "agent"})
        self._pending.append(turn.text)
        if await self._handle_escalation():
            await self._flush()  # escalation bypass: speak now, do not wait for commit

    async def on_silence(self) -> None:
        """Fire a silence tick; if it escalates, speak the suggestion immediately."""
        seconds = self._clock() - self._last_speech_at
        turn = self._session.on_silence_tick(seconds, self._get_vision())
        if turn is not None:
            await self._emit_immediate(turn)

    async def _emit_immediate(self, turn: Any) -> None:
        """Subtitle + escalation + speak now, bypassing the pending buffer. Used by the
        connect greeting and silence-tick suggestions, which are not part of a patient turn
        and must be heard immediately."""
        await self._send({"type": "subtitle", "text": turn.text, "role": "agent"})
        await self._handle_escalation()
        await self._synthesize_and_send(turn.text)

    async def _handle_escalation(self) -> bool:
        """If the last brain decision escalated, send the escalation message and fire the
        callback (at most once per connection). Returns whether an escalation occurred."""
        decision = getattr(self._session, "last_escalation", None)
        if decision is None or not decision.escalate:
            return False
        await self._send(
            {
                "type": "escalation",
                "reason": decision.reason,
                "triggered_by": list(decision.triggered_by),
            }
        )
        if self._on_escalation is not None and not self._escalation_reported:
            self._escalation_reported = True
            await self._on_escalation(decision)
        return True

    async def _flush(self) -> None:
        """Speak the pending replies as one TTS call. Snapshot+clear synchronously before
        awaiting TTS so any utterance arriving during synthesis starts a fresh turn."""
        if not self._pending:
            return
        text = " ".join(self._pending)
        self._pending = []
        await self._synthesize_and_send(text)

    async def _synthesize_and_send(self, text: str) -> None:
        try:
            audio = await self._tts.synthesize(text)
        except Exception as exc:  # noqa: BLE001 - audio failure must not lose the reply
            _log.warning("TTS failed; subtitle already sent: %s", exc)
            await self._send({"type": "audio_error", "text": text})
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

- [ ] **Step 4: Run the full voice-loop suite to verify it passes**

Run: `python -m pytest tests/test_voice_loop.py -v`
Expected: PASS — all tests, including the pre-existing `test_one_full_turn_...` (single utterance → stream-end flush → one `audio_out`), `test_greet_...`, `test_silence_tick_...`, `test_tts_failure_...`, `test_run_skips_failed_utterance_...`, and both escalation tests.

- [ ] **Step 5: Commit**

```bash
git add src/memaide/server/voice_loop.py tests/test_voice_loop.py
git commit -m "feat: VoiceLoop buffers replies, speaks one TTS per committed turn"
```

---

## Task 3: Escalation bypass speaks immediately (no commit needed)

The rewrite in Task 2 already flushes on escalation; this task pins that behavior with a focused test so it can't regress.

**Files:**
- Test: `tests/test_voice_loop.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_voice_loop.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it passes (behavior already implemented in Task 2)**

Run: `python -m pytest tests/test_voice_loop.py::test_escalating_utterance_flushes_immediately_without_commit -v`
Expected: PASS. (If it FAILS, the Task 2 rewrite's escalation-bypass branch is wrong — fix `_handle_final` before continuing.)

- [ ] **Step 3: Commit**

```bash
git add tests/test_voice_loop.py
git commit -m "test: escalating utterance flushes immediately without commit"
```

---

## Task 4: Demux the `commit` message and update integration tests

**Files:**
- Modify: `src/memaide/server/ws.py:242-264` (the `async for raw in websocket` demux loop)
- Test: `tests/test_ws.py`

- [ ] **Step 1: Write/adjust the failing tests**

In `tests/test_ws.py`, **replace** `test_audio_end_yields_a_turn_per_utterance` (it asserts the old contract of one `audio_out` per utterance) with these two tests:

```python
async def test_commit_yields_one_reply_per_turn():
    ws = FakeWS(
        [
            _hello(),
            _audio(), json.dumps({"type": "audio_end"}), json.dumps({"type": "commit"}),
            _audio(), json.dumps({"type": "audio_end"}), json.dumps({"type": "commit"}),
            json.dumps({"type": "bye"}),
        ]
    )
    await handle(ws, _deps())

    audio_outs = [m for m in ws.sent if m["type"] == "audio_out"]
    assert len(audio_outs) == 3  # 1 opening greeting + 1 reply per committed turn


async def test_utterances_without_commit_are_spoken_as_one_reply():
    # Two audio_end utterances then a single commit -> one concatenated spoken reply.
    ws = FakeWS(
        [
            _hello(),
            _audio(), json.dumps({"type": "audio_end"}),
            _audio(), json.dumps({"type": "audio_end"}),
            json.dumps({"type": "commit"}),
            json.dumps({"type": "bye"}),
        ]
    )
    await handle(ws, _deps())

    audio_outs = [m for m in ws.sent if m["type"] == "audio_out"]
    assert len(audio_outs) == 2  # greeting + one concatenated reply for the whole turn
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_ws.py::test_commit_yields_one_reply_per_turn tests/test_ws.py::test_utterances_without_commit_are_spoken_as_one_reply -v`
Expected: FAIL — the `commit` message is currently ignored (falls through to "unknown / malformed"), so no flush happens and the greeting is the only `audio_out` until `bye`.

- [ ] **Step 3: Route the `commit` message**

In `src/memaide/server/ws.py`, in the demux loop, add a branch right after the existing `audio_end` branch:

```python
            elif mtype == "audio_end":
                # Client marked a speech pause -> close this utterance so STT transcribes
                # it now and the reply is prepared, without ending the connection.
                await audio_source.end_utterance()
            elif mtype == "commit":
                # Client saw the full hold-out silence -> speak the buffered turn as one reply.
                await audio_source.commit()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_ws.py -v`
Expected: PASS — the two new tests plus all pre-existing ws tests (including `test_escalation_invokes_notifier_with_caregiver`, which flushes via the escalation bypass, and `test_handle_demuxes_streams_and_emits_outputs`, which flushes at `bye`).

- [ ] **Step 5: Run the whole server suite as a regression gate**

Run: `python -m pytest -q`
Expected: PASS (all tests green).

- [ ] **Step 6: Commit**

```bash
git add src/memaide/server/ws.py tests/test_ws.py
git commit -m "feat: demux client commit message to flush the buffered turn"
```

- [ ] **Step 7: Redeploy the server**

The live droplet must be updated for the change to take effect:

```bash
# on the droplet
cd /path/to/mem_aide && git pull && sudo systemctl restart memaide-session
```

---

# Phase 2 — Client (branch `anthony/phone-mic`, worktree `memaide-phonemic`)

Run all client commands from `C:/Users/Anthony/Documents/CS/memaide-phonemic`. `SpeechEndpointer` is pure logic and testable with plain JUnit (`app/src/test/…`); `VoiceBridge`/`PhoneVoiceSession`/`PhoneListenerService` need the Android runtime, so they are verified by a debug build.

## Task 5: Two-threshold `SpeechEndpointer` returning an event enum

**Files:**
- Modify: `app/src/main/java/com/example/memaid/data/SpeechEndpointer.kt`
- Test: `app/src/test/java/com/example/memaid/SpeechEndpointerTest.kt` (create)

- [ ] **Step 1: Write the failing unit test**

Create `app/src/test/java/com/example/memaid/SpeechEndpointerTest.kt`:

```kotlin
package com.example.memaid

import com.example.memaid.data.Endpoint
import com.example.memaid.data.SpeechEndpointer
import org.junit.Assert.assertEquals
import org.junit.Test

class SpeechEndpointerTest {
    private val sampleRate = 24000

    // A 10ms-per-chunk source: 240 samples * 2 bytes at 24kHz. `level` is a constant
    // amplitude per sample (0 = silence, 1000 = speech, both well clear of the 500 threshold).
    private fun chunk(level: Int, ms: Int): ByteArray {
        val samples = sampleRate * ms / 1000
        val b = ByteArray(samples * 2)
        for (i in 0 until samples) {
            b[i * 2] = (level and 0xFF).toByte()
            b[i * 2 + 1] = ((level shr 8) and 0xFF).toByte()
        }
        return b
    }

    private fun accept(ep: SpeechEndpointer, level: Int): Endpoint {
        val c = chunk(level, 10)
        return ep.accept(c, c.size)
    }

    @Test
    fun emitsAudioEndThenCommitOnGrowingSilence() {
        val ep = SpeechEndpointer(shortBreakMs = 20, holdOutMs = 50, sampleRate = sampleRate)
        assertEquals(Endpoint.NONE, accept(ep, 1000))       // speech
        assertEquals(Endpoint.NONE, accept(ep, 0))          // 10ms silence
        assertEquals(Endpoint.AUDIO_END, accept(ep, 0))     // 20ms -> short break
        assertEquals(Endpoint.NONE, accept(ep, 0))          // 30ms
        assertEquals(Endpoint.NONE, accept(ep, 0))          // 40ms
        assertEquals(Endpoint.COMMIT, accept(ep, 0))        // 50ms -> hold-out
    }

    @Test
    fun eachEventFiresAtMostOncePerSilenceRun() {
        val ep = SpeechEndpointer(shortBreakMs = 20, holdOutMs = 50, sampleRate = sampleRate)
        accept(ep, 1000)
        repeat(10) { accept(ep, 0) }                        // long silence: both events consumed
        assertEquals(Endpoint.NONE, accept(ep, 0))          // no further events
    }

    @Test
    fun resumedSpeechResetsAndCanFireAgain() {
        val ep = SpeechEndpointer(shortBreakMs = 20, holdOutMs = 50, sampleRate = sampleRate)
        accept(ep, 1000)
        repeat(6) { accept(ep, 0) }                         // AUDIO_END + COMMIT already fired
        assertEquals(Endpoint.NONE, accept(ep, 1000))       // new speech resets the flags
        assertEquals(Endpoint.NONE, accept(ep, 0))          // 10ms
        assertEquals(Endpoint.AUDIO_END, accept(ep, 0))     // 20ms -> fires again for the new turn
    }

    @Test
    fun ignoresLeadingSilence() {
        val ep = SpeechEndpointer(shortBreakMs = 20, holdOutMs = 50, sampleRate = sampleRate)
        repeat(10) { assertEquals(Endpoint.NONE, accept(ep, 0)) }  // never marks an empty utterance
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./gradlew :app:testDebugUnitTest --tests "com.example.memaid.SpeechEndpointerTest"`
Expected: COMPILE FAILURE — `Endpoint` is unresolved and `accept` still returns `Boolean`.

- [ ] **Step 3: Rewrite `SpeechEndpointer.kt` with two thresholds and an event enum**

Replace the entire contents of `app/src/main/java/com/example/memaid/data/SpeechEndpointer.kt`:

```kotlin
package com.example.memaid.data

import kotlin.math.abs

// Two-stage end-of-utterance detector for 16-bit little-endian PCM.
//
// One spoken sentence often contains short mid-sentence pauses. A single silence threshold
// splits it into several utterances, each answered separately, so the patient hears 2-3
// near-duplicate replies. Instead we track silence against two thresholds:
//   - after `shortBreakMs` of silence following speech -> AUDIO_END (server prepares a reply)
//   - after `holdOutMs` of silence                     -> COMMIT   (turn is over; speak it)
// Each event fires at most once per silence run; resumed speech resets both. Leading/idle
// silence is ignored so we never mark an empty utterance.
enum class Endpoint { NONE, AUDIO_END, COMMIT }

class SpeechEndpointer(
    private val silenceThreshold: Int = 500, // mean abs amplitude below this = silence
    private val shortBreakMs: Long = 700,    // silence after speech -> AUDIO_END
    private val holdOutMs: Long = 1500,      // longer silence -> COMMIT (turn over)
    private val sampleRate: Int = 24000,
) {
    private var sawSpeech = false
    private var silentMs = 0L
    private var audioEndSent = false
    private var committed = false

    // Feed one PCM chunk; returns the boundary event (if any) this chunk triggers.
    fun accept(pcm: ByteArray, length: Int): Endpoint {
        val level = meanAbsAmplitude(pcm, length)
        val chunkMs = (length / 2) * 1000L / sampleRate // 2 bytes per sample

        if (level >= silenceThreshold) {
            sawSpeech = true
            silentMs = 0
            audioEndSent = false
            committed = false
            return Endpoint.NONE
        }
        if (!sawSpeech) return Endpoint.NONE // idle/leading silence -> no empty utterance
        silentMs += chunkMs
        if (!audioEndSent && silentMs >= shortBreakMs) {
            audioEndSent = true
            return Endpoint.AUDIO_END
        }
        if (!committed && silentMs >= holdOutMs) {
            committed = true
            return Endpoint.COMMIT
        }
        return Endpoint.NONE
    }

    private fun meanAbsAmplitude(pcm: ByteArray, length: Int): Int {
        var sum = 0L
        var count = 0
        var i = 0
        while (i + 1 < length) {
            val lo = pcm[i].toInt() and 0xFF
            val hi = pcm[i + 1].toInt()
            val sample = ((hi shl 8) or lo).toShort().toInt() // signed 16-bit LE
            sum += abs(sample)
            count++
            i += 2
        }
        return if (count == 0) 0 else (sum / count).toInt()
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `./gradlew :app:testDebugUnitTest --tests "com.example.memaid.SpeechEndpointerTest"`
Expected: PASS (4 tests). Note: the app will not yet **compile as a whole** — `PhoneVoiceSession`/`PhoneListenerService` still call `accept()` in a boolean `if` — that is fixed in Task 7. Unit tests compile only the tested classes, so this step passes independently.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/com/example/memaid/data/SpeechEndpointer.kt app/src/test/java/com/example/memaid/SpeechEndpointerTest.kt
git commit -m "feat: two-threshold SpeechEndpointer with AUDIO_END/COMMIT events"
```

---

## Task 6: `VoiceBridge.sendCommit()`

**Files:**
- Modify: `app/src/main/java/com/example/memaid/data/VoiceBridge.kt` (after `sendAudioEnd`)

- [ ] **Step 1: Add `sendCommit()`**

In `app/src/main/java/com/example/memaid/data/VoiceBridge.kt`, add directly after the `sendAudioEnd()` method:

```kotlin
    // Mark the end of the whole turn (patient held out the full silence). The server speaks
    // the buffered reply as one utterance now.
    fun sendCommit() {
        if (!isConnected) return
        webSocket?.send("""{"type":"commit"}""")
        Log.d("VoiceBridge", "✅ Sent commit")
    }
```

- [ ] **Step 2: Commit** (build is verified in Task 7 once the callers are wired)

```bash
git add app/src/main/java/com/example/memaid/data/VoiceBridge.kt
git commit -m "feat: VoiceBridge.sendCommit sends the turn-over commit message"
```

---

## Task 7: Route the endpointer event in both audio callers

Wire the new `Endpoint` event to `sendAudioEnd()`/`sendCommit()` in the phone-mic path (the one under test) and the watch path (so it keeps compiling and, per the correctness note above, still hears replies).

**Files:**
- Modify: `app/src/main/java/com/example/memaid/data/PhoneVoiceSession.kt:76-80`
- Modify: `app/src/main/java/com/example/memaid/data/PhoneListenerService.kt:150-154`

- [ ] **Step 1: Wire the phone-mic path**

In `PhoneVoiceSession.kt`, replace the mic callback body:

```kotlin
                    val endpointer = SpeechEndpointer()
                    mic = PhoneMicStreamer { buf, n ->
                        voiceBridge.sendAudio(buf, n)                 // no-ops until WS connects
                        when (endpointer.accept(buf, n)) {
                            Endpoint.AUDIO_END -> voiceBridge.sendAudioEnd()
                            Endpoint.COMMIT -> voiceBridge.sendCommit()
                            Endpoint.NONE -> {}
                        }
                    }.also { it.start() }
```

- [ ] **Step 2: Wire the watch path**

In `PhoneListenerService.kt`, replace the boolean `if (endpointer.accept(buf, n)) { … }` block:

```kotlin
                        voiceBridge.sendAudio(buf, n)  // no-ops until WS is connected
                        when (endpointer.accept(buf, n)) {
                            Endpoint.AUDIO_END -> voiceBridge.sendAudioEnd()
                            Endpoint.COMMIT -> voiceBridge.sendCommit()
                            Endpoint.NONE -> {}
                        }
```

(`Endpoint` is in the same package `com.example.memaid.data`, so no import is needed in either file.)

- [ ] **Step 3: Build the app to verify everything compiles and unit tests pass**

Run: `./gradlew :app:assembleDebug :app:testDebugUnitTest`
Expected: BUILD SUCCESSFUL, and the `SpeechEndpointerTest` suite passes.

- [ ] **Step 4: Commit**

```bash
git add app/src/main/java/com/example/memaid/data/PhoneVoiceSession.kt app/src/main/java/com/example/memaid/data/PhoneListenerService.kt
git commit -m "feat: route endpointer AUDIO_END/COMMIT events to the voice bridge"
```

---

## Manual end-to-end verification (after both phases + redeploy)

1. Redeploy the server (Task 4, Step 7) so `wss://ai.guardianova.com` runs the buffering loop.
2. Install the debug build on the phone; start `PhoneVoiceSession` with headphones (avoids mic/speaker echo).
3. Speak a sentence with a natural mid-sentence pause (~0.7-1.0s). Expect: subtitles update as you speak, but **one** spoken reply after you fully stop (~1.5s hold-out) — not 2-3.
4. Say a red-flag phrase ("I fell"). Expect: immediate spoken reply + escalation without waiting for the hold-out.
5. If turns feel too eager or too slow, tune `shortBreakMs`/`holdOutMs` in `SpeechEndpointer` and rebuild (server needs no change).

---

## Notes / open items (from the spec)

- `shortBreakMs` ~700ms and `holdOutMs` ~1500ms are starting points; tune on device.
- Concatenation accumulates across every pause in a turn. If replies get long/repetitive in practice, revisit toward Approach C (OpenAI Realtime API) or a brain-side merge.
- The watch path now also emits `commit`; if the watch server path later diverges, revisit Task 7's watch wiring.
