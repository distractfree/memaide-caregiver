# AI Agent ↔ Caregiver Backend Integration — Slice 1: Backend Bridge

**Date:** 2026-07-05
**Author:** Student 3 (AI agent)
**Status:** Design — awaiting review

## Context

Three student projects make up MemAide:

- **Student 1 (Arian)** — Android + Wear patient/caregiver app. A pure REST client of Student 2's server (`com.example.memaid`).
- **Student 2 (koko)** — Node/Express/Prisma backend + React caregiver web portal, deployed on a DigitalOcean droplet at `http://134.122.115.15:4000`. It owns the database and the caregiver-facing UI.
- **Student 3 (me)** — Python voice/vision AI agent (`AgentSession` + `AgentBrain`), currently standalone over WebSocket, with no database.

koko's server already models an **AI support session** (`ai_sessions` + `ai_session_messages`, a validated state machine, mobile + caregiver endpoints). But its "AI" is a **scripted placeholder**: `determineNextAiMessage()` in `server/src/modules/ai-sessions/ai-session.messages.ts` is a keyword scan plus a fixed 3-step reply script. Its own comment says it exists "to avoid external LLM dependencies for the MVP."

**Goal of the integration:** replace that placeholder with my real AI agent. koko keeps everything it does well (persistence, session lifecycle, caregiver portal); my agent becomes the brain.

## Scope

This spec covers **Slice 1 only: the backend bridge on the text path.** The full integration is decomposed into three slices:

1. **Slice 1 (this spec)** — koko calls my agent for replies instead of the script; koko's DB stays the system of record. Testable without any Android work. Milestone: the caregiver web portal shows a *real* AI transcript.
2. **Slice 2 (deferred)** — voice/vision on Arian's app: the patient device streams audio/video to my WebSocket server; my server persists sessions to koko via REST.
3. **Slice 3 (deferred)** — deployment (my server reachable from the droplet) + near-real-time caregiver portal updates.

Out of scope for Slice 1: voice/audio, Arian's app changes, WebSocket streaming, caregiver-portal data-entry UI for the new patient fields.

## Chosen approach

**koko orchestrates; my agent is a stateless `/infer` HTTP service.** (Approach A of three considered; B = stateful in-memory session service, C = invert control so my agent owns the session. B duplicates session state across two stores; C is the natural shape for the *voice* slice, not the text path.)

Rationale: smallest change to koko (swap one function), koko's DB remains the single source of truth, my agent stays stateless and restart-safe, and koko can fall back to the script when my service is unreachable. In Slice 2 control inverts (my live server calls koko's persistence endpoints), but koko's DB is the system of record in **both** slices, so they stay consistent.

## Architecture & data flow

```
Patient (Arian's app, text)
        │  POST /api/mobile/ai-sessions/:id/messages  {message}
        ▼
koko server  ── assembles context from Prisma DB ──┐
        │                                           │
        │  POST {AI_AGENT_URL}/infer  (JSON)         │  reads: Patient, Caregiver,
        ▼                                           │  Medication, Reminder, VitalEvent,
my Python /infer service                            │  BeaconEvent, AiSessionMessage
        │  builds PatientContext (static) +          │
        │  live context (vitals/beacons/vision) ──▶  AgentBrain.respond(transcript, ...)
        │
        ▼  {reply_text, escalate, escalation{reason,triggered_by}, handoff_ready, intent}
koko server
        │  persists AiSessionMessage(ai), drives state machine
        │  (escalate → emergency_suggested), stores reason/triggered_by in metadata
        ▼
Prisma DB ──▶ caregiver web portal shows the real transcript
```

If `/infer` errors or times out, koko falls back to `determineNextAiMessage()` (graceful degradation; also keeps the demo safe).

## The `/infer` contract

### Request (koko → my agent)

