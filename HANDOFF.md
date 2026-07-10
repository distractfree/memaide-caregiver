# MemAide — Handoff to the Backend / Apps Team

**Snapshot:** tag `v0.1.0` on `main`; active integration on `anthony/student3-work`.
**Slice 1 (`/infer` text path) is complete on my side** — the stateless HTTP service is built, tested,
and deployable; koko's Prisma migration + call-site swap are the remaining Slice-1 work (his side).
Next up is **Slice 2 (voice/vision live session)**; its two open decisions (§0) must be settled first.

This repo is the **standalone MemAide AI agent foundation** (the `memaide` Python package) plus a
reference WebSocket media server and an Android bridge used to prove it end-to-end on real Ray-Ban
glasses. Student 2 (koko) has the backend + caregiver portal, Student 1 (Arian) has the phone + watch
apps, and this is Student 3's AI.

**Integration decision (2026-07-05): my AI runs as its own service, not as code you embed.** koko's
server is Node and this agent is Python, so rather than porting one into the other, both run as
separate processes **co-located on koko's DigitalOcean droplet** and talk over the network. koko's
scripted `ai-sessions` AI (`determineNextAiMessage`) is the placeholder my agent replaces. See the
integration plan below and the specs in `docs/superpowers/specs/2026-07-05-*`. The Android bridge here
is **not throwaway** — it is the reference implementation of the glasses/audio pipeline Arian's app
must gain (see §5 and the Slice 2 spec).

---

## Current status — 2026-07-10 (live audio bring-up)

Slice 2 is deployed (`memaide-session` on the droplet) and the **live audio loop now works
end-to-end from the phone**. This session's changes:

**Server (`anthony/student3-work`; redeploy = `git pull` + `systemctl restart memaide-session`):**
- Live STT/TTS fix: `OpenAIClient` now exposes `.audio` — the live path was throwing
  `'OpenAIClient' object has no attribute 'audio'` (unit tests used SDK-shaped fakes, so it
  never showed). Commit `f761e09`.
- Per-utterance endpointing: inbound `{"type":"audio_end"}` segments utterances; STT WAV-wraps
  the PCM (was headerless → OpenAI rejected it). Commit `ba450d6`.
- Agent greets on connect (`VoiceLoop.greet()` → `OPENING_LINE`). Commit `4cb71b5`.
- Removed the system-prompt `OPENING` instruction so the LLM doesn't double-greet (the
  hardcoded greeting is the opener). Commit `5401758`.
- 205 pytest pass.

**Client (Android):**
- `arian/student1-work` — audio pipeline (watch→phone→WS) + `audio_end` VAD markers (`1dd4840`).
- `anthony/phone-mic` — **phone-mic test path (no watch needed):** Help screen
  "🎤 Talk to AI (phone mic)" → `PhoneVoiceSession` streams the phone mic and plays `audio_out`.
  Builds.
- `anthony/glasses-video` — Meta Wearables DAT glasses camera → `{type:frame,data_url}` video
  leg as an isolated **minSdk-29 `:glasses` module** (app stays 26 via `tools:overrideLibrary`).
  **Builds into an APK** (verified via CLI `./gradlew :app:assembleDebug`); runtime/pairing
  untested. Needs `github_token` + `mwdat_application_id` + `mwdat_client_token` in
  `local.properties`. Consistent with §5: DAT camera is I420 (the port's `FrameEncoder` already
  assumes I420), and there is **no glasses mic** in mwdat 0.8.0 (audio stays phone/watch-sourced).

**Next up (starting in a new chat):**
1. **Debounced turn-taking** — the crude energy VAD splits one sentence into 2–3 replies.
   Design approved: `docs/superpowers/specs/2026-07-10-debounced-turn-taking-design.md`. Next
   step is `writing-plans` → implement (server `VoiceLoop` pending-buffer + `commit` message;
   client two-threshold `SpeechEndpointer`).
2. **Vision designs** — the glasses video leg builds; design + enable the live-session vision
   path end-to-end (frames → `VisionDescriber`/real `VisionCheck` → vision-driven escalation).
   Prior context: `docs/superpowers/specs/2026-07-01-glasses-vision-trace-and-whatsapp-design.md`.

Worktrees in play: `memaide-fix` (student3-work), `memaide-phonemic`, `memaide-glasses`,
`memaide-arian`. The main repo folder is parked on `arian/student1-work` and needs cleanup back
to `anthony/student3-work` (careful: untracked `.env` + Python files there).

