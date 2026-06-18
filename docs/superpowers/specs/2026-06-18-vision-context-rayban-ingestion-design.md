# Vision + Voice Live-Media Layer (Ray-Ban Meta) — Design (M2)

Date: 2026-06-18
Status: Approved (brainstorming)
Branch: `feat/agent-foundation-m1`

## Summary

The Milestone 2 live-media layer. Two media streams from the Ray-Ban Meta glasses (POV
camera + microphone) flow over a WebSocket into the existing text brain and back out as
spoken replies:

- **Vision:** frames → `VisionDescriber` (model + image-detail configurable) → `VisionContext`
  (scene description + label + advisory flags), produced on an interval and kept as the
  "latest scene" for the brain.
- **Voice:** patient audio → **streaming STT** → text → existing `AgentBrain` (the *only*
  inference) → reply text → **batch TTS** → spoken audio + on-screen subtitle.

The audio models are pure converters — no reasoning happens in STT or TTS; all judgment
stays in the text brain and the rule-based safety monitor. This adds the frame
**describer**, a pluggable frame **source** seam, a reusable vision **pipeline**, **STT**
and **TTS** converters, a thin **WebSocket server** carrying both media streams, the
**live `AgentSession` loop** that ties them together, and a **vision-describer eval**
(gpt-4o-mini × gpt-5.4-mini at low × high detail, with every input image saved) so the
vision model/detail choice is made on evidence.

## Context and constraints (verified 2026-06)

- **Ray-Ban Meta camera access** is exposed only through the **Meta Wearables Device
  Access Toolkit** — a *mobile* SDK (iOS Swift / Android Kotlin, plus a Web Apps path
  on Ray-Ban Display). It can stream POV camera frames to an app for real-time
  processing. There is **no server-side HTTP API** to pull frames; frames originate in
  the phone/glasses app and must be forwarded to our backend. The toolkit is in
  developer preview, with publishing going GA in 2026.
- **"Meta AI" is not a drop-in third-party inference API.** Meta's hosted offering is
  the **Llama API** (Llama 4 multimodal). For this increment we keep **gpt-4o-mini** as
  the vision describer (decision below); "Meta / Ray-Ban" refers to the *frame source*
  (hardware via the mobile toolkit), not an inference API.
- The glasses SDK (camera **and** microphone) is mobile/web, **not runnable from
  Python**. The backend side of this increment is therefore: the describer, the STT/TTS
  converters, the media-ingestion boundary (WebSocket), and the pipeline + voice loop that
  connect them to the brain. On-device capture/encoding stays in the mobile app.
- **Audio "Meta AI" clarification:** the glasses' own on-board Meta AI assistant is not
  used; the glasses are a mic/speaker, and all STT, reasoning, and TTS run server-side.

## Decisions

| Question | Decision |
|---|---|
| Vision model (frame → `VisionContext`) | **gpt-4o-mini** is the working default; final pick (vs **gpt-5.4-mini**) is decided by the model × detail eval below |
| Image `detail` | **`"low"`** is the default; eval also measures **`"high"`** |
| `describe()` input | **base64 data URL `str`** (`data:image/jpeg;base64,…`) |
| Voice architecture | **STT → text brain → TTS** pipeline; the audio models do **no inference**. Supersedes the bundled `gpt-4o-mini-realtime` path |
| STT / TTS provider | **All-OpenAI**: `gpt-4o-mini-transcribe` ($0.003/min) + `gpt-4o-mini-tts` (~$0.015/min) — one key, streaming, 50+ languages |
| Audio streaming | **Streaming STT** (endpointing + partials) + **batch TTS** (synthesize the short reply once) |
| Increment scope | Describer + `FrameSource` + `VisionPipeline` + STT + TTS converters + **WebSocket server (both media streams)** + **live `AgentSession` loop** + **vision-describer eval** |
| WebSocket layer | **`websockets`** (lightweight, pure asyncio; no HTTP framework) |
| Describer flags | the model emits **advisory** flags, kept in a **separate field** from the rule-based `flags` |

### Model / detail cost context (verified 2026-06)

