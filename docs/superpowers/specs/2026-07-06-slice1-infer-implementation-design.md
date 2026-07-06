# Slice 1 — `/infer` HTTP Service: Implementation Design

**Date:** 2026-07-06
**Author:** Student 3 (AI agent)
**Status:** Design — awaiting review
**Parent spec:** `2026-07-05-ai-agent-backend-integration-slice1-design.md` (the integration
contract). This document is the **implementation** design for the Python service side only.

## Scope

Build the Python `POST /infer` HTTP service that koko's Node/Express backend calls per
patient message instead of its scripted `determineNextAiMessage()`. Full spec'd Slice 1:
the endpoint, auth, the extended patient context (age/bio/medications), and live
vitals/beacons threaded into the prompt.

**In this repo only.** koko's side (Prisma migration, context assembly, calling `/infer`,
persisting the reply, driving his state machine) is his repo and out of scope here. The
only shared artifact is the `/infer` JSON contract defined in the parent spec.

Not in scope: voice/audio/WebSocket (Slice 2), deployment specifics (Slice 3 — covered by
`deploy/`), koko-side code.

## Architecture

`/infer` is a **stateless** HTTP service. koko owns session state and sends the full
`history[]` each call; the service reconstructs an ephemeral context per request, runs one
brain turn, and returns the decision. Nothing is retained in memory between calls.

```
koko  ──POST /infer (JSON + X-Api-Key)──▶  FastAPI app (service/app.py)
                                              │  auth (service/auth.py) → 401 on mismatch
                                              ▼
                                          run_infer(req, make_brain, monitor)   [service/infer.py]
                                              │  build PatientContext (static) from req.patient
                                              │  make_brain(patient) → AgentBrain (system prompt)
                                              │  build transcript from req.history + latest_message
                                              │  format live context (vitals/beacons) → extra_context
                                              │  monitor.check(latest, vision=None, secs) → EscalationDecision
                                              │  brain.respond(transcript, vision=None, extra_context)
                                              ▼
                                          InferResponse  ──JSON──▶  koko persists + drives state machine
```

**Key structural choice:** `run_infer` calls `AgentBrain.respond()` +
`EscalationMonitor.check()` **directly**, not through `AgentSession`. Rationale:
`AgentSession.handle_patient_input` returns only the reply `Turn` and discards
`decision.handoff_ready` and `decision.intent`, both of which the `/infer` response needs.
`AgentSession` stays reserved for the stateful voice path (Slice 2). `run_infer` re-creates
the session's ~10 lines of escalation OR-logic explicitly.

## Module layout

New package `src/memaide/service/` (HTTP transport, parallel to the WebSocket `server/`):

| File | Responsibility |
|---|---|
| `service/schemas.py` | `InferRequest` / `InferResponse` + nested models. Pure data contract. |
| `service/infer.py` | `run_infer(req, make_brain, monitor) -> InferResponse` — pure, HTTP-free. Unit-tested directly. |
| `service/auth.py` | `X-Api-Key` FastAPI dependency. |
| `service/app.py` | `create_app(deps) -> FastAPI`. Routes: `POST /infer`, `GET /health`. |
| `scripts/run_infer_server.py` | uvicorn entrypoint; builds real `OpenAIClient` + brain factory. Mirrors `run_bridge_server.py`. |

A small `ServiceDeps` dataclass (in `service/app.py` or `service/deps.py`) holds the
injectable seams: `make_brain: Callable[[PatientContext], AgentBrain]`, `monitor` factory,
and `api_key: str | None` — mirroring the existing `ServerDeps` pattern so the app is built
from testable seams.

## Schemas

### `InferRequest` (koko → service)

Mirrors the parent spec contract. Nested models: `SessionInfo`, `InferPatient`,
`CaregiverInfo`, `MedicationInput`, `Vitals`, `BeaconEvent`, `HistoryItem`. **Every
live/profile field is optional/nullable** so the pipe works before a patient's profile is
filled in. `vision` is always `null` on the text path (Slice 2 populates it). Fields:
`session`, `patient`, `vitals?`, `beacons_triggered[]`, `vision?`, `history[]`,
`latest_message`, `seconds_since_last_speech` (always 0 on the text path).

`HistoryItem.role` is one of `system | ai | patient | event`, mapped to internal `Role`:
`ai → AGENT`, `patient → PATIENT`, `system → SYSTEM`, `event → SYSTEM` (events become
system-context lines).

### `InferResponse` (service → koko)

```jsonc
{
  "reply_text": "…",
  "escalate": false,
  "escalation": { "reason": "", "triggered_by": [] },
  "handoff_ready": false,
  "intent": "assist"
}
```

### `PatientContext` extension (`schemas.py`)

Add to the existing model, all defaulted so no current caller/test breaks:
- `age: int | None = None`
- `bio_info: str | None = None`
- `medications: list[Medication] = Field(default_factory=list)`

New small model `Medication(name: str, dose: str | None = None, schedule: str | None =
None, active: bool = True)`. `known_conditions`, `preferred_name`, `language`, `notes`
already exist and are reused.