---

## 0. Integration plan (current)

Full design in `docs/superpowers/specs/`:
- `2026-07-05-ai-agent-backend-integration-slice1-design.md`
- `2026-07-05-slice2-voice-vision-client-design.md`

**Architecture:** three services, koko's DB is the single source of truth throughout.
- **koko (Node/Prisma, `:4000`)** — DB + caregiver web portal; owns sessions, patients, persistence.
- **my AI (Python)** — the brain; runs on the same droplet, called by koko. `/infer` (text) on e.g.
  `:8080`, WebSocket media on `:8765`. Calls hosted LLM/STT/TTS APIs, so it is lightweight (no GPU).
- **Arian (Android + Wear)** — patient front-end; today a pure REST client of koko.

**Three slices, built in order:**
1. **Slice 1 — backend bridge (text path). ✅ My side DONE.** koko assembles patient context from its
   DB and `POST`s my stateless `/infer` endpoint per message instead of running the script; koko
   persists the reply and drives its state machine, falling back to the script if my service is down.
   No Android.
   - **Shipped (this repo):** `src/memaide/service/` (`schemas.py`, `infer.py`, `auth.py`, `app.py`) —
     a FastAPI `POST /infer` (+ `GET /health`) that rebuilds an ephemeral `PatientContext` + transcript
     per call, runs one `AgentBrain.respond()` turn, ORs in the rule-based `EscalationMonitor`, and maps
     to a reply + escalation decision. `X-Api-Key` auth (disabled when `AI_AGENT_API_KEY` unset).
     Entry point `scripts/run_infer_server.py`; systemd unit `deploy/memaide-infer.service` (port 8080).
     Plan: `docs/superpowers/plans/2026-07-06-slice1-infer-service.md`.
   - **Remaining (koko's side):** the Prisma migration (add `dateOfBirth`/`bioInfo`/`conditions[]` +
     a `Medication` model, seeded) and swapping `determineNextAiMessage` to call `/infer`.
2. **Slice 2 — voice/vision live session.** Control inverts: my server owns the live WebSocket session
   and reports events back to koko. koko forwards vitals/beacons + context at start; my server POSTs
   escalation **in real time** and transcript/summary on conclude. Requires porting the glasses/audio
   pipeline (§5) from the bridge app into Arian's app + a "listening" UI. Two open decisions: the
   WebSocket↔context **correlation key/ordering**, and **live transcript streaming vs. end-only**.
3. **Slice 3 — deployment.** Both servers on koko's droplet, distinct ports (koko `:4000`, WebSocket
   `:8765`, preview `:8000`, `/infer`/`/session` e.g. `:8080`), run as persistent services; `wss://`
   for the public media stream.

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
| `src/memaide/service/` + `scripts/run_infer_server.py` | ✅ **Core (Slice 1)** | The `POST /infer` HTTP service koko calls per message — the text-path brain. |
| `src/memaide/server/` + `scripts/run_bridge_server.py` | ⚠️ **Reference** | Shows how to wire the agent to a live frame/audio stream (you likely use your own server). |
| `android/` | ⚠️ **Learnings only** | You have real apps; take the device notes in §5, not the code. |
| `docs/superpowers/specs/`, `README.md` | ✅ | Design context + the "Integration notes" section. |
| `tests/` | ✅ (optional) | 158 pytest tests documenting expected behavior (incl. the `/infer` service). |

Export just the transferable parts:
```bash
git archive v0.1.0 src/memaide docs README.md HANDOFF.md -o memaide-handoff-v0.1.0.zip
```

---

## 2. The integration seam (backend)

Under the service model (§0), **my Python service** hosts the agent and koko calls it over HTTP/
WebSocket — koko does **not** embed this code. The snippet below is how my service uses the core
internally (one `AgentSession` per Help-button session); it also documents the entry points for
anyone reusing the package directly:

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

### Slice 1 `/infer` HTTP contract (what koko calls today)

`POST /infer` — header `X-Api-Key: <AI_AGENT_API_KEY>` (omit only in dev, when the key is unset).
Stateless: koko sends the full context every call; my service retains nothing.

