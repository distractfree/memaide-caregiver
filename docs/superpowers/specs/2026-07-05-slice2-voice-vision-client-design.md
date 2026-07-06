# AI Agent ↔ Caregiver Backend Integration — Slice 2: Voice/Vision Live Session

**Date:** 2026-07-05
**Author:** Student 3 (AI agent)
**Status:** Design seed — open decisions flagged; not yet ready for implementation

## Context

Builds on Slice 1 (`2026-07-05-ai-agent-backend-integration-slice1-design.md`). Slice 1 wires koko's text help-session to my Python `/infer` endpoint (koko calls me per message). Slice 2 adds the **real-time voice + video** path, which is the actual product experience: the patient speaks, the glasses see, my AI responds by voice.

**Key architectural difference from Slice 1: control inverts.** In Slice 1, koko orchestrates and calls me per turn. In Slice 2, **my server owns the live session** (audio/video over WebSocket) and reports events back to koko. koko's DB remains the single source of truth in both.

The per-message `/infer` contract does **not** carry the live media stream; the voice path gets its own `/session/*` endpoints. `/infer` (text) and `/session/*` (voice) coexist.

## Goal & scope

Patient starts a help session on Arian's Android/Wear app → device streams voice+video to my server → my AI runs the live conversation → escalations reach the caregiver in real time → the full transcript is archived in koko's DB and visible in the caregiver portal.

## End-to-end flow

```
[Watch/Phone] help button pressed
     │
     ├─(1) POST koko /ai-sessions/start  {deviceId, vitals, beacons}
     │        └─ koko creates AiSession, assembles context from DB (patient, meds,
     │           conditions, caregiver, latest vitals, recent beacons, history)
     │             │
     │             └─(2) POST my-python /session/start
     │                    {session_id, patient, vitals, beacons, meds, conditions, caregiver}
     │
     └─(3) open WebSocket to my-python, hello {session_id}   ← audio + video frames
                  └─ my server correlates (3) with (2), then starts STT + the live voice loop
                         │
                         ├─(4a) escalation fires → POST koko /ai-sessions/:id/escalation   ⚡ immediately
                         │        └─ koko: validateTransition → emergency_suggested + notify caregiver live
                         │
                         └─(4b) session ends    → POST koko /ai-sessions/:id/conclude
                                  {transcript, escalation_summary, outcome, handoff_type}
                                  └─ koko persists AiSessionMessages + session summary
```

## Work breakdown by owner

### Student 2 (koko) — Node/Express/Prisma
- **Disconnect the scripted AI** on the voice path; my server becomes the brain (Slice 1 keeps the script only as the text-path fallback).
- **Update session-start** to accept vitals/beacons from the device and to **POST context to my server** (step 2) after creating the `AiSession`.
- **New inbound endpoints to receive my POSTs:**
  - `POST /ai-sessions/:id/escalation` — real-time; drives `emergency_suggested` + caregiver notification.
  - `POST /ai-sessions/:id/conclude` — end-of-session; persists transcript + summary as `AiSessionMessage`s.
- **Return `session_id`** to the device on start so the WebSocket can correlate (see Open Decision 1).

### Student 1 (Arian) — Android + Wear
- **Add Meta glasses connection functionality**, ported from Student 3's `com.memaide.bridge` tester app (DAT SDK pairing/camera stream + `AudioEngine` SCO audio + `BridgeSocket`/`MediaBridgeService`/`FrameEncoder`/`Resampler`). See the Slice 2 prerequisite in the Slice 1 spec.
- **Wire the help button** to: (1) POST koko to start the session, (3) open the WebSocket to my server and stream audio/video.
- **Add UI feedback** so the patient can see when the AI agent is listening / speaking (a clear "listening" indicator during a live session).

### Student 3 (me) — Python
- **Update the WebSocket server and `/session/*` endpoints** to match koko's and Arian's implementations:
  - `POST /session/start` — receive patient context from koko; hold it keyed by `session_id`.
  - WebSocket `hello {session_id}` — correlate the incoming media stream with the context from koko before transcribing.
  - **Report events back to koko:** POST escalation the instant it fires; POST transcript/summary on conclude. Reuse `SessionRecord` as the conclude payload; do **not** send caregiver info back (koko already owns it).

## Contract sketch (`/session/*`)

- `POST /session/start` → `{session_id, patient{...}, vitals?, beacons?, meds?, conditions?, caregiver{...}}` (mirrors the Slice 1 `/infer` patient block; auth via `X-Api-Key`).
- WebSocket: existing `ws.py` protocol — `hello`, `frame`, `audio` in; `subtitle`, `audio_out`, `escalation`, `vision_context` out. Add `session_id` correlation.
- My server → koko: `POST /ai-sessions/:id/escalation {reason, triggered_by}` and `POST /ai-sessions/:id/conclude {transcript[], escalation_summary, outcome, handoff_type}`.

## Open decisions (must resolve before implementation)

1. **Correlation key + ordering.** How the WebSocket (media) and koko's context POST match to the same session, without a race. Leading option: device POSTs koko *first* → koko returns `session_id` → device opens WebSocket with that `session_id` → koko's context POST uses the same key. Alternative: use `deviceId` as the key if the device can't wait for koko's response.
2. **Reporting granularity.** Confirmed: **escalation is real-time** (POST the instant it fires — non-negotiable for an emergency product). Still open: whether transcript turns are **streamed live** to koko (caregiver watches in real time) or only sent in the end-of-session `conclude` POST. Real-time escalation is required either way.

## Dependencies & sequencing
- Depends on Slice 1 (patient-context assembly in koko, extended schema) and Slice 3 (both servers co-located on koko's droplet, distinct ports: koko `:4000`, my WebSocket `:8765`, preview `:8000`, `/infer` + `/session` on another port e.g. `:8080`; TLS/`wss://` for the public media stream).
- The glasses/audio port into Arian's app is the largest single task and the reason the "merge vs. coordinate the two Android apps" question is central here.

## Out of scope
- Multi-patient / concurrent-session scaling.
- Reconnect/resume of a dropped WebSocket mid-session (note as a robustness follow-up).
