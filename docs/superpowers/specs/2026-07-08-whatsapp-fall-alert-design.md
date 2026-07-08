# WhatsApp fall alert from the AI server (Slice 2 live session)

**Date:** 2026-07-08
**Status:** Design approved, ready for implementation plan
**Scope:** The voice/vision live-session path (`run_session_server.py` / `server/ws.py`) only.

## Problem

When a live glasses session escalates (a rule-based `EscalationDecision` with
`escalate=true`), the caregiver should get a WhatsApp `caregiver_alert` message. Today:

- The **sender** (`notify/whatsapp.py` `send_template`) already supports N ordered body
  variables — no change needed there.
- The **reference bridge** (`scripts/run_bridge_server.py`) calls `send_template` with
  **zero variables** — a placeholder.
- The **production live-session server** (`scripts/run_session_server.py`) does **not send
  WhatsApp at all**. On escalation it only calls `KokoReporter.escalation()` →
  `POST /ai-sessions/{id}/escalation`.

Decision (2026-07-08): **the AI server sends the WhatsApp on the live-session path.**

## The caregiver template (4 variables)

```
Hello {{1}}, your patient {{2}} is seeking immediate help. We are detecting signs of
{{3}}. View the live conversation with our AI agent and frames from their Meta glasses:
{{4}}. Click above.
```

| Var | Meaning | Example | Source |
| --- | --- | --- | --- |
| `{{1}}` | caregiver name | Anthony | koko's context (see data gap) |
| `{{2}}` | patient name | John | patient context |
| `{{3}}` | situation phrase | "a possible fall and can not get up situation" | AI escalation (code→phrase map) |
| `{{4}}` | live-session URL | https://example.com/session/123 | AI constructs from config |

The `caregiver_alert` template is approved on the **test** WABA (language `en`, **not**
`en_US`); switching to it is setting `WHATSAPP_TEMPLATE=caregiver_alert` and
`WHATSAPP_LANG=en` in the env. Going live on the production (GuardiaNova) WABA additionally
requires re-creating + getting the template approved there (templates do not cross WABAs).

## Data gap to close first

The internal `PatientContext` (`schemas.py`) has **no structured caregiver fields**.
`_to_patient_context` (`service/infer.py:24`) folds the caregiver *name* into free-text
`notes` ("Caregiver on call: <name>.") and **drops the phone entirely**. So the escalation
hook cannot reach a structured caregiver name or phone.

**Fix:** carry caregiver info on `SessionContext` (the per-session object in
`service/session_registry.py`), reusing the existing `CaregiverInfo` schema. It is
populated in `register_session` from koko's `/session/start` body and is already reachable
at the escalation hook via the `ctx` fetched at `server/ws.py:144`. This is additive and
does not touch the core `PatientContext` or the `/infer` text path.

## Components

Each unit is small and testable in isolation.

### 1. `SessionContext.caregiver`
Add an optional `caregiver: CaregiverInfo | None` field to `SessionContext`
(`service/session_registry.py`). Populate it in `register_session`
(`service/session.py`) from `req.patient.caregiver`. Purely additive.

### 2. Situation phrase map (`{{3}}`)
Deterministic `triggered_by` code → caregiver-facing phrase (no LLM, on the escalation hot
path). The real trigger vocabulary from `safety/escalation.py`:

| `triggered_by` code | phrase |
| --- | --- |
| `vision:person_on_floor` | "a possible fall" |
| `vision:fall_detected` | "a fall" |
| `vision:no_motion` | "no movement or possible unresponsiveness" |
| `distress_keyword` | "verbal signs of distress" |
| `silence_with_abnormal_vision` | "no response with concerning surroundings" |