- **Request:** `{ session{session_id,...}, patient{patient_id,name,age?,bio_info?,language?,`
  `known_conditions[],medications[{name,dose?,schedule?,active}],caregiver{name,phone}?,notes?},`
  `vitals{heart_rate?,motion_state?,step_count?}?, beacons_triggered[{room,dwell_seconds?,`
  `estimated_distance_m?}], history[{role,text}], latest_message, seconds_since_last_speech }`.
  Roles in `history`: `ai` / `patient` / `system`.
- **Response:** `{ reply_text, escalate, escalation{reason,triggered_by[]}, handoff_ready, intent }`.
  Escalation is OR-ed (rule-based monitor OR the brain); on escalate, `reply_text` gets the emergency
  suggestion appended. koko persists `reply_text` and drives its state machine off `escalate`.
- **Errors:** `401` bad/missing key, `422` malformed body, `502` upstream/brain failure → koko should
  fall back to its script on `502`. `GET /health` → `{"status":"ok"}`.

Schemas are the source of truth: `src/memaide/service/schemas.py` (`InferRequest` / `InferResponse`).

## 3. What you must provide

> **⚠️ TODO — production secrets not yet set.** The droplet (`67.205.153.42`) is currently
> running on dev/test credentials. Before any real (non-demo) use, replace with
> **production-level keys and config**:
> - `OPENAI_API_KEY` — a production OpenAI key with appropriate rate/spend limits (not a
>   personal dev key).
> - `AI_AGENT_API_KEY` / `KOKO_API_KEY` — real shared secrets, rotated, matching koko's
>   side. These now cross the public internet (koko is a **separate droplet**,
>   `134.122.115.15:4000`), so they are mandatory, not optional.
> - **WhatsApp caregiver alerts** — `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
>   `WHATSAPP_TO`, plus an **approved** `WHATSAPP_TEMPLATE=caregiver_alert` (`WHATSAPP_LANG=en`) (currently the
>   placeholder `hello_world`). Provisioned from Meta's WhatsApp Cloud API dashboard; left
>   commented-out in `/etc/memaide/memaide.env` until real credentials exist.
> - **TLS** — move the public media WS + `/infer` behind `wss://`/`https://` with a real
>   domain + Let's Encrypt cert before handling patient data (see deploy README §8).

### TLS + domain checklist (do before real patient data / before exposing the device WS)

Today everything is plaintext `http://`/`ws://`. Patient audio+video and health
conversations must not cross the public internet unencrypted, and browsers/mobile refuse
insecure `ws://` to non-localhost anyway. To fix, in order:

1. **Register a domain** (any registrar), e.g. `memaide.<something>`.
2. **DNS A record** → point that name at `67.205.153.42`. Confirm with `dig +short <domain>`.
3. **Install nginx config**: `cp deploy/nginx-memaide.conf /etc/nginx/sites-available/memaide`,
   symlink into `sites-enabled`, replace `YOUR_DOMAIN`, then `nginx -t && systemctl reload nginx`.
4. **Issue the cert**: `apt install -y certbot python3-certbot-nginx` then
   `certbot --nginx -d <domain>` (auto-fills the `:443` + cert lines).
5. **Firewall**: `ufw allow 'Nginx Full'` (80+443); then **close the raw device port** —
   `ufw delete allow 8765` — since the media WS now arrives via `wss://<domain>/` on 443.
6. **Point Arian's app** at `wss://<domain>/` (not `ws://IP:8765`) and drop the
   `usesCleartextTraffic` flag.

Interim (dev/test only): the raw `ws://67.205.153.42:8765` path is opened in `ufw` **scoped
to Arian's current test IP** (`ufw allow from <arian_ip> to any port 8765`) so his Android app
can connect before TLS exists (Android needs `android:usesCleartextTraffic="true"`). Note this
pins access to one network — if Arian's IP changes (mobile data / ISP rotation) the rule must
be re-run with the new IP. This is a **temporary** measure — replace with `wss://` per the
checklist above (and `ufw delete` the 8765 rule) before real use.

- **`OPENAI_API_KEY`** (brain + vision describer). For live-session caregiver alerts, set
  `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_TO`, `WHATSAPP_TEMPLATE=caregiver_alert`
  + `WHATSAPP_LANG=en` (4-var template: caregiver, patient, situation, session link), and
  `CAREGIVER_PORTAL_BASE_URL` (+ `CAREGIVER_SESSION_PATH` if koko's route differs from
  `/session/{id}`). Documented in the README — no `.env.example`.
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
