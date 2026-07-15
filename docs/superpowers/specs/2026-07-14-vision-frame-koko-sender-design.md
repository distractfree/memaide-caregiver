# Vision-frame sender to koko's backend

**Date:** 2026-07-14
**Status:** Approved (design)

## Goal

Stream each described glasses frame — the JPEG image plus the AI's read of the
scene — from the AI server to koko's backend, so koko can show a live
frame-by-frame view of what the patient's glasses are seeing alongside the
vision metadata.

## Context

Frames flow Android glasses -> phone -> WebSocket -> this AI server. Inbound
`frame` messages (base64 data-URL JPEG strings) feed `WebSocketFrameSource`; the
`VisionPipeline` throttles to ~1 frame / 2s and describes each survivor into a
`VisionContext` (`description`, `label`, `flags`, `advisory_flags`, `ts`). The
per-described-frame `sink` closure in `server/ws.py` is where the described
`VisionContext` and the raw `latest["frame_url"]` are both in scope, together
with `session_id` and `deps.reporter`.

koko integration already exists: `service/koko_reporter.py`'s `KokoReporter`
POSTs `escalation` and `conclude` events to `{KOKO_BASE_URL}/ai-sessions/{id}/…`
with `X-Api-Key` auth, best-effort (failures logged, never raised), and a no-op
when `KOKO_BASE_URL` is unset. This feature extends that reporter rather than
adding a new transport.

## Decisions

- **Payload:** both the frame image and the vision metadata, in one JSON body.
- **Cadence:** one POST per *described* frame (~1/2s), sent from the `sink`
  after the existing observer call — not per raw inbound frame.
- **Contract:** we define it (documented below); koko implements the receiving
  endpoint against this spec.
- **Location:** the AI server, by extending `KokoReporter`.

## Design

### Endpoint

```
POST {KOKO_BASE_URL}/ai-sessions/{session_id}/frames
Header: X-Api-Key: {KOKO_API_KEY}
Body:   application/json  (schema below)
```

Best-effort telemetry: koko's endpoint should ack quickly (2xx) and must not be
relied on to block or backpressure the live session. A non-2xx, a timeout, or an
unreachable host is logged on our side and dropped.

### Payload format

```json
{
  "seq": 42,
  "ts": "2026-07-14T18:22:05.123456+00:00",
  "image": {
    "mime": "image/jpeg",
    "b64": "<raw base64, no data-URL prefix>"
  },
  "vision": {
    "description": "An older adult seated at a kitchen table.",
    "label": "kitchen",
    "flags": ["person_seated"],
    "advisory_flags": []
  }
}
```

Field notes:

- `seq` (int) — monotonic per-session counter starting at 0, incremented once
  per described frame. Lets koko order and dedup independent of clock skew.
- `ts` (string) — `ctx.ts.isoformat()`, the described-frame timestamp (UTC,
  ISO-8601).
- `image` (object, optional) — omitted entirely when no frame bytes are
  available for the described scene, so a metadata-only frame still reports.
  - `image.mime` — always `"image/jpeg"` for the current pipeline.
  - `image.b64` — the frame's base64 payload with the `data:image/jpeg;base64,`
    prefix stripped. koko reconstructs a data URL as
    `data:{mime};base64,{b64}` if it wants to render directly in an `<img>`.
- `vision.flags` (string[]) — the resolved flags for the scene
  (`deps.vision_check.check()`), matching what the preview/observer display.
- `vision.advisory_flags` (string[]) — the describer's raw advisory flags.

Approximate size: a low-detail glasses JPEG base64-encodes to tens of KB per
POST; at ~1/2s that is a modest, steady stream.

### New method on `KokoReporter`

```python
async def frame(
    self, session_id: str, ctx: VisionContext, frame_url: str | None, seq: int
) -> None:
    body = {
        "seq": seq,
        "ts": ctx.ts.isoformat(),
        "vision": {
            "description": ctx.description,
            "label": ctx.label,
            "flags": list(ctx.flags),
            "advisory_flags": list(ctx.advisory_flags),
        },
    }
    if frame_url:
        b64 = frame_url.split(",", 1)[1] if "," in frame_url else frame_url
        body["image"] = {"mime": "image/jpeg", "b64": b64}
    await self._post(f"/ai-sessions/{session_id}/frames", body)
```

The prefix-stripping mirrors `FramePreviewWriter._decode`. Reuses the existing
`_post` for auth, no-op-in-dev, and log-and-swallow error handling.

### Wiring in `server/ws.py`

The `sink` closure (currently ends by calling `deps.observer.on_scene(...)`)
gains a per-connection frame counter and one guarded call:

```python
# before the sink is defined, in connection scope:
frame_seq = 0

async def sink(ctx: VisionContext) -> None:
    nonlocal frame_seq
    ...  # existing: resolve flags, stash latest, send vision_context, observer
    if deps.reporter is not None and session_id is not None:
        await deps.reporter.frame(session_id, ctx, latest["frame_url"], frame_seq)
        frame_seq += 1
```

Guard matches the existing `escalation`/`conclude` guards, so an
observer-only or reporter-less deployment is unchanged. `ctx` here already
carries the resolved `flags` (set at the top of `sink`).

### Error handling

No new paths. `frame()` delegates to `_post`, which catches every exception and
logs `[koko] POST /ai-sessions/{id}/frames failed: …`. A koko outage, a slow
endpoint, or a malformed frame can never raise into the connection or stall the
voice/vision loop.

## Testing

- `frame()` posts to `/ai-sessions/{id}/frames` with the `X-Api-Key` header and
  the documented body (fake client, mirrors existing `KokoReporter` tests).
- `frame()` strips the `data:image/jpeg;base64,` prefix to raw base64.
- `frame()` omits the `image` key when `frame_url` is `None`.
- `frame()` is a no-op (no POST) when `base_url` is unset.
- `sink` calls `reporter.frame` once per described frame with an incrementing
  `seq`, guarded off when `reporter` or `session_id` is absent.

## Out of scope

- Sending raw (pre-throttle) frames.
- Binary/multipart transport (base64-in-JSON is sufficient at this cadence).
- koko-side storage, retention, or the caregiver UI that renders the stream.
- Backpressure / retry / buffering — best-effort drop-on-failure is the contract.
