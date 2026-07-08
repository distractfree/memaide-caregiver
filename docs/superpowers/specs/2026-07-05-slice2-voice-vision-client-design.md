# AI Agent ↔ Caregiver Backend Integration — Slice 2: Voice/Vision Live Session

**Date:** 2026-07-05 (open decisions resolved 2026-07-07)
**Author:** Student 3 (AI agent)
**Status:** Ready for implementation (my Python side). Open decisions resolved; contract is authoritative — koko and Arian build to it.

## Context

Builds on Slice 1 (`2026-07-05-ai-agent-backend-integration-slice1-design.md`). Slice 1 wires koko's text help-session to my Python `/infer` endpoint (koko calls me per message). Slice 2 adds the **real-time voice + video** path, which is the actual product experience: the patient speaks, the glasses see, my AI responds by voice.

**Key architectural difference from Slice 1: control inverts.** In Slice 1, koko orchestrates and calls me per turn. In Slice 2, **my server owns the live session** (audio/video over WebSocket) and reports events back to koko. koko's DB remains the single source of truth in both.

The per-message `/infer` contract does **not** carry the live media stream; the voice path gets its own `/session/*` endpoints. `/infer` (text) and `/session/*` (voice) coexist in the same HTTP process.

**Contract ownership (decided 2026-07-07):** I am setting the Slice 2 contract. koko and Arian have not committed to endpoints yet, so the `/session/*` + koko-callback shapes below are authoritative; the other two build to them.

## Goal & scope

Patient starts a help session on Arian's Android/Wear app → device streams voice+video to my server → my AI runs the live conversation → escalations reach the caregiver in real time → the full transcript is archived in koko's DB and visible in the caregiver portal.

## End-to-end flow

```
[Watch/Phone] help button pressed
     │
     ├─(1) POST koko /ai-sessions/start  {deviceId, vitals, beacons}
     │        └─ koko creates AiSession, assembles context from DB (patient, meds,
     │           conditions, caregiver, latest vitals, recent beacons, history),
     │           returns session_id to the device
     │             │
     │             └─(2) POST my-python /session/start
     │                    {session_id, patient, vitals, beacons}
     │                       └─ my server: registry.put_context(session_id, ctx)
     │
     └─(3) open WebSocket to my-python, hello {session_id}   ← audio + video frames
                  └─ my server: registry.wait_context(session_id) (buffer + wait ≤10s),
                     then starts STT + the live voice loop
                         │
                         ├─(4a) escalation fires → POST koko /ai-sessions/:id/escalation   ⚡ immediately, once
                         │        └─ koko: validateTransition → emergency_suggested + notify caregiver live
                         │
                         └─(4b) session ends → POST koko /ai-sessions/:id/conclude
                                  {SessionRecord..., outcome}
                                  └─ koko persists AiSessionMessages + session summary

    Session ends on: bye (help button pressed again — deliberate stop),
    abnormal socket close (disconnect), or a caregiver-joined signal.
```

## Resolved open decisions

1. **Correlation key + ordering — RESOLVED.** Key is `session_id` (device gets it from koko's `/ai-sessions/start` response, then opens the WebSocket with it; koko's `/session/start` context POST uses the same key). **Arrival order is handled by buffer-and-wait with a ~10s timeout:** whichever of the context POST (step 2) or the WebSocket `hello` (step 3) arrives first is accepted; if the WS arrives first, the socket is held and early frames/audio are buffered until context lands; if context lands first, it is stashed keyed by `session_id` awaiting the WS. If context does not arrive within ~10s, the WS is closed with an `error`. See `SessionRegistry` (§Components).

2. **Reporting granularity — RESOLVED.** Escalation is **real-time** (POST the instant it fires — non-negotiable for an emergency product). Transcript turns are **end-only**: buffered in my server and sent once in the `conclude` POST. Live per-turn streaming to koko is deferred (can be added later without breaking the end-only path).

## Work breakdown by owner