- Multiple triggers are joined into one phrase (e.g. "a possible fall and no movement or
  possible unresponsiveness").
- An unknown/unmapped code falls back to a safe generic: "a possible emergency".
- If `triggered_by` is empty (should not happen when `escalate=true`), use the generic.

### 3. `EscalationNotifier` (`notify/escalation_alert.py`)
Given a `WhatsAppSender` plus config (template, lang, portal base URL, session path,
fallback recipient), exposes:

```
notify(session_id: str, patient_name: str, caregiver: CaregiverInfo | None,
       decision: EscalationDecision) -> None
```

Behavior:
- Builds the ordered variables list:
  - `{{1}}` = `caregiver.name` or `"Caregiver"` fallback
  - `{{2}}` = `patient_name`
  - `{{3}}` = situation phrase from the map (component 2)
  - `{{4}}` = `f"{CAREGIVER_PORTAL_BASE_URL}{CAREGIVER_SESSION_PATH.format(id=session_id)}"`
- Recipient `to` = `caregiver.phone` if present, else `WHATSAPP_TO` (the test number).
- Calls `sender.send_template(to, template, lang, variables=[...])`.
- **Never raises** — logs and swallows failures, matching the existing notify philosophy
  (a notify must not crash the session).
- If the configured template is still `hello_world` (which takes no variables), log a
  warning that the send will be rejected — a safety net, not expected in production.

Built as a standalone unit so the deferred `/infer` text path can reuse it later without
rework.

### 4. Config additions (`config.py`)
- `CAREGIVER_PORTAL_BASE_URL` — e.g. `https://caregiver.guardianova.com` (env override).
- `CAREGIVER_SESSION_PATH` — default `/session/{id}` (env override).
- Reuses existing `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_TO` /
  `WHATSAPP_TEMPLATE` / `WHATSAPP_LANG`.

> **⚠️ {{4}} URL 404 risk.** `CAREGIVER_SESSION_PATH` defaults to `/session/{id}` from the
> example, but the real caregiver-portal route is koko's. **Confirm the exact route with
> koko** before relying on the link — a wrong path yields a 404 in the caregiver's message.

### 5. Wiring
- `scripts/run_session_server.py`: build a `WhatsAppSender` + `EscalationNotifier` **only
  when `WHATSAPP_TOKEN` is set** (dev without a key stays a logged no-op). Inject the
  notifier as a new optional `ServerDeps.notifier`.
- `server/ws.py`: the existing `on_escalation` closure (currently only
  `reporter.escalation(...)`) also calls `notifier.notify(session_id, patient.name,
  ctx.caregiver, decision)` when a notifier is present. Both `patient` and `ctx` (with the
  new caregiver) are already in scope.

## Data flow

```
koko POST /session/start (patient + caregiver)
  -> register_session stores caregiver on SessionContext
device WS hello {session_id}
  -> ws.handle fetches ctx (patient + caregiver) from the registry
live session escalates (rule-based)
  -> voice_loop fires on_escalation ONCE per session (_escalation_reported guard)
     -> reporter.escalation(session_id, decision)        # -> koko (unchanged)
     -> notifier.notify(session_id, patient.name, ctx.caregiver, decision)  # -> WhatsApp
```

## De-duplication

No new throttle needed. `server/voice_loop.py:81` already gates `on_escalation` behind
`self._escalation_reported`, so it fires **exactly once per session** on the rising edge,
regardless of how many ~2s frames keep re-escalating. Hooking the notifier there inherits
that guarantee. (The legacy `ESCALATION_NOTIFY_COOLDOWN` config from the bridge path is
unused here.)

## Error handling

- Notifier swallows and logs all send failures (network, HTTP 4xx/5xx). An alert failure
  never interrupts the live session or the koko report.
- No `WHATSAPP_TOKEN` → no notifier is built; the session runs normally (dev/no-op).
- Missing caregiver phone → falls back to `WHATSAPP_TO`; missing caregiver entirely → `to`
  falls back to `WHATSAPP_TO` and `{{1}}` uses the "Caregiver" default.

## Testing (TDD)

- **Situation map:** each code → expected phrase; multiple triggers joined; unknown code →
  generic fallback; empty `triggered_by` → generic.
- **`EscalationNotifier`:** builds the correct ordered 4-var list; uses `caregiver.phone`
  over `WHATSAPP_TO`; falls back to `WHATSAPP_TO` when no phone; constructs `{{4}}` from
  base + path; swallows a failing sender without raising. Use a fake sender that captures
  the call, mirroring `tests/test_whatsapp.py`'s `_FakePoster`.
- **`register_session`:** caregiver from the request is preserved on `SessionContext`.
- **ws integration:** with a notifier injected, an escalation calls `notify` exactly once
  per session (extend existing ws/session tests); with no notifier, behavior is unchanged.

## Out of scope / open decisions

- **Text (`/infer`) path alerting — deferred.** `/infer` still returns `escalate=true` to
  koko and sends no WhatsApp. Who alerts on the text path (koko vs. reusing this notifier)
  is an open decision to settle with koko. The `EscalationNotifier` is built reusably so
  `/infer` can adopt it later with no rework.
- **Reference bridge** (`run_bridge_server.py`) is left as-is (demo placeholder); it may
  adopt the notifier opportunistically but that is not required by this design.
- Confirming the caregiver-portal route for `{{4}}` (see URL 404 risk above).
