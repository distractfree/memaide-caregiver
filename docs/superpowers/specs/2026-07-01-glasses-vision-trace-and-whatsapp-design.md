# MemAide — Glasses Vision Trace + WhatsApp Notify (2026-07-01)

## TL;DR
Two independent, small features that turn the now-integrated Meta glasses bridge into
something testable end-to-end:

- **Part A — Glasses vision trace.** Stream real Ray-Ban frames from the phone to the existing
  WS server and watch, on the laptop console, what the vision model makes of each frame and what
  it would send to the brain (vision context + escalation + the brain's proactive reaction).
- **Part B — WhatsApp notify.** A server-side WhatsApp Cloud API sender, built and tested
  standalone (send a message to a number), then wired so an escalation fires a WhatsApp alert.

The two are separable; **build Part A first**, then Part B. Both share one "run the server and
watch" harness.

## Goals
- See real-time glasses frames reach the vision model and print the derived `VisionContext`
  (`description`, `label`, `flags`) — literally "what gets sent to the brain".
- Print the brain's reaction + escalation decision when a frame escalates.
- Send a WhatsApp message to a phone number from the server, and have an escalation trigger one.

## Non-goals (YAGNI for this iteration)
- **No audio path.** The vision test is frames-only; the mic/speaker (`AudioEngine`) is not
  exercised. The server's `VoiceLoop` simply idles with no audio.
- **No full debug UI** (the Task-12 status panel). The phone gets only a minimal launcher.
- **No brain commentary on every frame.** The brain reaction is printed only when a frame
  escalates (the proactive-suggestion path); non-escalating frames log vision only.
- No phone-side display of the vision output — it's watched on the laptop.

## Decisions locked in brainstorming (2026-07-01)
1. WhatsApp send originates **server-side via the Meta WhatsApp Cloud API** (Graph API), not a
   phone `wa.me` intent and not Twilio.
2. The vision test shows a **vision + brain trace on the laptop console**.
3. WhatsApp is **built standalone first, then wired** to escalation.
4. **Frames-only**, and **brain reaction only on escalate** (confirmed with the user).

---

## Part A — Glasses → vision model → brain trace

### Data flow
```
Ray-Bans ──(Meta DAT SDK)──▶ phone (minimal app, frames-only)
   │
   └─ GlassesFrameSource ▶ FrameEncoder ▶ BridgeSocket ──ws──▶ MemAide WS server
                                                                  │
                                          VisionPipeline.describe() (every 2s)
                                                                  │
                                        ┌─────────────────────────┴───────────────┐
                                        ▼                                          ▼
                              existing sink                               NEW: VisionObserver
                       (store latest scene +                     (log [vision]; run escalation;
                        echo vision_context to client)            on escalate → [brain]+[escalation]
                                                                  + Part B WhatsApp notify)
```

### Server changes
- **New `VisionObserver` seam**, injected via `ServerDeps` (default `None` → no behavior change,
  existing tests untouched). It is invoked once per **described** frame (i.e. after the pipeline's
  interval throttle), receiving the `VisionContext` for that frame. On each call it:
  - logs `[vision] desc=… label=… flags=…`;
  - runs the existing `EscalationMonitor.check(latest_patient_text=None, vision=ctx, …)`;
  - when the decision escalates, asks the `AgentSession` for its proactive suggestion (the same
    path `VoiceLoop.on_silence` uses) and logs `[brain] reaction="…"` and
    `[escalation] TRIGGERED by […]`; then (Part B) calls the notifier with a per-episode cooldown.
  - The observer is wired in `ws.py`'s `sink` (call the observer after storing the scene) or as a
    parallel call in `handle()`; it must never raise into the connection (log-and-swallow), matching
    the recorder's error policy.
- **New run entrypoint `scripts/run_bridge_server.py`**: builds `ServerDeps` with the **real**
  describer + brain + `FileSessionRecorder`, attaches a console-logging `VisionObserver` (and, once
  Part B lands, the `WhatsAppSender`), binds `config.WS_HOST=0.0.0.0:8765`, and runs `serve()`.
  Prints the trace to stdout.

### Phone changes (minimal)
- **`MainActivity`** (`ui/MainActivity.kt`) — one screen: a server-URL field
  (default `ws://<laptop-LAN-IP>:8765`), a **Register glasses** button (`Wearables.startRegistration`),
  a **Start/Stop** button, and runtime permission requests for **CAMERA + BLUETOOTH_CONNECT**
  (no RECORD_AUDIO — frames-only). Reflects `MediaBridgeService.uiState` minimally (a status line).
- **`MediaBridgeService` frames-only flag** — add `EXTRA_AUDIO_ENABLED` (default true). When false,
  the service skips constructing/starting `AudioEngine` and the mic/audio-sender coroutines; it only
  runs the frame producer + sender + inbound (audio-out ignored when audio disabled). Reuses the
  existing `GlassesFrameSource`, `FrameEncoder`, `BridgeSocket`.
- The `AndroidManifest` already declares `.ui.MainActivity`; no manifest change needed beyond what
  exists.

---

## Part B — WhatsApp notify (Cloud API)

### Module
- **`src/memaide/notify/whatsapp.py`** — `WhatsAppSender`:
  - `send_text(to_number: str, text: str) -> bool` → `POST https://graph.facebook.com/v22.0/
    <PHONE_NUMBER_ID>/messages` with `Authorization: Bearer <token>`, body
    `{"messaging_product":"whatsapp","to":<number>,"type":"text","text":{"body":<text>}}`.
  - `send_template(to_number: str, template: str, lang: str = "en_US") -> bool` → same endpoint,
    `type=template` body (for first-contact outside the 24h window, e.g. `hello_world`).
  - Returns success/failure; logs and swallows HTTP errors (never crashes a caller). HTTP client
    injected for testability (default a thin `requests`/`httpx` wrapper).
- **Config** (env, read in `config.py`; documented in README, **no `.env.example`**):
  `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TO` (caregiver number),
  optional `WHATSAPP_TEMPLATE` (default `hello_world`).

### WhatsApp platform constraint (call out in README)
Meta only allows free-form `send_text` within **24h** of the recipient last messaging the business
number. Otherwise the first contact must be an **approved template** (`send_template`). For testing:
either message the business number from the recipient phone first (then `send_text` works), or send
the template.

### Standalone test path (before wiring)
- Unit test: `WhatsAppSender` with a mocked HTTP client — asserts URL, headers (bearer), and JSON
  payload for both `send_text` and `send_template`; asserts errors are swallowed and reported false.
- Manual: `scripts/send_whatsapp.py --to <number> --text "…"` (or `--template hello_world`) for a
  real send using the env config.

### Wiring into escalation
- The `VisionObserver` holds an optional `notifier`. On escalate it calls
  `notifier.send_text(WHATSAPP_TO, f"MemAide alert: {decision.reason}")` (or the template when first
  contact), guarded by a **cooldown** (e.g. no more than one message per `ESCALATION_NOTIFY_COOLDOWN`
  seconds, default 60) so a persistent condition doesn't send a WhatsApp on every 2s frame.
- Unit test: observer with a fake notifier — escalating frames call the notifier once, respect the
  cooldown, and non-escalating frames never call it.

---

## Components & interfaces (new)
- `VisionObserver` (server, Python): `async on_scene(ctx: VisionContext, session, escalation_monitor)`
  → logs trace, may call notifier. Pure/injected deps; never raises into the connection.
- `WhatsAppSender` (server, Python): `send_text(to, text) -> bool`, `send_template(to, template, lang)
  -> bool`. Injected HTTP client.
- `MainActivity` (Android): minimal launcher; owns Wearables init/registration + Start/Stop.
- `MediaBridgeService` (Android, modified): `EXTRA_AUDIO_ENABLED` flag gating the audio path.
- `scripts/run_bridge_server.py`, `scripts/send_whatsapp.py` (entrypoints).

## Testing summary
- Pure-Python unit tests for `VisionObserver` (trace + notify + cooldown) and `WhatsAppSender`
  (mocked HTTP) — no network, no device.
- Manual end-to-end: run `scripts/run_bridge_server.py`; on the phone (same WiFi) register the
  glasses, point at `ws://<laptop-ip>:8765`, Start; watch the laptop trace; present an escalation
  scene (e.g. a person on the floor / a critical flag) and confirm the WhatsApp fires once.

## Open items / prerequisites (user-supplied, not committed)
- WhatsApp Cloud API: a Meta WhatsApp Business number + `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`
  (may reuse the existing Meta app), and a recipient/caregiver number.
- Glasses Developer Mode enabled; app registered via `MainActivity` before streaming.
- The `compressVideo=false`/NV21 assumption and the SCO rate from Task 11 remain to be confirmed on
  device (audio is not exercised here, so SCO is moot for Part A).

## Repo conventions (unchanged)
- **No self-attribution in git.**
- **No `.env.example`** — document env vars in the README.