### Student 2 (koko) — Node/Express/Prisma
- **Disconnect the scripted AI** on the voice path; my server becomes the brain (Slice 1 keeps the script only as the text-path fallback).
- **Update session-start** to accept vitals/beacons from the device, create the `AiSession`, **return `session_id` to the device**, and **POST context to my server** (step 2).
- **New inbound endpoints to receive my POSTs:**
  - `POST /ai-sessions/:id/escalation` — real-time; drives `emergency_suggested` + caregiver notification.
  - `POST /ai-sessions/:id/conclude` — end-of-session; persists transcript + summary as `AiSessionMessage`s.
- **Authenticate my callbacks** via the shared `KOKO_API_KEY` (my server sends it; koko validates).

### Student 1 (Arian) — Android + Wear
- **Add Meta glasses connection functionality**, ported from Student 3's `com.memaide.bridge` tester app (DAT SDK pairing/camera stream + `AudioEngine` SCO audio + `BridgeSocket`/`MediaBridgeService`/`FrameEncoder`/`Resampler`). See the Slice 2 prerequisite in the Slice 1 spec.
- **Wire the help button** to: (1) POST koko to start the session and receive `session_id`, (3) open the WebSocket to my server with `hello {session_id}` and stream audio/video.
- **Wire the help button *again* (second press) to stop the session** — send `{type:"bye"}` over the WebSocket. This is the authoritative stop denoter.
- **Add UI feedback** so the patient can see when the AI agent is listening / speaking (a clear "listening" indicator during a live session).

### Student 3 (me) — Python
- **Add `POST /session/start`** to the existing FastAPI app (alongside `/infer`): receive patient context from koko, `registry.put_context(session_id, ctx)`. Auth `X-Api-Key` (reuses `require_api_key`).
- **Correlate the WebSocket by `session_id`:** `hello` now carries only `{session_id}`; the handler looks the context up in the registry (buffer + wait) instead of reading the patient from the `hello` payload.
- **Report events back to koko** via a new `KokoReporter` seam: POST escalation the instant it fires (once, edge-triggered); POST the `SessionRecord` + `outcome` on conclude. Do **not** send caregiver info back (koko owns it).
- **Run both listeners in one process** sharing the `SessionRegistry` (see §Topology).

## Architecture

### Topology — one process, two ports, shared state
One asyncio process/loop runs two listeners that share a single in-memory `SessionRegistry`:
- **HTTP `:8080`** — the FastAPI app (extends the Slice 1 app), hosts `/infer`, `/session/start`, `/health`.
- **Media `:8765`** — the existing `websockets`-library server (`server/ws.py`), unchanged transport.

They are co-hosted by running uvicorn programmatically as an awaitable inside the same loop rather than via `uvicorn.run()`:

```python
async def main():
    registry = SessionRegistry()
    app = create_app(ServiceDeps(..., registry=registry))
    uv = uvicorn.Server(uvicorn.Config(app, host="0.0.0.0", port=8080))
    uv.install_signal_handlers = lambda: None          # main() owns shutdown
    ws_deps = ServerDeps(..., registry=registry, reporter=KokoReporter(...))
    ws = await websockets.serve(lambda s: handle(s, ws_deps), "0.0.0.0", 8765)
    await asyncio.gather(uv.serve(), ws.wait_closed())
```

Two internal ports (not one) is deliberate: it preserves the proven `websockets`-library media path (no Starlette rewrite) and matches the Slice 3 port split. Public surface stays single-endpoint because Slice 3's nginx terminates TLS and reverse-proxies both an HTTP path and a WS-upgrade path onto one 443. Two ports ≠ two processes — the shared in-memory registry works because both listeners share one loop.

**Rationale for rejected alternatives:** folding the WebSocket into a FastAPI `@app.websocket` route (one port) was rejected because it forces rewriting `ws.py`'s proven `websockets`-library I/O onto Starlette for no functional gain; an external Redis/DB registry was rejected as YAGNI for a single-droplet, single-session product.

### Components