Per-token list price: gpt-4o-mini **$0.15 / $0.60** per 1M (in/out); gpt-5.4-mini
**$0.75 / $4.50** per 1M. gpt-4o-mini inflates image tokens ~33× (a *low*-detail frame
is a fixed ~2,833 tokens), but its low base rate still makes it ~2.5× cheaper per frame
(~$0.0005 vs ~$0.0013) for this short-description workload. **High detail removes that
advantage** — gpt-4o-mini's per-tile ×33 multiplier can overtake gpt-5.4-mini — which is
exactly why the eval measures real cost per (model, detail) rather than trusting the
estimate. Because the describer's flags are only **advisory** (the rule-based CV `flags`
own escalation), paying for the strongest model is not required for safety.

### Audio cost / latency context (verified 2026-06)

`gpt-4o-mini-transcribe` is $0.003/min and `gpt-4o-mini-tts` ~$0.015/min, so a 5-minute
session's audio is roughly $0.02–0.09 depending on talk time — same order as the vision
cost. Single-vendor (one `OPENAI_API_KEY`) and 50+ language support align with the brain's
existing language-mirroring. The trade-off accepted: OpenAI TTS has higher time-to-first-
audio than specialist providers (Cartesia ~40–90ms, ElevenLabs Flash ~75ms). Mitigations:
streaming STT keeps endpointing tight, replies are short, and `TextToSpeech` is an
injectable seam — if measured turn latency misses the <3s target, a low-latency TTS vendor
can be dropped in without touching the loop or the brain.

### Why advisory flags get their own field

`safety/escalation.py` drives deterministic escalation off `VisionContext.flags`:

- `flags & CRITICAL_VISION_FLAGS` → escalate.
- **any** non-empty `flags` + silence ≥ `SILENCE_SECONDS` → `silence_with_abnormal_vision`.

If the describer's gpt-4o-mini flags were merged into `flags`, a hallucinated
`person_on_floor` would directly fire rule-based escalation, and *any* advisory flag
(even `tv_on`) plus silence would trip the abnormal-vision rule — making the
"authoritative" rule-based safety path depend on the LLM. So advisory flags live in a
new `VisionContext.advisory_flags` field. `flags` remains the rule-based / CV-pipeline
path; the deterministic escalation logic is untouched. The brain still benefits: the
`[VISION CONTEXT]` message gains an `Advisory:` segment.

## Data flow

One WebSocket connection per Help session carries **both** streams. Two concurrent tasks
run per connection: the vision pipeline (continuous, interval-throttled) keeps a "latest
scene", and the voice loop (turn-based) drives the conversation, reading that latest
scene on each turn.

**Vision stream (continuous):**
```
Ray-Ban camera ──POV frame──> phone app (Meta Wearables toolkit)
        │  JSON {type:"frame", data_url:"data:image/jpeg;base64,…"}
        ▼  WebSocket
  server/ws.py ─> WebSocketFrameSource ─> VisionPipeline
                                              │  throttle to VISION_INTERVAL_SECONDS (7s)
                                              ▼
                                        VisionDescriber.describe(data_url)   # gpt-4o-mini
                                              ▼
                                        VisionContext ──> stored as "latest scene"
                                                       └─> echoed to client (subtitle/debug)
```

**Voice loop (turn-based):**
```
Ray-Ban mic ──audio──> phone app ──{type:"audio", pcm chunks}──> WebSocket
        ▼
  SpeechToText (streaming, gpt-4o-mini-transcribe)  ── endpoint ──> final transcript
        ▼
  AgentSession.handle_patient_input(text, vision=<latest scene>, seconds_since_last_speech)
        │   (text brain = ONLY inference; rule-based escalation runs in parallel)
        ▼
  reply text ──> {type:"subtitle"} to client
        ▼
  TextToSpeech.synthesize(reply)  # batch, gpt-4o-mini-tts
        ▼
  {type:"audio_out"} ──> WebSocket ──> glasses speaker
```
A silence timer (no final transcript for `SILENCE_SECONDS`) fires a silence tick so the
rule-based "silence + abnormal vision" escalation can trigger without patient speech.

## Components

Each unit has one purpose, a defined interface, and is testable in isolation.

### 1. `VisionDescriber` — `src/memaide/vision/describer.py`

Replaces the current `NotImplementedError` placeholder.

