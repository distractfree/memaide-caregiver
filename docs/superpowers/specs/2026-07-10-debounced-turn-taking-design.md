# Debounced turn-taking (two-stage endpointing) — design

Date: 2026-07-10
Status: Approved design, not yet implemented
Branches touched: `anthony/student3-work` (server) + `anthony/phone-mic` / `arian/student1-work` (client)

## Problem

The live voice loop segments turns with a crude client-side energy VAD (`SpeechEndpointer`,
`hangoverMs`). Any natural mid-sentence pause longer than the hangover ends the "turn", so a
single spoken sentence is split into 2–3 utterances, each transcribed and answered separately.
Result: the patient says one thing and hears 2–3 near-duplicate replies (each greeting-flavored
because the history is still tiny). Tuning the single hangover only trades false splits for
latency; it never eliminates the problem.

## Goal

Speak **one** reply per real turn. Use a short pause to *prepare* a reply (low latency), but
only *speak* it once a longer silence confirms the patient is actually done. If they resume
before that, keep accumulating and concatenate.

## Approach A — client times, server accumulates (chosen)

The client already computes audio energy, so it owns the timing; the server owns
STT/brain/merge/TTS. Rejected alternatives: (B) all-server-side, which needs the server to
re-implement VAD on a continuously-streaming (silence-padded) mic; (C) OpenAI Realtime API,
which is the right long-term architecture but a full voice-loop rewrite — out of scope here.

### WS protocol

Client → server (`src/memaide/server/ws.py` demux):
- `{"type":"audio","pcm":"<b64>"}` — unchanged (streamed continuously).
- `{"type":"audio_end"}` — unchanged meaning: **short-break** utterance boundary.
- `{"type":"commit"}` — **NEW**: the client's VAD saw the full **hold-out** of silence; the
  turn is over.
- `{"type":"bye"}` — unchanged.

Server → client: unchanged (`subtitle`, `audio_out`, `escalation`, `vision_context`).

### Server behavior (`VoiceLoop`)

- Maintain a **pending-reply buffer** (`list[str]`).
- On each `audio_end` utterance: STT → brain → **append `reply_text` to the buffer** and send
  a `subtitle` for interim text. **Do not synthesize/`audio_out` yet.**
- On `commit`: if the buffer is non-empty, concatenate the buffered replies into one string,
  make **one TTS call**, send `audio_out`, then clear the buffer.
- **Escalation bypass:** if a brain decision on any utterance trips escalation
  (`wants_escalation` or a rule-based red flag), flush immediately — TTS the buffered text
  (including this reply), fire the escalation callback — and clear. Do not wait for `commit`.
- **Safety flush:** flush the buffer on `bye`/disconnect so an in-progress turn is never lost.
- The connect-time **greeting is unchanged** — `greet()` still emits its `audio_out`
  immediately and is not part of the buffer/commit cycle.

### Client behavior (`SpeechEndpointer` + phone-mic path)

- Track silence with **two thresholds** instead of one:
  - `shortBreakMs` (default ~700ms of silence after speech) → emit `AUDIO_END` **once**.
  - `holdOutMs` (default ~1500ms) → emit `COMMIT` **once**.
  - Reset both flags when speech resumes.
- `accept()` returns an event (`NONE | AUDIO_END | COMMIT`) per chunk.
- Phone-mic path (`PhoneVoiceSession`) sends `audio_end` and the new `commit` via
  `VoiceBridge` (add `VoiceBridge.sendCommit()` → `{"type":"commit"}`).
- `SpeechEndpointer` is shared with the watch path (`PhoneListenerService`); it gets the same
  two-threshold behavior, but this spec only wires the phone-mic client (the one under test).

## Edge cases

- **`commit` racing an in-flight brain call:** the client sends `audio_end` (~0.7s) then
  `commit` (~1.5s); a slow STT+brain (~1s) may not have appended yet when `commit` arrives.
  `commit` must **await the current utterance's processing** before flushing, so a late reply
  is included, not dropped.
- **Empty buffer on `commit`:** no-op.
- **Escalation mid-turn:** immediate flush, per above.
- **Buffer snapshot:** `commit`/flush snapshots and clears the buffer synchronously before
  awaiting TTS, so a new utterance arriving during TTS starts a fresh turn.

## Testing (TDD)

Server (`tests/test_voice_loop.py`, `tests/test_ws.py`):
- utterance `audio_end` appends to the buffer and sends a subtitle but **no `audio_out`**.
- `commit` concatenates the buffer into exactly one `audio_out`, then clears.
- two utterances then `commit` → one concatenated `audio_out`.
- escalating utterance flushes immediately (no `commit` needed).
- `bye` with a pending buffer flushes.

Client (Kotlin unit test for `SpeechEndpointer`):
- feed speech then silence chunks → `AUDIO_END` at `shortBreakMs`, `COMMIT` at `holdOutMs`,
  each exactly once; resumed speech resets.

## Tunables / open

- `shortBreakMs` ~700ms, `holdOutMs` ~1500ms are starting points; tune on device.
- The concatenation accumulates across every pause in a turn; if replies get long/repetitive
  in practice, revisit toward Approach C (Realtime) or a brain-side merge.