**`SessionRegistry`** — maps `session_id → SessionContext`; implements the buffer-and-wait correlation.
```python
class SessionRegistry:
    def __init__(self):
        self._ctx: dict[str, SessionContext] = {}
        self._ready: dict[str, asyncio.Event] = {}

    def _event(self, sid):                     # created by whichever side is first
        return self._ready.setdefault(sid, asyncio.Event())

    def put_context(self, sid, ctx):           # POST /session/start
        self._ctx[sid] = ctx
        self._event(sid).set()

    async def wait_context(self, sid, timeout=10.0):   # WS hello
        try:
            await asyncio.wait_for(self._event(sid).wait(), timeout)
        except asyncio.TimeoutError:
            return None                        # WS closes with an error
        return self._ctx.get(sid)

    def drop(self, sid):                       # conclude / cleanup
        self._ctx.pop(sid, None); self._ready.pop(sid, None)
```
Order-independence comes from `setdefault`-creating the `Event`: `/session/start` sets an event the WS later awaits, or the WS awaits an event `put_context` later sets. A **periodic sweep** drops contexts whose WS never connected (start posted, no `hello`) so the registry cannot leak.

**`SessionContext`** — a small dataclass/model holding `patient: PatientContext`, `vitals`, `beacons`, and `session_id`. Built by `/session/start`, consumed by the WS handler to construct the `AgentSession`.

**`KokoReporter`** — outbound HTTP client (httpx.AsyncClient) that POSTs escalation and conclude to koko. Injected as a seam (like the existing `ServerDeps.observer`), so tests inject a fake. Best-effort: a short-timeout POST whose failure is logged and swallowed, never crashing the live session. If `KOKO_BASE_URL` is unset (dev), it degrades to a no-op that only logs, so the live session still runs standalone.

## Contract

### `POST /session/start` (koko → me)
Header `X-Api-Key: <AI_AGENT_API_KEY>` (reuses Slice 1 auth; omit only in dev when unset).
```
Request:  { session_id,
            patient{ patient_id, name, age?, bio_info?, language?,
                     known_conditions[], medications[{name,dose?,schedule?,active}],
                     caregiver{name,phone}?, notes? },
            vitals{ heart_rate?, motion_state?, step_count? }?,
            beacons[{ room, dwell_seconds?, estimated_distance_m? }]? }
Response: 200 { "status": "registered" }
Errors:   401 bad/missing key, 422 malformed body.
```
Idempotent on repeat (re-registering the same `session_id` overwrites). The `patient` block mirrors the Slice 1 `/infer` request exactly. koko owns caregiver info; I retain it only for the live session and never echo it back.

### WebSocket (device ↔ me), `:8765`
Existing `server/ws.py` protocol, with `hello` changed to correlate by `session_id`:
- **Inbound:** `{type:"hello", session_id}` (no longer carries `patient`), `{type:"frame", data_url}`, `{type:"audio", pcm}`, `{type:"bye"}`.
- **Outbound:** `{type:"vision_context",...}`, `{type:"subtitle", text, role:"agent"}`, `{type:"escalation", reason, triggered_by[]}`, `{type:"audio_out", pcm, seq}`, `{type:"audio_error", text}`, and `{type:"error", text}` when correlation fails.

On `hello`, the handler calls `await registry.wait_context(session_id)`. Context present → build `AgentSession` from `ctx.patient`, run the vision + voice loops (early frames/audio buffered by the existing `_QueueSource` queues during the wait). Timeout → send `{type:"error", text:"unknown session"}` and close.

### My server → koko
```
POST {KOKO_BASE_URL}/ai-sessions/{session_id}/escalation
     { reason, triggered_by[] }                          ⚡ real-time, once per session

POST {KOKO_BASE_URL}/ai-sessions/{session_id}/conclude
     { id, patient_id, started_at, ended_at, handoff_at?, handoff_type,
       transcript[{role,text,ts,...}], final_scene_label?, escalated,
       outcome }                                          # SessionRecord JSON + outcome
```
Both carry `Authorization`/`X-Api-Key: <KOKO_API_KEY>`. `outcome ∈ {"patient_ended","disconnected","caregiver_joined"}`.

## Session lifecycle — start, escalation, stop