```jsonc
{
  "session": {
    "session_id": "cuid",
    "started_at": "2026-07-05T10:00:00Z",
    "help_event_id": "cuid | null",     // AiSession.helpEventId
    "trigger": "help_event | manual | null"
  },
  "patient": {                          // static profile → system prompt
    "patient_id": "uuid",
    "name": "Jane Doe",
    "preferred_name": "Jane | null",
    "age": 78,                          // derived from Patient.dateOfBirth; null if unknown
    "bio_info": "Lives alone... | null",
    "language": "en",
    "known_conditions": ["type 2 diabetes", "mild dementia"],  // Patient.conditions[]
    "medications": [                    // new Medication model
      { "name": "Metformin", "dose": "500mg", "schedule": "twice daily", "active": true }
    ],
    "caregiver": { "id": "uuid", "name": "John Doe", "phone": "+1... | null" }
  },
  "vitals": {                           // live → per-turn context; latest VitalEvent, or null
    "heart_rate": 82,
    "motion_state": "still",
    "step_count": 1203,
    "timestamp": "2026-07-05T10:04:00Z"
  },
  "beacons_triggered": [                // live → per-turn context; recent BeaconEvents
    { "room": "bathroom", "detected_at": "...", "dwell_seconds": 240,
      "estimated_distance_m": 1.2, "exited_at": "... | null" }
  ],
  "vision": null,                       // always null on the text path (Slice 2 populates)
  "history": [                          // full transcript from AiSessionMessages
    { "role": "system|ai|patient|event", "text": "...", "ts": "..." }
  ],
  "latest_message": "I feel dizzy",     // the new patient message this turn
  "seconds_since_last_speech": 0        // not meaningful on text path; always 0 for Slice 1
}
```

All of `patient.age`, `bio_info`, `known_conditions`, `medications`, `vitals`, `beacons_triggered`, and `vision` are **optional/nullable**, so the pipe works before a patient's profile is filled in.

### Response (my agent → koko)

Mirrors `AgentDecision` + `EscalationDecision`:

```jsonc
{
  "reply_text": "Let's sit down together. Are you feeling faint?",
  "escalate": false,
  "escalation": { "reason": "", "triggered_by": [] },
  "handoff_ready": false,
  "intent": "assist"
}
```

## Component changes

### My agent (Python) — new + changed

1. **New HTTP endpoint** `POST /infer` (FastAPI or equivalent), separate from the existing WebSocket server. Stateless: it constructs an ephemeral `AgentSession`/context per call from the request, runs one turn, and returns the decision. No session is retained in memory.
2. **Richer request schema** — a new `InferRequest` Pydantic model matching the contract above. It maps onto an extended `PatientContext` (static fields) plus live context objects (vitals, beacons).
3. **Extend `PatientContext`** with `age`, `bio_info`, `medications`, and reuse existing `known_conditions`. `preferred_name`, `language`, `notes` already exist.
4. **Thread new context into the prompt:**
   - **Static profile** (age, bio, conditions, medications, caregiver) → extend `build_system_prompt(patient)` in `prompts/system_prompt.py`. Stable for the session, so it belongs in the system prompt.
   - **Live context** (vitals, beacons) → inject per-turn as system messages in `AgentBrain._build_messages`, exactly the way `vision` is injected today (`[VITALS] ...`, `[LOCATION] ...`).
5. **Escalation** — `EscalationMonitor.check` already returns `EscalationDecision`. The endpoint returns `escalate`/`reason`/`triggered_by` from it, OR-ed with `AgentDecision.wants_escalation`, matching `AgentSession.handle_patient_input`'s existing logic.
6. **Service auth** — accept a shared secret via header (`X-Api-Key`); reject if it doesn't match `AI_AGENT_API_KEY`.

### koko server (Node/Express/Prisma) — changed