## Prompt threading

- **Static profile** (age, bio_info, known_conditions, medications, caregiver) →
  `build_system_prompt(patient)` in `prompts/system_prompt.py`. Stable for the session, so
  it belongs in the system prompt. Rendered only when present (a patient with no meds adds
  no medication section).
- **Live context** (vitals, beacons) → injected per-turn. Add one optional parameter to the
  brain: `AgentBrain.respond(transcript, vision=None, extra_context: list[str] | None =
  None)`, and `_build_messages` appends each `extra_context` string as a `system` message
  after the transcript — symmetric with how `vision` is injected today. Default `None`
  preserves current behavior (backward-compatible; no existing caller changes).
  `run_infer` formats vitals → `"[VITALS] heart_rate=82, motion=still, steps=1203 (as of …)"`
  and each beacon → `"[LOCATION] bathroom for 240s, ~1.2m (entered …)"`.

## Response mapping, auth, errors

### Mapping (matches `AgentSession` semantics)

- `reply_text` ← `decision.reply_text` (already `strip_foreign_text`-cleaned in the brain).
- `escalate` ← `rule.escalate OR decision.wants_escalation`.
- `escalation.reason` / `triggered_by` ← the rule `EscalationDecision`. **If escalation is
  LLM-only** (rule monitor did not fire but `wants_escalation` is true), set
  `reason = "agent_requested"`, `triggered_by = ["agent"]` so the field is never blank.
- **Emergency suffix:** when `escalate` and `config.EMERGENCY_SUGGESTION` is not already in
  `reply_text`, append it — exactly as `AgentSession.handle_patient_input` does, for parity
  with the voice path. koko may present or ignore it; the AI's text is self-consistent.
- `handoff_ready` ← `decision.handoff_ready`. `intent` ← `decision.intent`.

### Auth

`X-Api-Key` header compared against a new `config.AI_AGENT_API_KEY` (from env). Behavior:
- **Key set** → enforced; mismatch or missing header → `401`.
- **Key unset** → auth disabled with a loud startup + per-request warning log (local-dev
  convenience). Production deploy sets `AI_AGENT_API_KEY`; the deploy README documents it as
  required.

### Errors (koko falls back to its script on any non-2xx, so each just needs non-2xx + a log)

- Malformed / schema-invalid body → `422` (automatic from Pydantic validation).
- Bad/missing key when enforced → `401`.
- Brain / OpenAI failure (exception in `respond`) → caught → `502` with a small
  `{"detail": …}` body; full error logged server-side.
- koko owns its own client-side timeout (~3s) and fallback; the service does not self-time
  the request beyond `OpenAIClient`'s existing timeout.

`GET /health` returns `200 {"status":"ok"}` with no auth and no LLM call — for the droplet /
uptime checks.

## Dependencies & entrypoint

- New optional extra in `pyproject.toml`:
  `service = ["fastapi>=0.110", "uvicorn[standard]>=0.29"]`. Keeps the core package slim for
  package-only reusers; the droplet installs `pip install -e ".[service]"`.
- Dev extra gains `httpx` (FastAPI's `TestClient` needs it).
- New config: `AI_AGENT_API_KEY = os.environ.get("AI_AGENT_API_KEY")`,
  `INFER_HOST = "0.0.0.0"`, `INFER_PORT = 8080` (per the handoff's port map).
- `scripts/run_infer_server.py`: builds `OpenAIClient`, a `make_brain = lambda patient:
  AgentBrain(client, patient)` factory, and runs uvicorn on `INFER_HOST`/`INFER_PORT`.
  Fails fast with a clear message if `OPENAI_API_KEY` is unset (like the bridge server).
- `deploy/`: add a second `systemd` unit `memaide-infer.service` (port 8080) and note both
  services + the `.[service]` install in `deploy/README.md`. (Deployment is Slice 3, but the
  unit file is cheap to add alongside the existing bridge unit.)

## Testing

- **`run_infer` (pure, no HTTP)** with a stub brain that records the `messages` /
  `extra_context` it receives (like `StubTextToSpeech`): assert request parsing; static
  profile lands in the system prompt and live context lands as trailing system messages;
  escalation OR-ing (rule-only, LLM-only, both, neither); `agent_requested` fallback;
  emergency-suffix append; and full response-field mapping.
- **HTTP layer** via FastAPI `TestClient`: `401` gate (bad key / missing header when
  enforced; and disabled-when-unset path), `422` on malformed body, `502` on brain
  exception, `200` happy path, `GET /health` → `200`.
- **Prompt** — `build_system_prompt` includes age/bio/conditions/medications when present
  and omits their sections when absent.
- All new code follows the existing test style in `tests/`; target parity with the current
  suite (no regressions).

## Deferred / follow-ups

- Voice/vision path (Slice 2) and real deployment wiring (Slice 3).
- Time-based escalation (silence ticks) — meaningful only on the live voice path, so
  `seconds_since_last_speech` is always 0 here.
- koko-side changes (his repo): Prisma migration, context assembly, `/infer` call + fallback,
  response persistence — tracked in the parent spec.
