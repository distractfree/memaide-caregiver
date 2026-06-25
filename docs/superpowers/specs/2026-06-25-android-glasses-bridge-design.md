# MemAide — Meta Glasses → Server Bridge (Android) + Server Recorder

**Date:** 2026-06-25
**Status:** Design approved, ready for implementation plan
**Branch:** `feat/agent-foundation-m1`

## Overview

Build the mobile capture client that feeds the already-built M2 WebSocket server
(`src/memaide/server/ws.py`) with real Meta Ray-Ban glasses media, plus a small
server-side recorder that saves the incoming video stream.

The Android app is a **dumb pipe**: it connects, sends `hello`, streams camera frames and
mic audio up, plays `audio_out` back, and shows a thin debug UI. **No phone-side
VAD/brain/safety** — all reasoning, endpointing, and escalation stay server-side in the
inspectable text brain (the M2 safety invariant is preserved).

Two pieces of work:
1. **Android bridge client** — new `android/` Gradle subdir in this repo.
2. **Server additions** — a `SessionRecorder` that saves every inbound frame, and a change
   to the vision sampling interval (7 s → 2 s).

## Scope

**In scope**
- Android/Kotlin app: foreground service, camera capture (Meta DAT SDK + Mock Device),
  BT-SCO audio capture/playback, WebSocket client, thin debug UI.
- Server: `SessionRecorder` (saves inbound video frames per session), `VISION_INTERVAL_SECONDS`
  change to 2 s.

**Out of scope**
- Phone-side VAD, brain, or safety logic (stays server-side).
- Server-side session *resume* across reconnects (server has no support; not adding).
- Audio recording on the server (only the video stream is saved; easy to add later).
- A playable video file (mp4/ffmpeg) — recording is a folder of JPEGs + a manifest.
- Public Play Store publishing (Meta toolkit preview disables it; side-load only).

## Architecture

```
[Meta Ray-Ban glasses]
   │  camera (Meta DAT SDK videoStream Flow)        ← MockDevice in dev
   │  mic + speaker (Android Bluetooth HFP/SCO)
   ▼
ANDROID APP (android/ subdir)
  MainActivity (debug UI) ── binds ── MediaBridgeService (foreground service)
    MediaBridgeService owns the session and wires:
      ├─ FrameSource ── Flow<RawFrame> ──▶ FrameEncoder ── Flow<dataUrl String> ─┐
      ├─ AudioEngine ── Flow<base64 PCM> (mic) ──────────────────────────────────┤
      │                 ◀── play(pcm) (audio_out)                                │
      │                                                                          ▼
      └─ BridgeSocket ◀── single sender coroutine drains buffered Channel ── outbound
              │  OkHttp WebSocket ⇄ ws://<laptop-LAN-IP>:8765
              ▼  inbound Flow<InboundEvent> → AudioEngine.play / UI state
PYTHON SERVER (src/memaide/server/ws.py, already running, 0.0.0.0:8765)
  per-connection: VisionPipeline (interval 2 s → describer/brain)
                  VoiceLoop (STT → brain → TTS)
                  SessionRecorder (NEW: saves every inbound frame to disk)
```

### Three anchors (carried from the approved architecture)
1. **Two capture mechanisms** — camera via the Meta SDK; mic + speaker via Android
   Bluetooth audio (the SDK does NOT do audio).
2. **Capture seam** — `FrameSource` interface lets MockDevice (dev) / real glasses (later) /
   optional phone camera be swapped without touching the rest of the app.
3. **Dumb pipe** — the phone only moves bytes and plays audio.

## Components — Android client

