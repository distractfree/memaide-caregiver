# Vision Context + Ray-Ban Meta Frame Ingestion — Design (M2, increment 1)

Date: 2026-06-18
Status: Approved (brainstorming)
Branch: `feat/agent-foundation-m1`

## Summary

The first Milestone 2 increment: turn live point-of-view frames from Ray-Ban Meta
glasses into `VisionContext` (scene description + label + advisory flags) and feed
them toward the agent. This adds the frame **describer** (model + image-detail
configurable), a pluggable frame **source** seam, a reusable **pipeline** core, a thin
**WebSocket server** that receives frames from the glasses' mobile app, and a
**vision-describer eval** that sweeps gpt-4o-mini × gpt-5.4-mini at low × high detail —
saving every input image alongside each model's output and real cost/latency — so the
model/detail choice is made on evidence.

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
- The glasses SDK is mobile/web, **not runnable from Python**. The backend side of this
  increment is therefore: the describer, the frame-ingestion boundary, and the pipeline
  that connects them.

## Decisions

| Question | Decision |
|---|---|
| Vision model (frame → `VisionContext`) | **gpt-4o-mini** is the working default; final pick (vs **gpt-5.4-mini**) is decided by the model × detail eval below |
| Image `detail` | **`"low"`** is the default; eval also measures **`"high"`** |
| `describe()` input | **base64 data URL `str`** (`data:image/jpeg;base64,…`) |
| Increment scope | Describer (`model` + `detail` params) + `FrameSource` seam + `VisionPipeline` + **thin WebSocket receiver** + **vision-describer eval harness** |
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

```
Ray-Ban glasses ──POV frame──> phone app (Meta Wearables toolkit)
        │  JSON {type:"frame", data_url:"data:image/jpeg;base64,…"}
        ▼  WebSocket
  server/ws.py ─> WebSocketFrameSource ─> VisionPipeline
                                              │  throttle to VISION_INTERVAL_SECONDS (7s)
                                              ▼
                                        VisionDescriber.describe(data_url)   # gpt-4o-mini
                                              ▼
                                        VisionContext ──> sink ──> WS back to client
                                                              (later: into AgentSession)
```

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

### 4. WebSocket server — `src/memaide/server/ws.py` (new `server/` package)

- `WebSocketFrameSource(websocket)` implements `FrameSource`: parses inbound JSON
  `{type:"frame", data_url}` envelopes, yields `data_url`, ignores malformed / other
  message types, and stops cleanly on connection close.
- `handle(websocket)`: builds a `WebSocketFrameSource`, defines a `sink` that sends each
  `VisionContext` back as `{type:"vision_context", description, label, advisory_flags, ts}`,
  and runs a `VisionPipeline`.
- `async serve(describer, host=config.WS_HOST, port=config.WS_PORT)`: thin
  `websockets.serve(...)` wrapper.

### 5. Vision-describer eval harness — `src/memaide/eval/run_vision_eval.py`

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

## Other edits

- `src/memaide/agent/brain.py` — `_build_messages` appends an `Advisory: …` segment to
  the `[VISION CONTEXT]` system line when `advisory_flags` is non-empty.
- `src/memaide/config.py` — add `WS_HOST = "0.0.0.0"`, `WS_PORT = 8765`,
  `VISION_DETAIL = "low"`, `VISION_EVAL_MODELS = ["gpt-4o-mini", "gpt-5.4-mini"]`,
  `VISION_EVAL_DETAILS = ["low", "high"]`, and `VISION_PRICING` (per-model in/out
  $/token, for the eval's cost computation).
- `pyproject.toml` — add `websockets>=12` to `dependencies`.
- `docs/architecture.md` and `README.md` — document the new vision pipeline, WebSocket
  server, and how to run the vision-describer eval (`python -m memaide.eval.run_vision_eval`).

## Error handling

- Per-frame `describe()` failure → log + skip; stream continues with the last good
  `VisionContext`.
- Malformed / non-`frame` inbound WS message → ignored.
- gpt-4o-mini returning non-JSON → surfaces as a `complete_json` exception, caught
  per-frame by the pipeline.
- WebSocket disconnect → `frames()` iterator ends, `run()` returns, handler exits.

## Testing

- `tests/test_vision.py` (extend) / `test_vision_describer` — fake client; assert the
  request includes an `image_url` part and `model=VISION_MODEL`, and that the returned
  `VisionContext` carries `description`, `label`, and `advisory_flags`.
- `test_vision_pipeline` — `StubFrameSource` + fake describer + fake clock; assert
  interval throttling, sink invocation per emitted context, and that a raising
  `describe()` is skipped without aborting the run.
- `test_frame_source` / `test_ws` — fake websocket fixture yielding messages; assert
  envelope parsing, malformed-message skipping, and `vision_context` echo. One optional
  localhost round-trip test.
- `test_run_vision_eval` — fake client (no network); assert the harness sweeps every
  (model, detail) combo, writes the `frames/` copies, `results.json`, `results.md`, the
  top-level `comparison.md` and `run.json`, and that cost is computed from usage ×
  `VISION_PRICING`. Mirrors how `test_run_eval` mocks the OpenAI path.
- All existing tests remain green (every change is additive).

## Out of scope (later increments)

- Live audio / `gpt-4o-mini-realtime` voice loop and TTS output.
- Wiring `VisionContext` into the live `AgentSession` turn loop (this increment produces
  and echoes it; session integration follows).
- The Ray-Ban mobile app itself (iOS/Android/Web via the Wearables toolkit).
- Real CV `VisionCheck` implementation feeding the deterministic `flags`.
- A *live* capture eval: the vision eval runs over checked-in fixture frames, not frames
  pulled live from the glasses. Real captured frames can be dropped into
  `eval/vision_frames/` later and the harness picks them up automatically.

## Alternative considered

Folding throttle + describe directly into the WS handler (no `VisionPipeline`). Rejected:
it would make the core logic untestable without a live socket and couple description
cadence to transport. The `FrameSource` → `VisionPipeline` split keeps the testable core
transport-agnostic and lets a phone-camera fallback or a file-based source reuse it.