### Escalation → koko (real-time, edge-triggered)
`VoiceLoop._emit_turn` is the single choke point where escalation surfaces (both live turns via `handle_patient_input` and silence ticks via `on_silence` flow through it). Inject an `on_escalation` async callback into `VoiceLoop` and track a `_reported` bool so the koko POST fires **exactly once**, the instant `session.last_escalation.escalate` first flips true. The existing device-facing `{type:"escalation"}` message is unchanged. (Re-reporting on a *new distinct* reason is a deferred extension; once-per-session is the default.)

### Session stop — three end paths, one conclude
`server/ws.py`'s `finally` currently never calls `session.stop()`; Slice 2 adds the conclude flow. A session ends by:
1. **Deliberate stop — help button pressed again.** Arian's app sends `{type:"bye"}`; `ws.py` breaks the loop. `handoff_type = PATIENT_ENDED`, `outcome = "patient_ended"`.
2. **Abnormal disconnect.** Socket closes without `bye` (network drop, app killed). Still conclude so the transcript is not lost. `outcome = "disconnected"`.
3. **Caregiver joined.** A caregiver-joined signal (future device/koko message) → `handoff_type = CAREGIVER_JOINED`, `outcome = "caregiver_joined"`.

All three route through: `record = session.stop(handoff_type)` → `KokoReporter.conclude(session_id, record, outcome)` → `registry.drop(session_id)`. Transcript is sent only here (Decision 2, end-only).

**New enum value:** add `HandoffType.PATIENT_ENDED = "patient_ended"` in `schemas.py` for the deliberate help-button stop.

## Config & auth
New env vars (documented in README; no `.env.example` per repo convention):
- `KOKO_BASE_URL` — where my server POSTs escalation/conclude callbacks. Unset → `KokoReporter` is a logging no-op (dev).
- `KOKO_API_KEY` — the key my server sends to koko on callbacks (symmetric to koko sending me `AI_AGENT_API_KEY`).

Reused: `AI_AGENT_API_KEY` guards inbound `/session/start` (same as `/infer`).

## Error handling
- Context never arrives (WS first, no `/session/start` within ~10s) → WS closed with `{type:"error"}`.
- koko callback POST fails (escalation or conclude) → logged, swallowed; the live session and the device-facing messages are unaffected (best-effort; the emergency guarantee is that escalation is *attempted* the instant it fires).
- Orphaned context (start posted, WS never connects) → periodic registry sweep drops it.
- Malformed `/session/start` body → `422`; bad/missing key → `401` (reuses Slice 1 behavior).
- Abnormal socket close is not an error — it concludes with `outcome:"disconnected"` so no transcript is lost.

## Testing
- **`SessionRegistry`:** context-first and WS-first arrival both resolve; timeout returns `None`; sweep drops orphans.
- **`POST /session/start`:** registers context; `401` without key; `422` on bad body; idempotent overwrite.
- **WS `hello` correlation:** builds the session from registry context; unknown/timed-out session closes with `error`; frames/audio arriving during the wait are buffered, not dropped.
- **Escalation edge-trigger:** a fake `KokoReporter` receives **exactly one** escalation POST even across multiple escalating turns; payload carries `reason` + `triggered_by`.
- **Conclude paths:** fake reporter receives the `SessionRecord` + correct `outcome` for `bye` (`patient_ended`) and for abrupt disconnect (`disconnected`); `registry.drop` called each time.
- **`KokoReporter` no-op** when `KOKO_BASE_URL` unset (logs, no HTTP).
- **Co-hosting smoke test:** both listeners come up in one process and share one registry instance.

## Dependencies & sequencing
- Depends on Slice 1 (patient-context assembly in koko, extended schema) and Slice 3 (both servers co-located on koko's droplet, distinct ports: koko `:4000`, my WebSocket `:8765`, preview `:8000`, `/infer` + `/session` on `:8080`; TLS/`wss://` for the public media stream via nginx).
- The glasses/audio port into Arian's app is the largest single task and the reason the "merge vs. coordinate the two Android apps" question is central here.

## Out of scope
- Multi-patient / concurrent-session scaling.
- Reconnect/resume of a dropped WebSocket mid-session (robustness follow-up; a drop currently concludes with `outcome:"disconnected"`).
- Live per-turn transcript streaming to koko (deferred; end-only for now).
- Re-reporting escalation on a new distinct reason (deferred; once-per-session for now).
