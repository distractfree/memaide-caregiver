# Vision Context + Ray-Ban Meta Frame Ingestion — Design (M2, increment 1)

Date: 2026-06-18
Status: Approved (brainstorming)
Branch: `feat/agent-foundation-m1`

## Summary

The first Milestone 2 increment: turn live point-of-view frames from Ray-Ban Meta
glasses into `VisionContext` (scene description + label + advisory flags) and feed
them toward the agent. This adds the gpt-4o-mini frame **describer**, a pluggable
frame **source** seam, a reusable **pipeline** core, and a thin **WebSocket server**
that receives frames from the glasses' mobile app.

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
| Vision model (frame → `VisionContext`) | **gpt-4o-mini** (existing M2 plan); glasses are the frame source only |
| `describe()` input | **base64 data URL `str`** (`data:image/jpeg;base64,…`) |
| Increment scope | Describer + `FrameSource` seam + `VisionPipeline` + **thin WebSocket receiver** |
| WebSocket layer | **`websockets`** (lightweight, pure asyncio; no HTTP framework) |
| Describer flags | gpt-4o-mini emits **advisory** flags, kept in a **separate field** from the rule-based `flags` |

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
- Depends on: an `OpenAIClient`-shaped object exposing
  `async complete_json(messages, model=?, temperature=?)`, injected for tests.
- Builds a two-message request: a small vision **system prompt** instructing a strict
  JSON reply `{"description": str, "label": str, "flags": [str]}` with a short (1–2
  sentence) description, and a **user** message whose `content` is a list:
  `[{"type":"text","text": …}, {"type":"image_url","image_url":{"url": frame}}]`.
- Calls `complete_json(messages, model=config.VISION_MODEL, temperature=0.2)`. No client
  changes are required — `complete_json` passes `messages` straight to
  `chat.completions.create`, which accepts image content parts and `json_object` for
  gpt-4o-mini.
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
- `src/memaide/config.py` — add `WS_HOST = "0.0.0.0"` and `WS_PORT = 8765`.
- `pyproject.toml` — add `websockets>=12` to `dependencies`.
- `docs/architecture.md` and `README.md` — document the new vision pipeline + server.

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
- All existing tests remain green (every change is additive).

## Out of scope (later increments)

- Live audio / `gpt-4o-mini-realtime` voice loop and TTS output.
- Wiring `VisionContext` into the live `AgentSession` turn loop (this increment produces
  and echoes it; session integration follows).
- The Ray-Ban mobile app itself (iOS/Android/Web via the Wearables toolkit).
- Real CV `VisionCheck` implementation feeding the deterministic `flags`.

## Alternative considered

Folding throttle + describe directly into the WS handler (no `VisionPipeline`). Rejected:
it would make the core logic untestable without a live socket and couple description
cadence to transport. The `FrameSource` → `VisionPipeline` split keeps the testable core
transport-agnostic and lets a phone-camera fallback or a file-based source reuse it.