All inter-component data flow uses **Kotlin Flows + a buffered Channel** (idiomatic,
backpressure-aware, testable with fake Flows; matches the Meta SDK's `videoStream` Flow).

### `MainActivity` (thin debug UI)
- Start / Stop session button.
- Live status: socket state, current `session_id`, frame fps, mic level.
- Last `subtitle` text and last `vision_context` (description/label).
- Permission prompts (RECORD_AUDIO, CAMERA, BLUETOOTH_CONNECT).
- No logic beyond binding to and rendering `MediaBridgeService` state.

### `MediaBridgeService` (foreground service)
- Owns the whole session lifecycle; holds the foreground notification required for
  continuous capture.
- Collects `FrameEncoder` output and `AudioEngine.micPcm()` into a single buffered
  **outbound `Channel<OutboundMessage>`**; one **sender coroutine** drains it to
  `BridgeSocket` (frames + audio interleave on one writer).
- Subscribes to `BridgeSocket` inbound events and fans them out: `audio_out` →
  `AudioEngine.play()`; `vision_context` / `subtitle` / `escalation` → UI state;
  `audio_error` → UI/log.
- Holds a `SessionState` (Disconnected, Connecting, Streaming, Reconnecting).

### `FrameSource` (interface)
- `fun frames(): Flow<RawFrame>`
- `GlassesFrameSource` — Meta DAT SDK: `Wearables.initialize` → `startRegistration` →
  `createSession(AutoDeviceSelector())` → `CameraStream.videoStream` Flow. Config:
  **LOW resolution, 2 fps** (SDK floor). Works against **MockDevice** in dev (no glasses),
  real glasses later — same interface.
- `PhoneCameraFrameSource` — optional CameraX fallback for testing without any glasses.

### `FrameEncoder`
- `Flow<RawFrame>` → JPEG → base64 → `data:image/jpeg;base64,…`.
- **Sends every captured frame** (no client-side throttle — the server decimates to the
  brain). Single home for frame-formatting/quality decisions. Pure, unit-testable.

### `AudioEngine`
- Owns the BT-SCO link **for the whole session** (started when streaming begins, held until
  stop). Single home for all Bluetooth audio quirks.
- Wraps `AudioRecord` (mic) + `AudioTrack` (speaker) + an internal `Resampler`.
- `micPcm(): Flow<String>` — base64 PCM16 @ 24 kHz, up-sampled from the ~16 kHz HFP mic.
- `play(pcm)` — plays `audio_out`, down-sampled 24 kHz → the SCO link rate.
- Constraint handled here: A2DP (high-quality playback) and HFP/SCO (mic) can't run at once;
  a two-way assistant needs both, so the engine commits to SCO for both directions
  (mono ~16 kHz) for the session.

### `BridgeSocket`
- OkHttp WebSocket client to `ws://<laptop-LAN-IP>:8765`.
- **Send:** `hello` (once, with `session_id` + `PatientContext`), `frame`
  (`data_url`), `audio` (`pcm` base64 PCM16), `bye`.
- **Receive:** parses JSON into a typed `Flow<InboundEvent>`: `vision_context`,
  `subtitle`, `escalation`, `audio_out`, `audio_error`.
- Owns reconnect with exponential backoff (see Error handling).

### Models
- `RawFrame` (pixels + width/height + format), `PatientContext`, WS message DTOs (outbound
  + inbound), `SessionState` enum.

## Components — Server additions

### `SessionRecorder` (new)
- A sink registered in `handle()` alongside the existing demux. For every inbound `frame`
  message it persists the JPEG to disk under a per-session folder:
  - `recordings/<session_id>/<seq>-<ts>.jpg` (one file per frame).
  - `recordings/<session_id>/manifest.json` — ordered list of `{seq, ts, file}` entries.
- Decodes the `data:image/jpeg;base64,…` payload to raw JPEG bytes before writing.
- Independent of the `VisionPipeline` / `VoiceLoop` tasks — it does not affect describe
  cadence or the brain. Built behind a seam (injectable, like the other `ServerDeps`) so it
  can be disabled/faked in tests and turned off in environments where recording isn't wanted.
- Records **video frames only**; audio is out of scope (extendable later).

### Vision interval change
- `config.VISION_INTERVAL_SECONDS`: **7 → 2**. The `VisionPipeline` keeps the latest frame
  and describes one every interval, so this makes the brain consume a frame every 2 s.
- **Cost note:** ~3.5× more describer (vision LLM) calls vs. 7 s. Accepted, conscious choice.

## Data flow (per session)

1. User taps Start → `MediaBridgeService` starts, requests permissions, starts foreground
   notification, `AudioEngine` brings up SCO, `BridgeSocket` connects.
2. On socket open → send `hello` (new `session_id` + `PatientContext`).
3. **Frames up:** `GlassesFrameSource.frames()` (2 fps) → `FrameEncoder` → outbound `Channel`
   → sender coroutine → `frame` messages.
4. **Audio up:** `AudioEngine.micPcm()` → outbound `Channel` → sender coroutine → `audio`
   messages.
5. **Server:** each `frame` → `VisionPipeline` (describes every 2 s) **and** `SessionRecorder`
   (saved to disk); each `audio` → `VoiceLoop` (STT → brain → TTS).
6. **Inbound:** `audio_out` → `AudioEngine.play()`; `vision_context` / `subtitle` /
   `escalation` → UI; `audio_error` → UI/log.
7. Stop → send `bye`, tear down SCO, stop capture, stop foreground service.

## Error handling

- **WebSocket drop** (WiFi, phone sleep, glasses out of range): `BridgeSocket` reconnects
  with exponential backoff (e.g. 0.5 s → cap 10 s). On reconnect it sends a **fresh `hello`
  (new `session_id`, same `PatientContext`)** because the server's `VoiceLoop` is
  per-connection (no resume). Capture keeps running while disconnected; the outbound queue is
  **cleared on drop** so nothing stale flushes on reconnect. Frames use a **drop-oldest**
  policy on the channel so they never backlog. Socket state shown in the debug UI.
- **Permissions denied** (RECORD_AUDIO, CAMERA, BLUETOOTH_CONNECT): surfaced in UI, no crash;
  session can't start until granted.
- **SCO setup failure** and server `audio_error`: surfaced to the UI/log; the session
  continues where possible.
- **Server `SessionRecorder` I/O error**: logged and skipped per-frame; never blocks the
  vision/voice tasks or the connection.

## Testing strategy

- **MockDevice** (Meta Mock Device Kit, `mwdat-mockdevice`) drives the whole client pipe
  end-to-end with **no glasses** (camera/mic/permissions simulated).
- **Pure JVM unit tests** (no device): `FrameEncoder` (RawFrame → data-URL), `Resampler`
  (16↔24 kHz), WS DTO (de)serialization, reconnect/backoff, outbound drop-oldest policy.
- **Wiring tests:** fake `FrameSource` + `MockWebServer` against `MediaBridgeService`.
- **Server tests** (existing Python suite): `SessionRecorder` unit test (frames → files +
  manifest, bad base64 skipped, I/O error tolerated); confirm the 2 s interval flows through
  `ServerDeps`/`VisionPipeline`. These extend the 95-test suite.
- **Manual:** MockDevice → live laptop WS server (same WiFi, `ws://<laptop-LAN-IP>:8765`),
  verifying frames recorded to disk, `vision_context`/`subtitle` returned, `audio_out`
  played; then the same against **real glasses** with Developer Mode enabled.

## Setup / dependencies

- **Meta Wearables Device Access Toolkit** — public developer preview (since Dec 2025, no
  invite gate). Get the SDK at `developers.meta.com/wearables`; enable Developer Mode on the
  glasses via the Meta AI app. Gradle (GitHub Packages): `mwdat-core`, `mwdat-camera`,
  `mwdat-mockdevice`.
- **Manifest perms:** Bluetooth, Bluetooth_Connect, Internet, Camera, Record_Audio.
- **Android deps:** OkHttp (WebSocket), Kotlin coroutines; CameraX only if the optional phone
  fallback is built.
- **Reachability:** phone → laptop over the same WiFi; server already binds `0.0.0.0:8765`
  (`config.WS_HOST` / `config.WS_PORT`); plain `ws://` for local dev (no TLS).

## WebSocket contract (target — `src/memaide/server/ws.py`)

- **Send:** `{"type":"hello","session_id":…,"patient":{PatientContext}}` once; then
  `{"type":"frame","data_url":"data:image/jpeg;base64,…"}` and
  `{"type":"audio","pcm":"<base64 PCM16>"}`; `{"type":"bye"}` to close.
- **Receive:** `vision_context` (description/label/advisory_flags/ts), `subtitle`
  (text/role), `escalation` (reason/triggered_by), `audio_out` (base64 pcm/seq),
  `audio_error`.

## Open questions for the plan

- Exact `RawFrame` payload shape from the Meta SDK `videoStream` Flow (not documented yet —
  confirm at implementation against the real/Mock SDK).
- Whether `SessionRecorder` recording is on by default or behind a config flag.
- BT-SCO sample rate actually negotiated on the target glasses (assume ~16 kHz; resampler
  must read the real rate).

## Sources

- https://developers.meta.com/wearables/faq/
- https://developers.meta.com/blog/introducing-meta-wearables-device-access-toolkit/
- https://wearables.developer.meta.com/docs/build-integration-android/
- https://github.com/facebook/meta-wearables-dat-android

## Repo conventions

- **No self-attribution in git** — no "Co-Authored-By: Claude" / "Generated with…" lines.
- **No `.env.example`** — document env vars in the README.