- Interface: `async describe(self, frame: str) -> VisionContext`. `frame` is a base64
  data URL.
- `__init__(self, client, model=config.VISION_MODEL, detail=config.VISION_DETAIL,
  temperature=0.2)`. `detail` is `"low"` or `"high"` and is passed straight to the
  image part's `image_url.detail`. The default is `"low"` (cheap; pins gpt-4o-mini at
  its fixed ~2,833-token image cost and is enough for scene gist). `model` + `detail`
  being constructor params is what lets the eval harness sweep the 2×2 matrix.
- Depends on: an `OpenAIClient`-shaped object exposing
  `async complete_json(messages, model=?, temperature=?)`, injected for tests.
- Builds a two-message request: a small vision **system prompt** instructing a strict
  JSON reply `{"description": str, "label": str, "flags": [str]}` with a short (1–2
  sentence) description, and a **user** message whose `content` is a list:
  `[{"type":"text","text": …}, {"type":"image_url","image_url":{"url": frame, "detail": self._detail}}]`.
- Calls `complete_json(messages, model=self._model, temperature=self._temperature)`. No
  client changes are required — `complete_json` passes `messages` straight to
  `chat.completions.create`, which accepts image content parts and `json_object` for
  both gpt-4o-mini and gpt-5.4-mini.
- Maps the result to `VisionContext(description=…, label=…, advisory_flags=data.get("flags", []))`.

### 2. `FrameSource` — `src/memaide/vision/frame_source.py`

- `@runtime_checkable` `Protocol` with `def frames(self) -> AsyncIterator[str]` yielding
  base64 data URLs.
- `StubFrameSource(frames: list[str])` for offline tests, mirroring the existing
  `VisionCheck` / `StubVisionCheck` pattern.

### 3. `VisionPipeline` — `src/memaide/vision/pipeline.py`

- `__init__(self, source, describer, sink, interval=config.VISION_INTERVAL_SECONDS, clock=…)`.
  `sink` is `Callable[[VisionContext], Awaitable[None]]`; `clock` is an injectable
  monotonic time function for deterministic throttle tests.
- `async run(self)`: iterates `source.frames()`, **throttles** so at most one describe
  per `interval`, calls `describer.describe(frame)`, and awaits `sink(ctx)`. A failing
  `describe()` (e.g. API error) is logged and skipped — one bad frame never kills the
  stream.
- This is the reusable, transport-agnostic, fully-mockable core.

### 4. `SpeechToText` — `src/memaide/audio/stt.py` (new `audio/` package)

Pure transcription — **no inference**.

- Interface: `async transcribe(self, audio: AsyncIterator[bytes]) -> AsyncIterator[STTEvent]`,
  where `STTEvent` is `{kind: "partial"|"final", text: str}`. The loop acts on `final`
  events (a completed utterance); `partial` events are available for live subtitles.
- Implementation streams audio chunks to `gpt-4o-mini-transcribe` (streaming transcription)
  and surfaces endpointing (utterance boundaries) from the model. `language` may be hinted
  from `PatientContext.language`; otherwise auto-detected.
- Injectable like the other seams: tests pass a `StubSpeechToText(scripted_events)` so the
  loop is exercised without audio or network.

### 5. `TextToSpeech` — `src/memaide/audio/tts.py`

Pure synthesis — **no inference**.

- Interface: `async synthesize(self, text: str) -> bytes` (one-shot; the reply is short).
  Returns encoded audio (format/sample-rate from config) for the WS to forward.
- Implementation calls `gpt-4o-mini-tts` with `config.TTS_VOICE`. Injectable seam
  (`StubTextToSpeech`) for tests; the loop only depends on `synthesize(...)`. This is the
  swap point if a lower-latency TTS vendor is needed later.

### 6. Live session loop — `src/memaide/server/voice_loop.py`

Ties audio + vision + the existing `AgentSession` together. One instance per connection.

- Holds: an `AgentSession`, a `SpeechToText`, a `TextToSpeech`, a handle to the vision
  pipeline's **latest `VisionContext`**, an outbound `send` callback, and a clock.
