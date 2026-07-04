# MemAide — Handoff to the Backend / Apps Team

**Snapshot:** tag `v0.1.0` on `main`. One-time handoff — copy what you need and own it.

This repo is the **standalone MemAide AI agent foundation** (the `memaide` Python package) plus a
reference WebSocket media server and a throwaway Android bridge used to prove it end-to-end on real
Ray-Ban glasses. You already have a backend, server, and full Android + watch apps, so the thing to
take is the **AI agent core**; the server and Android bits are **reference material**, not code to
adopt wholesale.

---

## 1. What to take (and what to ignore)

| Path | Take it? | Why |
| --- | --- | --- |
| `src/memaide/agent/` (`brain.py`, `session.py`) | ✅ **Core** | The conversation brain + per-session orchestration. |
| `src/memaide/prompts/` | ✅ **Core** | System prompt + few-shot that tune the brain. |
| `src/memaide/vision/` (`describer.py`, `pipeline.py`, `rule_check.py`, `frame_source.py`) | ✅ **Core** | Frame → `VisionContext` (description/label/flags). |
| `src/memaide/safety/` (`escalation.py`, `language_filter.py`) | ✅ **Core** | LLM-independent, rule-based escalation. |
| `src/memaide/notify/whatsapp.py` | ✅ **Core** | WhatsApp Cloud API alert sender (templates + variables). |
| `src/memaide/schemas.py`, `config.py`, `io/openai_client.py` | ✅ **Core** | Data contracts, config, the async OpenAI wrapper. |
| `src/memaide/server/` + `scripts/run_bridge_server.py` | ⚠️ **Reference** | Shows how to wire the agent to a live frame/audio stream (you likely use your own server). |
| `android/` | ⚠️ **Learnings only** | You have real apps; take the device notes in §5, not the code. |
| `docs/superpowers/specs/`, `README.md` | ✅ | Design context + the "Integration notes" section. |
| `tests/` | ✅ (optional) | 124 pytest tests documenting expected behavior. |

Export just the transferable parts:
```bash
git archive v0.1.0 src/memaide docs README.md HANDOFF.md -o memaide-handoff-v0.1.0.zip
```

---

## 2. The integration seam (backend)

Your backend hosts the agent. One `AgentSession` per Help-button session:

```python
from memaide.agent.session import AgentSession
from memaide.agent.brain import AgentBrain
from memaide.io.openai_client import OpenAIClient
from memaide.schemas import PatientContext, HandoffType, VisionContext

patient = PatientContext(patient_id="p1", name="Rose", known_conditions=[...])
brain = AgentBrain(OpenAIClient(), patient)          # needs OPENAI_API_KEY
session = AgentSession(brain=brain, patient=patient, session_id="…")

session.start()                                       # agent speaks the opening line
turn = await session.handle_patient_input(            # per patient utterance
    text, vision=latest_vision_context, seconds_since_last_speech=secs)
# turn.text -> speak/subtitle; session.last_escalation -> escalation decision
record = session.stop(HandoffType.CAREGIVER_JOINED)   # -> SessionRecord to persist
```

Key entry points:
- **`AgentSession`** — `start()`, `handle_patient_input(text, vision=?, seconds_since_last_speech=?)`,
  `on_silence_tick(seconds, vision=?)` (fires escalation without speech), `stop(handoff_type)`.
- **`VisionDescriber.describe(frame_data_url) -> VisionContext`** — frame is a base64 `data:` URL.
- **`EscalationMonitor.check(text, vision, seconds) -> EscalationDecision`** — rule-based, no LLM.
- **`WhatsAppSender.send_template(to, template, lang, variables=[...])`** — caregiver alert.

## 3. What you must provide

- **`OPENAI_API_KEY`** (brain + vision describer). Optional `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID`
  / `WHATSAPP_TO` / `WHATSAPP_TEMPLATE` for alerts (documented in the README — no `.env.example`).
- **A real `VisionCheck`** (`src/memaide/vision/rule_check.py`) — the default `StubVisionCheck` returns
  no flags. Your CV pipeline implements `check(frame) -> list[str]` to populate the rule-based `flags`
  that drive deterministic escalation (`person_on_floor`, `fall_detected`, `no_motion`). **Note:** the
  describer's `advisory_flags` are LLM guesses kept *separate* from `flags` so a hallucinated flag can't
  trigger an escalation.
- **Your transport.** See §4 for the wire contract the reference server/app already speak.

## 4. WebSocket contract (reference server ↔ device)

If you reuse the wire format instead of the code, `src/memaide/server/ws.py` speaks:

- **Inbound (device → server):** `{"type":"hello","session_id":…,"patient":{…}}`,
  `{"type":"frame","data_url":"data:image/jpeg;base64,…"}`,
  `{"type":"audio","pcm":"<base64 PCM16>"}`, `{"type":"bye"}`.
- **Outbound (server → device):** `{"type":"vision_context","description","label","advisory_flags","ts"}`,
  `{"type":"subtitle","text","role":"agent"}`,
  `{"type":"escalation","reason","triggered_by":[…]}`,
  `{"type":"audio_out","pcm":"<base64 PCM16>","seq"}`, `{"type":"audio_error","text"}`.

Rates: server speaks PCM16 @ 24 kHz. Vision is throttled to one described frame every
`VISION_INTERVAL_SECONDS` (2s); the full frame stream can be recorded via `FileSessionRecorder`.

## 5. Device-integration learnings (for the apps team)

Proven on a Pixel 7a + real Ray-Ban glasses via the Meta **Wearables Device Access Toolkit (mwdat 0.8.0)**.
These cost real debugging time — worth folding into your apps:

- **Camera stream is uncompressed I420 planar** (Y | U plane | V plane), 360×640, tightly packed (no
  stride). Not NV21/NV12 — decoding it as NV21 gives a purple/green tint. Convert I420→NV21 (interleave
  V,U after the Y plane) before `YuvImage`, or feed I420 straight into your own JPEG/encode path.
- **DAT camera needs a *Wearables* permission**, separate from Android's `CAMERA`: request via
  `Wearables.RequestPermissionContract` with `Permission.CAMERA`; the **Meta AI app** shows the Allow
  dialog. Until granted, the glasses report `registeredSNApps:[]` / `cameraState:NO_STATE` and never
  stream (with no error — the session just never reaches `STARTED`).
- **`Wearables.initialize` throws if called twice** — guard/tolerate "already initialized" if both an
  Activity and a service init it.
- **Android manifest gotchas:** an `AppCompat` theme is required (else AppCompatActivity crashes on
  `setContentView`); camera foreground service needs `FOREGROUND_SERVICE_CAMERA` (SecurityException on
  Android 14+); `ws://` needs `android:usesCleartextTraffic="true"` (OkHttp blocks cleartext by default).
- **Enable Developer Mode inside the Meta AI app**: Settings → App Info → tap the app version 5×.
- **No glasses microphone via this SDK.** The Ray-Bans don't expose an HFP/SCO mic to third-party apps
  (`hfpConnected=false`), so Bluetooth-SCO capture falls back to the *phone* mic. **mwdat 0.8.0 ships no
  audio API** (zero audio classes in the AAR) — glasses-mic audio isn't capturable until Meta releases
  DAT audio. The transport (mic → server) is proven; only the glasses-as-source is blocked.

## 6. Repo conventions

- No self-attribution in git commits/PRs.
- No `.env.example` — env vars are documented in the README.
