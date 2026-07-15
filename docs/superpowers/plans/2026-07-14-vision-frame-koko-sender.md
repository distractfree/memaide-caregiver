# Vision-frame Sender to koko Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream each described glasses frame (JPEG + vision metadata) from the AI server to koko's backend, one POST per described frame.

**Architecture:** Extend the existing `KokoReporter` with a `frame()` method that POSTs to `/ai-sessions/{session_id}/frames`, reusing its `_post` transport (auth, no-op-in-dev, log-and-swallow). Call it from the per-described-frame `sink` closure in `server/ws.py`, guarded like the existing `escalation`/`conclude` calls, with a per-connection monotonic `seq` counter.

**Tech Stack:** Python 3.13, pytest (async tests, no extra deps), Pydantic (`VisionContext`), httpx (already the reporter's transport).

**Spec:** `docs/superpowers/specs/2026-07-14-vision-frame-koko-sender-design.md`

---

## File Structure

- **Modify** `src/memaide/service/koko_reporter.py` — add `frame()` method. No other change; reuses `_post`.
- **Modify** `src/memaide/server/ws.py` — add a `frame_seq` counter in the connection scope and one guarded `reporter.frame(...)` call at the end of `sink`.
- **Modify** `tests/test_koko_reporter.py` — add `frame()` unit tests (fake client).
- **Test** `tests/test_ws_frame_report.py` (create) — assert `sink` calls `reporter.frame` once per described frame with incrementing `seq`, and is guarded off when the reporter is absent.

---

## Task 1: `KokoReporter.frame()` method

**Files:**
- Modify: `src/memaide/service/koko_reporter.py`
- Test: `tests/test_koko_reporter.py`

- [ ] **Step 1: Write the failing tests**

Add these tests to `tests/test_koko_reporter.py`. They reuse the file's existing `FakeClient`. Add the import at the top of the file (alongside the existing imports):

```python
from memaide.schemas import VisionContext
```

Then append:

```python
def _ctx():
    return VisionContext(
        description="An older adult seated at a kitchen table.",
        label="kitchen",
        ts=datetime(2026, 7, 14, 18, 22, 5, tzinfo=timezone.utc),
        flags=["person_seated"],
        advisory_flags=[],
    )


async def test_frame_posts_image_and_vision():
    fc = FakeClient()
    rep = KokoReporter(base_url="http://koko:4000", api_key="k", client=fc)
    await rep.frame("s1", _ctx(), "data:image/jpeg;base64,QUJD", 42)
    call = fc.calls[0]
    assert call["url"] == "http://koko:4000/ai-sessions/s1/frames"
    assert call["headers"] == {"X-Api-Key": "k"}
    body = call["json"]
    assert body["seq"] == 42
    assert body["ts"] == "2026-07-14T18:22:05+00:00"
    assert body["image"] == {"mime": "image/jpeg", "b64": "QUJD"}
    assert body["vision"] == {
        "description": "An older adult seated at a kitchen table.",
        "label": "kitchen",
        "flags": ["person_seated"],
        "advisory_flags": [],
    }


async def test_frame_strips_data_url_prefix():
    fc = FakeClient()
    rep = KokoReporter(base_url="http://koko:4000", client=fc)
    await rep.frame("s1", _ctx(), "data:image/jpeg;base64,SGVsbG8=", 0)
    assert fc.calls[0]["json"]["image"]["b64"] == "SGVsbG8="


async def test_frame_omits_image_when_frame_url_none():
    fc = FakeClient()
    rep = KokoReporter(base_url="http://koko:4000", client=fc)
    await rep.frame("s1", _ctx(), None, 7)
    body = fc.calls[0]["json"]
    assert "image" not in body
    assert body["seq"] == 7
    assert body["vision"]["label"] == "kitchen"


async def test_frame_no_op_when_disabled():
    fc = FakeClient()
    rep = KokoReporter(base_url=None, client=fc)
    await rep.frame("s1", _ctx(), "data:image/jpeg;base64,QUJD", 1)
    assert fc.calls == []


async def test_frame_failure_is_swallowed():
    fc = FakeClient(raises=True)
    rep = KokoReporter(base_url="http://koko:4000", client=fc)
    await rep.frame("s1", _ctx(), None, 0)  # must not raise
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/test_koko_reporter.py -k frame -v`
Expected: FAIL — `AttributeError: 'KokoReporter' object has no attribute 'frame'`.

- [ ] **Step 3: Implement `frame()`**

In `src/memaide/service/koko_reporter.py`, add the import at the top (the module currently imports `EscalationDecision, SessionRecord` from `memaide.schemas`):

```python
from memaide.schemas import EscalationDecision, SessionRecord, VisionContext
```

Add this method to `KokoReporter`, immediately after `conclude` (before `_post`):

```python
    async def frame(
        self, session_id: str, ctx: VisionContext, frame_url: str | None, seq: int
    ) -> None:
        body: dict = {
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m pytest tests/test_koko_reporter.py -v`
Expected: PASS (all existing + 5 new `frame` tests).

- [ ] **Step 5: Commit**

```bash
git add src/memaide/service/koko_reporter.py tests/test_koko_reporter.py
git commit -m "feat: KokoReporter.frame() posts described frame + vision to koko"
```

---

## Task 2: Wire `reporter.frame()` into the `ws.py` sink

**Files:**
- Modify: `src/memaide/server/ws.py` (the `handle` function: `latest` init near line 208, and the `sink` closure at line 210)
- Test: `tests/test_ws_frame_report.py` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/test_ws_frame_report.py`. This drives the real `sink` closure by constructing the same seam the server uses. It builds a minimal `ServerDeps` with a recording fake reporter and a stub describer that yields two frames, runs one connection through `handle`, and asserts `reporter.frame` was called twice with `seq` 0 then 1.

```python
import asyncio
import json

import pytest

from memaide.schemas import VisionContext
from memaide.server import ws
from memaide.server.ws import ServerDeps


class RecordingReporter:
    """Reporter double: records frame() calls, no-ops escalation/conclude."""

    def __init__(self):
        self.frames = []

    async def frame(self, session_id, ctx, frame_url, seq):
        self.frames.append({"session_id": session_id, "seq": seq, "frame_url": frame_url})

    async def escalation(self, *a, **k):
        pass

    async def conclude(self, *a, **k):
        pass


class StubDescriber:
    """Describes any frame into a fixed VisionContext (label carries the frame index)."""

    async def describe(self, frame_url):
        return VisionContext(description="d", label=frame_url, flags=[], advisory_flags=[])


class FakeWebSocket:
    """Feeds a hello, two frames, then closes; collects sent messages."""

    def __init__(self, inbound):
        self._inbound = list(inbound)
        self.sent = []

    def __aiter__(self):
        async def gen():
            for m in self._inbound:
                yield json.dumps(m)
        return gen()

    async def send(self, raw):
        self.sent.append(json.loads(raw))


async def test_sink_reports_each_described_frame_with_incrementing_seq():
    reporter = RecordingReporter()
    deps = ServerDeps(
        describer=StubDescriber(),
        stt=None,
        tts=None,
        make_brain=lambda patient: None,
        interval=0.0,          # describe every frame, no throttle
        reporter=reporter,
    )
    inbound = [
        {"type": "hello", "session_id": "s1"},
        {"type": "frame", "data": "data:image/jpeg;base64,QUJD"},
        {"type": "frame", "data": "data:image/jpeg;base64,REVG"},
    ]
    ws_conn = FakeWebSocket(inbound)
    await asyncio.wait_for(ws.handle(ws_conn, deps), timeout=5.0)

    assert [f["seq"] for f in reporter.frames] == [0, 1]
    assert reporter.frames[0]["frame_url"] == "data:image/jpeg;base64,QUJD"
    assert reporter.frames[1]["frame_url"] == "data:image/jpeg;base64,REVG"
```

NOTE — before writing the assertions as final, open `src/memaide/server/ws.py` and confirm two seam details, adjusting the test to match the real code (do not change the production behavior to fit a guess):
1. The inbound message shape for frames — the key the demuxer reads for the base64 payload (`data` vs `frame` vs `image`). Match `inbound` to it.
2. How `handle` terminates a connection when the inbound iterator is exhausted (the `FakeWebSocket` ends its async iteration; if `handle` expects an explicit close/`bye` message, add it to `inbound`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m pytest tests/test_ws_frame_report.py -v`
Expected: FAIL — `reporter.frames` is empty (the `sink` does not call `reporter.frame` yet), so the `seq` assertion fails with `[] != [0, 1]`.

- [ ] **Step 3: Add the `frame_seq` counter**

In `src/memaide/server/ws.py`, find this line in `handle` (currently ~line 208):

```python
    latest: dict[str, Any] = {"scene": None, "frame_url": None}
```

Add the counter directly beneath it:

```python
    latest: dict[str, Any] = {"scene": None, "frame_url": None}
    frame_seq = 0
```

- [ ] **Step 4: Send the frame from the sink**

In the same file, the `sink` closure currently ends with (near line 222):

```python
        if deps.observer is not None:
            # on_scene swallows its own errors, but guard the connection regardless.
            await deps.observer.on_scene(ctx, session, frame_url=latest["frame_url"])
```

Add `nonlocal frame_seq` as the first line of the `sink` body (right after `async def sink(ctx: VisionContext) -> None:`), and append the reporter call after the observer block:

```python
    async def sink(ctx: VisionContext) -> None:
        nonlocal frame_seq
        ...  # existing body unchanged
        if deps.observer is not None:
            await deps.observer.on_scene(ctx, session, frame_url=latest["frame_url"])
        if deps.reporter is not None and session_id is not None:
            await deps.reporter.frame(session_id, ctx, latest["frame_url"], frame_seq)
            frame_seq += 1
```

- [ ] **Step 5: Run the new test to verify it passes**

Run: `python -m pytest tests/test_ws_frame_report.py -v`
Expected: PASS — `reporter.frames` has `seq` `[0, 1]` with the two frame URLs.

- [ ] **Step 6: Run the full suite to confirm no regression**

Run: `python -m pytest -q`
Expected: PASS — all pre-existing tests plus the new ones. In particular, connections with `reporter=None` (the default) must still pass, proving the guard leaves legacy/observer-only deployments unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/memaide/server/ws.py tests/test_ws_frame_report.py
git commit -m "feat: stream each described frame to koko from the ws sink"
```

---

## Task 3: Update integration docs for koko

**Files:**
- Modify: `README.md` (the section documenting koko callback endpoints / env vars, alongside `escalation` and `conclude`)

- [ ] **Step 1: Locate the koko-endpoints doc**

Run: `grep -n "ai-sessions\|conclude\|escalation\|KOKO_BASE_URL" README.md`
Expected: finds the existing koko callback docs. (If README has no such section, add a short "koko callbacks" subsection near the other integration/env-var docs instead.)

- [ ] **Step 2: Document the new endpoint**

Add an entry for the frames endpoint next to the existing `escalation`/`conclude` docs. Use this content:

```markdown
`POST /ai-sessions/{session_id}/frames` — one per described glasses frame (~1 every 2s), best-effort.
Header `X-Api-Key: {KOKO_API_KEY}`. Body:

    {
      "seq": 42,                       // monotonic per-session, from 0
      "ts": "2026-07-14T18:22:05+00:00",
      "image": {                       // omitted if no frame bytes for this scene
        "mime": "image/jpeg",
        "b64": "<base64, no data-URL prefix>"
      },
      "vision": {
        "description": "...",
        "label": "kitchen",
        "flags": ["person_seated"],
        "advisory_flags": []
      }
    }

koko may reconstruct a renderable image as `data:image/jpeg;base64,{b64}`.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document koko /frames endpoint format"
```

---

## Self-Review Notes

- **Spec coverage:** endpoint + auth (Task 1 `frame()`), payload schema incl. `seq`/`ts`/optional `image`/`vision` (Task 1 tests + method), prefix-stripping (Task 1), image-omitted-when-None (Task 1), no-op-in-dev + swallow (Task 1), per-described-frame cadence + incrementing `seq` + guard (Task 2), format handed to koko (Task 3). All spec sections map to a task.
- **Type consistency:** `frame(self, session_id, ctx, frame_url, seq)` signature is identical in the method (Task 1 Step 3), the reporter tests (Task 1 Step 1), the wiring call (Task 2 Step 4), and the `RecordingReporter` double (Task 2 Step 1). Body keys (`seq`, `ts`, `image.mime`, `image.b64`, `vision.{description,label,flags,advisory_flags}`) match between the method and its assertions.
- **Known seam to verify at implementation time:** Task 2 Step 1's NOTE — the inbound `frame` message key and the connection-termination condition are read from `ws.py` rather than assumed. This is deliberate: the test is adjusted to the real demuxer, not the reverse.