- On each STT `final` transcript: calls
  `session.handle_patient_input(text, vision=<latest scene>, seconds_since_last_speech)`,
  sends the reply as `{type:"subtitle"}`, then `TextToSpeech.synthesize(reply)` and sends
  `{type:"audio_out"}`. Tracks `seconds_since_last_speech` from its clock.
- **Silence tick:** a timer fires every `SILENCE_SECONDS` of no final transcript and calls
  a new lightweight `AgentSession.on_silence_tick(seconds_since_last_speech, vision)` (see
  *Other edits*) so the rule-based "silence + abnormal vision" escalation can trigger and
  emit the emergency suggestion without requiring patient speech.
- Deterministic `VisionContext.flags` come from an injected `VisionCheck` (default
  `StubVisionCheck`, returning `[]`) run on frames; the describer only supplies
  `advisory_flags`. The real CV `VisionCheck` is still a later, pluggable drop-in.
- Fully testable: `StubSpeechToText` + `StubTextToSpeech` + a fake brain + a fake clock
  drive a complete turn (and a silence tick) with no network or audio devices.

### 7. WebSocket server — `src/memaide/server/ws.py` (new `server/` package)

Carries **both** media streams over one connection and runs the two concurrent tasks.

- Inbound demux by message `type`: `frame` → vision path; `audio` → voice path; `hello`
  / control → session setup. Malformed / unknown messages are ignored.
- `WebSocketFrameSource(websocket)` implements `FrameSource` for the vision path;
  `WebSocketAudioSource(websocket)` yields inbound audio chunks for STT.
- `handle(websocket)`: reads a `hello` (patient context / session id), starts a
  `VisionPipeline` task (sink stores latest scene + echoes `{type:"vision_context", …}`)
  **and** a `VoiceLoop` task, and fans both message types to them until the socket closes.
- Outbound message types: `vision_context`, `subtitle`, `audio_out`, plus `escalation`
  (so the caregiver portal can surface a 911 suggestion immediately).
- `async serve(deps, host=config.WS_HOST, port=config.WS_PORT)`: thin
  `websockets.serve(...)` wrapper; `deps` bundles the describer, STT, TTS, and brain
  factory so the whole server is constructed from injectable parts.

### 8. Vision-describer eval harness — `src/memaide/eval/run_vision_eval.py`

Mirrors the existing text eval (`run_eval.py`): real API calls, export-driven, writes a
timestamped run directory. It sweeps every **(model, detail)** combination over a fixed
set of input frames so the model/detail choice is made on evidence — including the
actual images each model saw.

**Input frames** — `src/memaide/eval/vision_frames/` (checked-in fixtures): a small set
of representative `.jpg`/`.png` scenes (e.g. person sitting calmly, person on the floor,
empty room, kitchen, person holding chest). Each image may have an optional sidecar
`<name>.json` with `{"expected_label": …, "expected_flags": […]}` for reference. The
harness simply globs every image in this directory, so dropping a real captured frame in
later "just works".

**Matrix** — `config.VISION_EVAL_MODELS = ["gpt-4o-mini", "gpt-5.4-mini"]` ×
`config.VISION_EVAL_DETAILS = ["low", "high"]` = 4 combos. Each combo constructs a
`VisionDescriber(model=…, detail=…)` and runs every frame through it.

**Per-frame record** — input filename, the `VisionContext` (description, label,
advisory_flags), latency (s), token usage, and computed USD cost. (`complete_json`
currently returns only the parsed JSON; the harness uses a thin variant that also returns
the raw response so it can read `usage`. This is an eval-only helper — the runtime path
is unchanged.)

**Output layout** — `docs/vision-eval-runs/run-<timestamp>/`:

```
run-<timestamp>/
  run.json                       # manifest: models, details, frame count,
                                 #   per-combo aggregate cost + mean latency
  comparison.md                  # grouped BY IMAGE: embeds each frame once, then a
                                 #   table of all 4 combos' description/label/flags
                                 #   side by side — open it to see image ↔ decisions
  gpt-4o-mini/
    low/
      frames/                    # a copy of every image this combo actually used,
        0001_person_on_floor.jpg #   named to match its results row
        0002_kitchen.jpg
      results.json               # structured per-frame records
      results.md                 # self-contained: embeds each frame next to its output
    high/
      frames/ …
      results.json
      results.md
  gpt-5.4-mini/
    low/  …
    high/ …
```