1. **Prisma migration** — extend `Patient` with `dateOfBirth DateTime?`, `bioInfo String?`, `conditions String[]`; add a `Medication` model (`id, patientId, name, dose?, schedule?, active`) related to `Patient`. Run migration; **seed demo values** so a demo shows real context.
2. **Context assembly** — in `ai-session.service.handlePatientMessage`, before generating a reply, gather: patient (with caregiver, conditions, medications), latest `VitalEvent`, recent `BeaconEvent`s, and the session's `AiSessionMessage` history. Build the `/infer` request body.
3. **Call `/infer`** — replace the `determineNextAiMessage(...)` call with `await fetch(env.AI_AGENT_URL + "/infer", { headers: { "X-Api-Key": env.AI_AGENT_API_KEY }, ... })`. Add `AI_AGENT_URL` and `AI_AGENT_API_KEY` to `config/env.ts`.
4. **Map the response** — persist `reply_text` as `AiSessionMessage(senderType:"ai")`; if `escalate`, run the existing `validateTransition(..., "emergency_suggested")`, set `emergencySuggestedAt`, and store `escalation.reason`/`triggered_by`/`intent` in `AiSessionMessage.metadata` (or `AiSession.metadata`). Behaviour and DB writes otherwise unchanged.
5. **Fallback** — on any `/infer` error/timeout (e.g. 3s), log and fall back to `determineNextAiMessage()` so the session still progresses. Keep the scripted module; do not delete it.

## Error handling

- **`/infer` unreachable / non-2xx / timeout** → koko logs and uses the scripted fallback for that turn. The patient never sees a failure.
- **Malformed `/infer` response** → treated as an error → fallback.
- **Bad/missing `X-Api-Key`** → my agent returns 401; koko treats it as an error → fallback (and the misconfiguration shows up in logs).
- **Escalation transition invalid for current state** → koko's existing `validateTransition` already throws `AppError(400)`; keep that behaviour (only escalate from `active`, as the current code does).

## Testing

- **My agent:** unit-test `/infer` with a stubbed brain (like `StubTextToSpeech`) — assert request parsing, that static vs live context land in the right prompt positions, and that escalation OR-ing is correct. Test the auth header gate.
- **koko:** extend the existing Vitest suite (`ai-sessions.test.ts`) — mock `/infer`, assert koko builds the right context from seeded DB rows, persists the returned reply, and drives `emergency_suggested` on `escalate:true`. Add a **fallback test**: `/infer` down → scripted reply is used and the session still advances.
- **End-to-end (manual):** run koko + my agent locally, seed a patient with conditions/meds/vitals, POST a patient message through `/api/mobile/ai-sessions/:id/messages`, confirm a real AI reply appears in the caregiver portal and that a high-risk message flips the session to `emergency_suggested`.

## Deferred / follow-ups

- Voice/vision path (Slice 2) and deployment (Slice 3).
- Caregiver-portal UI to enter `dateOfBirth`/`bioInfo`/`conditions`/`medications` (Slice 1 seeds them directly).
- Time-based escalation (silence ticks) — meaningful only on the live voice path, so `seconds_since_last_speech` is always 0 here.
- Surfacing the new patient-profile fields in Arian's app UI.

### Slice 2 prerequisite (record now, do not forget)

Arian's patient app (`com.example.memaid`) has **no glasses, camera, WebSocket, or audio** code — it is a pure REST client. The glasses-onboarding and media capability exists **only in Student 3's tester app** (`com.memaide.bridge`), which is therefore the **reference implementation**, not throwaway. Slice 2 must **port these modules from the bridge app into Arian's app** (lift rather than rebuild):

- Meta Wearables **DAT SDK** integration (`mwdat 0.8.0` + camera Stream setup).
- **Glasses pairing/connection flow** (discover, connect, provision the camera stream).
- **Bluetooth SCO audio bring-up** — `com.memaide.bridge.audio` (`AudioEngine.start()` mic/speaker over HFP, `Resampler`).
- **WebSocket + audio/frame pipeline** — `com.memaide.bridge.ws` (`BridgeSocket`), `MediaBridgeService`, `FrameEncoder`.

This is what makes the "merge vs. coordinate the two Android apps" decision the central question of Slice 2. It does **not** affect Slice 1 (no Android needed), so it is safely deferred — but must be an explicit line item when Slice 2 is designed: *"port glasses setup + audio/vision pipeline from the bridge tester app into Arian's patient app."*
```