Saving the image **into each combo's `frames/` dir** (not just once) is deliberate: it
keeps every `results.md` self-contained and makes "what did *this* model at *this* detail
look at?" answerable from a single folder. `docs/vision-eval-runs/` is committed like the
existing `docs/eval-runs/` so runs are reviewable in-repo; the harness writes a fresh
timestamped dir each run.

This eval makes **real** calls to both models (needs `OPENAI_API_KEY` and access to
gpt-5.4-mini). With a handful of fixture frames × 4 combos it is a few cents per run.

## Schema change (additive, backward-compatible)

`src/memaide/schemas.py` — `VisionContext` gains:

```python
advisory_flags: list[str] = Field(default_factory=list)
```

`flags` keeps its meaning (rule-based / CV pipeline; drives escalation). Existing
consumers are unaffected.

## WebSocket message protocol

One connection per Help session. JSON envelopes for control + vision + text; audio may be
sent as JSON with base64 payloads initially (simplest, matches the `data_url` vision path)
with binary frames as a later optimization. This is the contract the Ray-Ban mobile app
implements.

**Client → server**
| `type` | payload | meaning |
|---|---|---|
| `hello` | `session_id`, patient context | open a session |
| `frame` | `data_url` (base64 image) | one POV camera frame |
| `audio` | `pcm` (base64 chunk), `seq` | a microphone audio chunk |
| `bye` | — | patient/app ending the session |

**Server → client**
| `type` | payload | meaning |
|---|---|---|
| `vision_context` | `description`, `label`, `advisory_flags`, `ts` | latest scene (subtitle/debug) |
| `subtitle` | `text`, `role` | agent reply text for on-screen display |
| `audio_out` | `pcm` (base64), `seq` | synthesized agent speech |
| `escalation` | `reason`, `triggered_by` | 911 suggested — surface in caregiver portal |

Unknown / malformed messages are ignored (forward-compatible).

## Other edits

- `src/memaide/agent/brain.py` — `_build_messages` appends an `Advisory: …` segment to
  the `[VISION CONTEXT]` system line when `advisory_flags` is non-empty.
- `src/memaide/agent/session.py` — add `on_silence_tick(seconds_since_last_speech,
  vision) -> Turn | None`: runs `escalation.check(None, vision, seconds)`, and if it
  escalates, appends an agent `Turn` carrying `EMERGENCY_SUGGESTION` and sets
  `escalated = True`. Lets the voice loop act on silence without patient text. Additive;
  existing turn flow unchanged.
- `src/memaide/config.py` — add `WS_HOST = "0.0.0.0"`, `WS_PORT = 8765`,
  `VISION_DETAIL = "low"`, `VISION_EVAL_MODELS = ["gpt-4o-mini", "gpt-5.4-mini"]`,
  `VISION_EVAL_DETAILS = ["low", "high"]`, `VISION_PRICING` (per-model in/out $/token,
  for the eval's cost computation), and audio settings: `STT_MODEL =
  "gpt-4o-mini-transcribe"`, `TTS_MODEL = "gpt-4o-mini-tts"`, `TTS_VOICE`,
  `AUDIO_FORMAT` / `AUDIO_SAMPLE_RATE`. `REALTIME_MODEL` is now **deprecated** (the
  STT→brain→TTS pipeline supersedes the bundled realtime path) — keep it with a comment
  rather than wiring it.
- `pyproject.toml` — add `websockets>=12` to `dependencies`. STT/TTS need **no** new
  dependency: both use the existing `openai` SDK.
- `docs/architecture.md` and `README.md` — document the vision pipeline, the STT/TTS
  converters, the live voice loop, the WebSocket server (both streams), and how to run
  the vision-describer eval (`python -m memaide.eval.run_vision_eval`).

## Error handling

- Per-frame `describe()` failure → log + skip; stream continues with the last good
  `VisionContext`.
- Malformed / unknown inbound WS message → ignored.
- gpt-4o-mini returning non-JSON → surfaces as a `complete_json` exception, caught
  per-frame by the pipeline.
- **STT failure** on an utterance → log + skip that turn (no reply); the loop stays alive
  for the next utterance. A patient stuck in failure still has the rule-based silence-tick
  escalation as a backstop.
- **TTS failure** → still send the `subtitle` (text reply is delivered) and an error
  marker; the conversation is not lost just because audio synthesis failed.
- **Brain turn** runs with `vision=<latest scene>`; if no frame has arrived yet, vision is
  `None` (the brain already handles `None`).
- WebSocket disconnect → media sources end, both tasks return, handler exits; the backend
  may still `stop()` the `AgentSession` to emit a `SessionRecord`.

## Testing

- `tests/test_vision.py` (extend) / `test_vision_describer` — fake client; assert the
  request includes an `image_url` part and `model=VISION_MODEL`, and that the returned
  `VisionContext` carries `description`, `label`, and `advisory_flags`.
- `test_vision_pipeline` — `StubFrameSource` + fake describer + fake clock; assert
  interval throttling, sink invocation per emitted context, and that a raising
  `describe()` is skipped without aborting the run.
- `test_stt` / `test_tts` — fake OpenAI client; assert STT yields `partial`/`final`
  `STTEvent`s from a scripted stream and targets `STT_MODEL`; assert TTS calls `TTS_MODEL`
  with `TTS_VOICE` and returns audio bytes.
- `test_voice_loop` — `StubSpeechToText` + `StubTextToSpeech` + fake brain + fake clock:
  a scripted `final` transcript drives one full turn (asserts `handle_patient_input`
  called with the latest vision, `subtitle` + `audio_out` sent); a simulated gap fires
  `on_silence_tick` and asserts escalation emits the 911 suggestion. No network/audio.
- `test_session_silence_tick` — `on_silence_tick` escalates on silence + abnormal vision
  and is a no-op otherwise.
- `test_ws` — fake websocket fixture; assert inbound demux (`frame` vs `audio` vs `hello`),
  malformed-message skipping, and that `vision_context` / `subtitle` / `audio_out` are
  emitted. One optional localhost round-trip test.
- `test_run_vision_eval` — fake client (no network); assert the harness sweeps every
  (model, detail) combo, writes the `frames/` copies, `results.json`, `results.md`, the
  top-level `comparison.md` and `run.json`, and that cost is computed from usage ×
  `VISION_PRICING`. Mirrors how `test_run_eval` mocks the OpenAI path.
- All existing tests remain green (every change is additive).

## Out of scope (later increments)

- The bundled `gpt-4o-mini-realtime` path — explicitly **superseded** by the
  STT→brain→TTS pipeline; `REALTIME_MODEL` stays in config as deprecated.
- The Ray-Ban mobile app itself (iOS/Android/Web via the Wearables toolkit) and the
  audio capture/encoding on the device side.
- Real CV `VisionCheck` implementation feeding the deterministic `flags` (loop uses the
  `StubVisionCheck` default until the CV team's drop-in lands).
- Barge-in / interruption handling (patient talking over the agent) and streaming TTS —
  the loop is turn-based with batch TTS this increment; the `TextToSpeech` seam allows a
  later streaming/low-latency swap.
- Audio as binary WS frames (this increment can use base64 JSON payloads; binary is a
  later optimization).
- A *live* capture eval: the vision eval runs over checked-in fixture frames, not frames
  pulled live from the glasses. Real captured frames can be dropped into
  `eval/vision_frames/` later and the harness picks them up automatically.

## Alternatives considered

- **Folding throttle + describe directly into the WS handler** (no `VisionPipeline`).
  Rejected: it would make the core logic untestable without a live socket and couple
  description cadence to transport. The `FrameSource` → `VisionPipeline` split keeps the
  testable core transport-agnostic and lets a phone-camera fallback or a file-based source
  reuse it.
- **Bundled `gpt-4o-mini-realtime` (STT + LLM + TTS in one model)** instead of the
  pipeline. Rejected per the decision above: it would move inference into the realtime
  model and bypass the already-tuned text brain, few-shot, and language filter. The
  realtime model also has no vision, so frames would still need a separate describe path.
  The STT→brain→TTS pipeline keeps the text brain as the single source of reasoning and
  lets STT/TTS be swapped independently. (Lower theoretical latency is the realtime
  model's only edge; the `TextToSpeech` seam preserves a latency escape hatch.)
