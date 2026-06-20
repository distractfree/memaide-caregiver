# M2 Vision Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the M1 vision stubs with a working frame-description pipeline: real `VisionDescriber` (gpt-4o-mini, configurable model/detail), a pluggable `FrameSource`, a transport-agnostic throttled `VisionPipeline`, an additive `advisory_flags` schema field surfaced to the brain, and an export-only vision-describer eval that sweeps (model × detail) over fixture frames.

**Architecture:** Frames arrive as base64 data-URL strings from a `FrameSource` (stub now; WebSocket source in Plan B). `VisionPipeline.run()` throttles to one describe per `VISION_INTERVAL_SECONDS`, calls `VisionDescriber.describe()` (the only inference), and pushes each resulting `VisionContext` to an injected async `sink`. Describer flags are **advisory only** — they land in `VisionContext.advisory_flags`, kept separate from the rule-based `flags` that drive deterministic escalation, so a hallucinated `person_on_floor` can never fire safety logic. The eval reuses the real describer through a usage-recording client wrapper.

**Tech Stack:** Python 3.11, pydantic v2, `openai` async SDK, pytest (`asyncio_mode=auto`). No new runtime dependencies (the WebSocket dep lands in Plan B).

**Branch:** `feat/agent-foundation-m1` (continue here; do not branch).

**Scope note:** This is Plan A of two. Plan B (audio + live media: STT, TTS, `on_silence_tick`, voice loop, WebSocket server) is deferred to a separate plan and consumes the "latest scene" produced here.

---

### Task 1: Add `advisory_flags` to `VisionContext` (additive schema change)

**Files:**
- Modify: `src/memaide/schemas.py:46-50`
- Test: `tests/test_schemas.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_schemas.py`:

```python
def test_vision_context_advisory_flags_default_empty_and_separate_from_flags():
    from memaide.schemas import VisionContext

    ctx = VisionContext(description="d", label="kitchen", flags=["person_on_floor"])
    assert ctx.advisory_flags == []  # defaults independent of flags

    ctx2 = VisionContext(
        description="d", label="kitchen",
        flags=[], advisory_flags=["tv_on", "person_seated"],
    )
    assert ctx2.flags == []
    assert ctx2.advisory_flags == ["tv_on", "person_seated"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python -m pytest tests/test_schemas.py::test_vision_context_advisory_flags_default_empty_and_separate_from_flags -v`
Expected: FAIL — `VisionContext` has no field `advisory_flags` (pydantic raises on the `advisory_flags=` kwarg / attribute missing).

- [ ] **Step 3: Add the field**

In `src/memaide/schemas.py`, update `VisionContext`:

```python
class VisionContext(BaseModel):
    description: str
    label: str
    ts: datetime = Field(default_factory=_now)
    flags: list[str] = Field(default_factory=list)
    advisory_flags: list[str] = Field(default_factory=list)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv\Scripts\python -m pytest tests/test_schemas.py -v`
Expected: PASS (new test + all existing schema tests).

- [ ] **Step 5: Commit**

```bash
git add src/memaide/schemas.py tests/test_schemas.py
git commit -m "feat(schemas): add advisory_flags to VisionContext"
```

---

### Task 2: Add vision config (detail, eval matrix, pricing)

**Files:**
- Modify: `src/memaide/config.py:47-48`
- Test: `tests/test_config.py`

`VISION_INTERVAL_SECONDS = 7.0` already exists — do **not** re-add it.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_config.py`:

```python
def test_vision_config_present():
    from memaide import config

    assert config.VISION_DETAIL in ("low", "high")
    assert config.VISION_EVAL_MODELS == ["gpt-4o-mini", "gpt-5.4-mini"]
    assert config.VISION_EVAL_DETAILS == ["low", "high"]
    # pricing is per-token USD for every eval model
    for model in config.VISION_EVAL_MODELS:
        assert {"in", "out"} <= set(config.VISION_PRICING[model])
        assert config.VISION_PRICING[model]["in"] > 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python -m pytest tests/test_config.py::test_vision_config_present -v`
Expected: FAIL — `AttributeError: module 'memaide.config' has no attribute 'VISION_DETAIL'`.

- [ ] **Step 3: Add the config**

In `src/memaide/config.py`, replace the `# --- Vision (Milestone 2) ---` block:

```python
# --- Vision (Milestone 2) ---
VISION_INTERVAL_SECONDS = 7.0
VISION_DETAIL = "low"  # passed to image_url.detail; "low" pins gpt-4o-mini at ~2,833 img tokens

# Vision-describer eval sweep (real API calls; see eval/run_vision_eval.py).
VISION_EVAL_MODELS = ["gpt-4o-mini", "gpt-5.4-mini"]
VISION_EVAL_DETAILS = ["low", "high"]

# Per-token list price (USD) for the eval's cost computation. Verified 2026-06:
# gpt-4o-mini $0.15/$0.60 per 1M in/out; gpt-5.4-mini $0.75/$4.50 per 1M in/out.
VISION_PRICING = {
    "gpt-4o-mini": {"in": 0.15 / 1_000_000, "out": 0.60 / 1_000_000},
    "gpt-5.4-mini": {"in": 0.75 / 1_000_000, "out": 4.50 / 1_000_000},
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv\Scripts\python -m pytest tests/test_config.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/memaide/config.py tests/test_config.py
git commit -m "feat(config): add vision detail, eval matrix, and pricing"
```

---

### Task 3: Implement `VisionDescriber` (replace the M1 placeholder)

**Files:**
- Modify: `src/memaide/vision/describer.py` (full rewrite)
- Test: `tests/test_vision.py` (replace the M1 not-implemented test; add real tests)

- [ ] **Step 1: Replace the obsolete M1 test and write the failing tests**

In `tests/test_vision.py`, **delete** this test:

```python
async def test_describer_is_not_implemented_in_m1():
    with pytest.raises(NotImplementedError):
        await VisionDescriber().describe(frame=b"")
```

Then add (the `import pytest` line at the top of the file is now unused — remove it if no other test needs it):

```python
class RecordingClient:
    """Fake JSON client: records the request and returns a fixed payload."""

    def __init__(self, payload):
        self.payload = payload
        self.last_messages = None
        self.last_model = None
        self.last_temperature = None

    async def complete_json(self, messages, model=None, temperature=None):
        self.last_messages = messages
        self.last_model = model
        self.last_temperature = temperature
        return self.payload


async def test_describer_returns_vision_context_with_advisory_flags():
    client = RecordingClient(
        {"description": "A person sits at a kitchen table.", "label": "kitchen",
         "flags": ["person_seated", "tv_on"]}
    )
    describer = VisionDescriber(client=client)
    ctx = await describer.describe("data:image/jpeg;base64,QUJD")
    assert ctx.description == "A person sits at a kitchen table."
    assert ctx.label == "kitchen"
    assert ctx.advisory_flags == ["person_seated", "tv_on"]
    assert ctx.flags == []  # describer never populates the rule-based flags


async def test_describer_sends_image_part_with_configured_model_and_detail():
    client = RecordingClient({"description": "d", "label": "l", "flags": []})
    describer = VisionDescriber(client=client, model="gpt-5.4-mini", detail="high")
    await describer.describe("data:image/png;base64,QUJD")

    assert client.last_model == "gpt-5.4-mini"
    user_msg = client.last_messages[-1]
    assert user_msg["role"] == "user"
    image_part = [p for p in user_msg["content"] if p["type"] == "image_url"][0]
    assert image_part["image_url"]["url"] == "data:image/png;base64,QUJD"
    assert image_part["image_url"]["detail"] == "high"


async def test_describer_tolerates_missing_flags():
    client = RecordingClient({"description": "d", "label": "l"})
    ctx = await VisionDescriber(client=client).describe("data:image/jpeg;base64,QUJD")
    assert ctx.advisory_flags == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python -m pytest tests/test_vision.py -v`
Expected: FAIL — `VisionDescriber.__init__()` takes no `client` arg / `describe` raises `NotImplementedError`.

- [ ] **Step 3: Implement the describer**

Replace the entire contents of `src/memaide/vision/describer.py`:

```python
"""Turn a captured frame (base64 data URL) into a short scene description + label.

The describer's flags are ADVISORY only and land in ``VisionContext.advisory_flags``;
they never populate the rule-based ``flags`` that drive deterministic escalation.
"""

from typing import Any

from memaide import config
from memaide.schemas import VisionContext

_VISION_SYSTEM_PROMPT = (
    "You assist an elder-care agent by describing a single point-of-view photo. "
    "Reply with STRICT JSON only, no prose, in this exact shape: "
    '{"description": str, "label": str, "flags": [str]}. '
    "description: 1-2 short, plain sentences of what is happening. "
    "label: a few-word scene label (e.g. 'kitchen', 'person on floor'). "
    "flags: short advisory observation tags such as 'person_on_floor', 'no_motion', "
    "'person_seated', 'tv_on'; use [] when nothing is notable. Do not guess medical "
    "facts; describe only what is visible."
)


class VisionDescriber:
    """Describes one frame via a vision-capable chat model.

    ``client`` must expose ``async complete_json(messages, model=?, temperature=?)``.
    ``model`` and ``detail`` are constructor params so the eval harness can sweep the
    (model x detail) matrix.
    """

    def __init__(
        self,
        client: Any,
        model: str = config.VISION_MODEL,
        detail: str = config.VISION_DETAIL,
        temperature: float = 0.2,
    ):
        self._client = client
        self._model = model
        self._detail = detail
        self._temperature = temperature

    async def describe(self, frame: str) -> VisionContext:
        """``frame`` is a base64 data URL (e.g. 'data:image/jpeg;base64,...')."""
        messages = [
            {"role": "system", "content": _VISION_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Describe this scene."},
                    {
                        "type": "image_url",
                        "image_url": {"url": frame, "detail": self._detail},
                    },
                ],
            },
        ]
        data = await self._client.complete_json(
            messages, model=self._model, temperature=self._temperature
        )
        return VisionContext(
            description=data.get("description", ""),
            label=data.get("label", ""),
            advisory_flags=data.get("flags", []),
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python -m pytest tests/test_vision.py -v`
Expected: PASS (all describer + stub-vision-check tests).

- [ ] **Step 5: Commit**

```bash
git add src/memaide/vision/describer.py tests/test_vision.py
git commit -m "feat(vision): implement VisionDescriber with configurable model/detail"
```

---

### Task 4: Surface advisory flags to the brain

**Files:**
- Modify: `src/memaide/agent/brain.py:31-41`
- Test: `tests/test_brain.py`

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_brain.py`:

```python
async def test_build_messages_appends_advisory_segment_when_present():
    client = StubClient({"reply_text": "x"})
    brain = AgentBrain(client=client, patient=_patient())
    vision = VisionContext(
        description="A person sits calmly.", label="living room",
        flags=[], advisory_flags=["person_seated", "tv_on"],
    )
    await brain.respond([Turn(role=Role.PATIENT, text="...")], vision=vision)
    joined = " ".join(
        m["content"] for m in client.last_messages if isinstance(m["content"], str)
    )
    assert "Advisory: person_seated, tv_on" in joined


async def test_build_messages_omits_advisory_segment_when_empty():
    client = StubClient({"reply_text": "x"})
    brain = AgentBrain(client=client, patient=_patient())
    vision = VisionContext(description="d", label="l")  # advisory_flags defaults to []
    await brain.respond([Turn(role=Role.PATIENT, text="...")], vision=vision)
    joined = " ".join(
        m["content"] for m in client.last_messages if isinstance(m["content"], str)
    )
    assert "Advisory:" not in joined
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python -m pytest tests/test_brain.py::test_build_messages_appends_advisory_segment_when_present -v`
Expected: FAIL — no `Advisory:` segment in the assembled messages.

- [ ] **Step 3: Add the advisory segment**

In `src/memaide/agent/brain.py`, replace the `if vision is not None:` block in `_build_messages`:

```python
        if vision is not None:
            flags = ", ".join(vision.flags) if vision.flags else "none"
            content = (
                f"[VISION CONTEXT] Scene: {vision.label}. "
                f"{vision.description} Flags: {flags}."
            )
            if vision.advisory_flags:
                content += f" Advisory: {', '.join(vision.advisory_flags)}."
            messages.append({"role": "system", "content": content})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python -m pytest tests/test_brain.py -v`
Expected: PASS (new tests + existing brain tests, including `test_build_messages_appends_vision_context`).

- [ ] **Step 5: Commit**

```bash
git add src/memaide/agent/brain.py tests/test_brain.py
git commit -m "feat(brain): surface vision advisory_flags in the vision context line"
```

---

### Task 5: `FrameSource` protocol + `StubFrameSource`

**Files:**
- Create: `src/memaide/vision/frame_source.py`
- Test: `tests/test_vision_pipeline.py` (new file)

- [ ] **Step 1: Write the failing test**

Create `tests/test_vision_pipeline.py`:

```python
from memaide.vision.frame_source import FrameSource, StubFrameSource


async def test_stub_frame_source_yields_all_frames():
    src = StubFrameSource(["a", "b", "c"])
    out = [f async for f in src.frames()]
    assert out == ["a", "b", "c"]


def test_stub_is_a_frame_source():
    assert isinstance(StubFrameSource([]), FrameSource)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python -m pytest tests/test_vision_pipeline.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'memaide.vision.frame_source'`.

- [ ] **Step 3: Implement the frame source**

Create `src/memaide/vision/frame_source.py`:

```python
"""Pluggable source of camera frames as base64 data-URL strings.

Mirrors the ``VisionCheck`` / ``StubVisionCheck`` seam: ``StubFrameSource`` drives
offline tests now; a ``WebSocketFrameSource`` implements this in Plan B.
"""

from typing import AsyncIterator, Protocol, runtime_checkable


@runtime_checkable
class FrameSource(Protocol):
    def frames(self) -> AsyncIterator[str]:
        """Yield base64 data-URL frame strings."""
        ...


class StubFrameSource:
    """Yields a fixed list of frames, for tests and wiring."""

    def __init__(self, frames: list[str]):
        self._frames = list(frames)

    async def frames(self) -> AsyncIterator[str]:
        for frame in self._frames:
            yield frame
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv\Scripts\python -m pytest tests/test_vision_pipeline.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/memaide/vision/frame_source.py tests/test_vision_pipeline.py
git commit -m "feat(vision): add FrameSource protocol and StubFrameSource"
```

---

### Task 6: `VisionPipeline` (throttled, fault-tolerant)

**Files:**
- Create: `src/memaide/vision/pipeline.py`
- Test: `tests/test_vision_pipeline.py` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_vision_pipeline.py`:

```python
from memaide.schemas import VisionContext
from memaide.vision.pipeline import VisionPipeline


class _FakeDescriber:
    def __init__(self):
        self.calls = []

    async def describe(self, frame):
        self.calls.append(frame)
        return VisionContext(description="d", label="l")


class _RaisingDescriber:
    def __init__(self):
        self.calls = 0

    async def describe(self, frame):
        self.calls += 1
        raise RuntimeError("boom")


def _clock_from(values):
    it = iter(values)
    return lambda: next(it)


async def test_pipeline_throttles_to_one_describe_per_interval():
    describer = _FakeDescriber()
    received = []

    async def sink(ctx):
        received.append(ctx)

    # interval=7: f0 at t=0 describes; f1@1, f2@2 are skipped; f3@10 describes.
    pipeline = VisionPipeline(
        source=StubFrameSource(["f0", "f1", "f2", "f3"]),
        describer=describer,
        sink=sink,
        interval=7.0,
        clock=_clock_from([0.0, 1.0, 2.0, 10.0]),
    )
    await pipeline.run()

    assert describer.calls == ["f0", "f3"]
    assert len(received) == 2


async def test_pipeline_skips_a_failing_describe_without_aborting():
    describer = _RaisingDescriber()
    received = []

    async def sink(ctx):
        received.append(ctx)

    pipeline = VisionPipeline(
        source=StubFrameSource(["only"]),
        describer=describer,
        sink=sink,
        interval=0.0,
        clock=_clock_from([0.0]),
    )
    await pipeline.run()  # must not raise

    assert describer.calls == 1
    assert received == []  # sink never called for the failed frame
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python -m pytest tests/test_vision_pipeline.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'memaide.vision.pipeline'`.

- [ ] **Step 3: Implement the pipeline**

Create `src/memaide/vision/pipeline.py`:

```python
"""Transport-agnostic vision pipeline: throttle frames, describe, push to a sink.

Reusable and fully mockable: a ``FrameSource`` feeds frames, a ``VisionDescriber``
turns each into a ``VisionContext`` at most once per ``interval``, and the result is
awaited on an injected ``sink`` (e.g. "store as latest scene + echo to client").
"""

import logging
import time
from typing import Any, Awaitable, Callable

from memaide import config
from memaide.schemas import VisionContext

_log = logging.getLogger(__name__)


class VisionPipeline:
    def __init__(
        self,
        source: Any,
        describer: Any,
        sink: Callable[[VisionContext], Awaitable[None]],
        interval: float = config.VISION_INTERVAL_SECONDS,
        clock: Callable[[], float] | None = None,
    ):
        self._source = source
        self._describer = describer
        self._sink = sink
        self._interval = interval
        self._clock = clock or time.monotonic
        self._last_at: float | None = None

    async def run(self) -> None:
        async for frame in self._source.frames():
            now = self._clock()
            if self._last_at is not None and (now - self._last_at) < self._interval:
                continue
            self._last_at = now
            try:
                ctx = await self._describer.describe(frame)
            except Exception as exc:  # noqa: BLE001 - one bad frame must not kill the stream
                _log.warning("vision describe failed; skipping frame: %s", exc)
                continue
            await self._sink(ctx)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python -m pytest tests/test_vision_pipeline.py -v`
Expected: PASS (frame-source + pipeline tests).

- [ ] **Step 5: Commit**

```bash
git add src/memaide/vision/pipeline.py tests/test_vision_pipeline.py
git commit -m "feat(vision): add throttled, fault-tolerant VisionPipeline"
```

---

### Task 7: Eval-only `complete_json_with_raw` on `OpenAIClient`

**Files:**
- Modify: `src/memaide/io/openai_client.py` (add one method)
- Test: `tests/test_openai_client.py`

This is an **eval-only** helper that returns the raw response so the eval can read token
`usage`. The runtime `complete_json` path is unchanged.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_openai_client.py`:

```python
async def test_complete_json_with_raw_returns_parsed_and_raw():
    import json as _json
    from memaide.io.openai_client import OpenAIClient

    class _Msg:
        content = _json.dumps({"label": "kitchen"})

    class _Choice:
        message = _Msg()

    class _Resp:
        choices = [_Choice()]
        usage = type("U", (), {"prompt_tokens": 2833, "completion_tokens": 20})()

    class _Completions:
        async def create(self, **kwargs):
            self.kwargs = kwargs
            return _Resp()

    class _Chat:
        completions = _Completions()

    class _SDK:
        chat = _Chat()

    client = OpenAIClient(client=_SDK())
    data, resp = await client.complete_json_with_raw(
        [{"role": "user", "content": "hi"}], model="gpt-4o-mini", temperature=0.2
    )
    assert data == {"label": "kitchen"}
    assert resp.usage.prompt_tokens == 2833
    assert resp.usage.completion_tokens == 20
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python -m pytest tests/test_openai_client.py::test_complete_json_with_raw_returns_parsed_and_raw -v`
Expected: FAIL — `AttributeError: 'OpenAIClient' object has no attribute 'complete_json_with_raw'`.

- [ ] **Step 3: Add the method**

In `src/memaide/io/openai_client.py`, add this method to `OpenAIClient` (after `complete_json`):

```python
    async def complete_json_with_raw(
        self,
        messages: list[dict],
        model: str = config.BRAIN_MODEL,
        temperature: float | None = None,
    ) -> tuple[dict, Any]:
        """Eval-only: like ``complete_json`` but also returns the raw SDK response.

        No retry wrapper — the eval tolerates per-frame failures itself. Lets the
        vision eval read ``resp.usage`` for cost computation.
        """
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "response_format": {"type": "json_object"},
        }
        if temperature is not None and model not in config.FIXED_TEMPERATURE_MODELS:
            kwargs["temperature"] = temperature
        resp = await self._client.chat.completions.create(**kwargs)
        data = json.loads(resp.choices[0].message.content)
        return data, resp
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv\Scripts\python -m pytest tests/test_openai_client.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/memaide/io/openai_client.py tests/test_openai_client.py
git commit -m "feat(io): add eval-only complete_json_with_raw for usage capture"
```

---

### Task 8: Vision-describer eval harness + fixtures dir

**Files:**
- Create: `src/memaide/eval/run_vision_eval.py`
- Create: `src/memaide/eval/vision_frames/README.md`
- Create: `tests/test_run_vision_eval.py`
- Test: `tests/test_run_vision_eval.py`

The harness sweeps every (model, detail) combo over fixture frames, makes **real** API
calls in `main()`, and writes a timestamped run dir under `docs/vision-eval-runs/`. The
test drives it with a fake client (no network) and synthesized temp frames.

- [ ] **Step 1: Create the fixtures directory with a README**

Create `src/memaide/eval/vision_frames/README.md`:

```markdown
# Vision eval frames

Drop representative point-of-view `.jpg` / `.jpeg` / `.png` scenes here (e.g. person
sitting calmly, person on the floor, empty room, kitchen, person holding chest). The
eval harness (`python -m memaide.eval.run_vision_eval`) globs every image in this
directory and runs it through each (model, detail) combo.

Optional: add a sidecar `<name>.json` with `{"expected_label": ..., "expected_flags": [...]}`
for reference (the harness does not require it).

This directory is committed so runs are reproducible; real captured frames can be added
later and are picked up automatically.
```

- [ ] **Step 2: Write the failing test**

Create `tests/test_run_vision_eval.py`:

```python
import base64
import json

from memaide.eval.run_vision_eval import discover_frames, run_eval, to_data_url

# Smallest valid 1x1 PNG (enough to exercise file -> data URL + the mocked describe path).
_PNG_1x1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


class _FakeRawClient:
    """Stands in for OpenAIClient.complete_json_with_raw — no network."""

    def __init__(self):
        self.calls = 0

    async def complete_json_with_raw(self, messages, model="gpt-4o-mini", temperature=None):
        self.calls += 1
        data = {"description": "a kitchen", "label": "kitchen", "flags": ["tv_on"]}

        class _Usage:
            prompt_tokens = 2833
            completion_tokens = 20

        class _Resp:
            usage = _Usage()

        return data, _Resp()


def _make_frames(frames_dir, names):
    frames_dir.mkdir(parents=True, exist_ok=True)
    for name in names:
        (frames_dir / name).write_bytes(_PNG_1x1)


def test_discover_frames_globs_images_and_ignores_others(tmp_path):
    fd = tmp_path / "frames"
    _make_frames(fd, ["b.png", "a.jpg"])
    (fd / "notes.txt").write_text("ignore me", encoding="utf-8")
    found = [p.name for p in discover_frames(fd)]
    assert found == ["a.jpg", "b.png"]  # sorted, images only


def test_to_data_url_encodes_mime_and_base64(tmp_path):
    fd = tmp_path / "frames"
    _make_frames(fd, ["a.png"])
    url = to_data_url(fd / "a.png")
    assert url.startswith("data:image/png;base64,")


async def test_run_eval_sweeps_matrix_and_writes_outputs(tmp_path, monkeypatch):
    from memaide import config

    # Shrink the matrix to keep the test small and deterministic.
    monkeypatch.setattr(config, "VISION_EVAL_MODELS", ["gpt-4o-mini", "gpt-5.4-mini"])
    monkeypatch.setattr(config, "VISION_EVAL_DETAILS", ["low"])

    frames_dir = tmp_path / "frames"
    _make_frames(frames_dir, ["0001.png", "0002.png"])
    run_dir = tmp_path / "run"
    run_dir.mkdir()

    manifest = await run_eval(_FakeRawClient(), run_dir, frames_dir=frames_dir)

    # Per-combo outputs exist and frames were copied in.
    for model in ["gpt-4o-mini", "gpt-5.4-mini"]:
        combo = run_dir / model / "low"
        assert (combo / "results.json").exists()
        assert (combo / "results.md").exists()
        assert (combo / "frames" / "0001_0001.png").exists()
        rows = json.loads((combo / "results.json").read_text(encoding="utf-8"))
        assert len(rows) == 2
        # cost = 2833*in + 20*out for this model
        price = config.VISION_PRICING[model]
        expected = round(2833 * price["in"] + 20 * price["out"], 6)
        assert rows[0]["cost_usd"] == expected
        assert rows[0]["advisory_flags"] == ["tv_on"]

    # Top-level artifacts.
    assert (run_dir / "comparison.md").exists()
    assert manifest["num_frames"] == 2
    assert len(manifest["combos"]) == 2  # 2 models x 1 detail
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `.venv\Scripts\python -m pytest tests/test_run_vision_eval.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'memaide.eval.run_vision_eval'`.

- [ ] **Step 4: Implement the harness**

Create `src/memaide/eval/run_vision_eval.py`:

```python
"""Vision-describer eval: sweep (model x detail) over fixture frames, export results.

Export-only and mirrors run_eval.py. ``main()`` makes REAL OpenAI calls (needs
OPENAI_API_KEY and access to every model in VISION_EVAL_MODELS) and writes a timestamped
run dir under docs/vision-eval-runs/. Drop frames into
src/memaide/eval/vision_frames/ (any .jpg/.jpeg/.png); the harness globs them.

Run: python -m memaide.eval.run_vision_eval
"""

import asyncio
import base64
import json
import shutil
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from memaide import config
from memaide.io.openai_client import OpenAIClient
from memaide.vision.describer import VisionDescriber

VISION_FRAMES_DIR = Path(__file__).parent / "vision_frames"
VISION_EVAL_RUNS_DIR = Path("docs/vision-eval-runs")
_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}
_MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}


class FrameRecord(BaseModel):
    filename: str
    description: str
    label: str
    advisory_flags: list[str]
    latency_s: float
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float


class _UsageRecordingClient:
    """Wraps a client so the describer's complete_json call also exposes token usage."""

    def __init__(self, client: Any):
        self._client = client
        self.last_usage: Any = None

    async def complete_json(self, messages, model=config.VISION_MODEL, temperature=None):
        data, resp = await self._client.complete_json_with_raw(
            messages, model=model, temperature=temperature
        )
        self.last_usage = getattr(resp, "usage", None)
        return data


def discover_frames(frames_dir: Path = VISION_FRAMES_DIR) -> list[Path]:
    if not frames_dir.exists():
        return []
    return sorted(
        p for p in frames_dir.iterdir()
        if p.is_file() and p.suffix.lower() in _IMAGE_SUFFIXES
    )


def to_data_url(path: Path) -> str:
    mime = _MIME[path.suffix.lower()]
    b64 = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{b64}"


def _cost_usd(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    pricing = config.VISION_PRICING.get(model, {"in": 0.0, "out": 0.0})
    return prompt_tokens * pricing["in"] + completion_tokens * pricing["out"]


async def run_combo(
    model: str, detail: str, frames: list[Path], client: Any, run_dir: Path
) -> list[FrameRecord]:
    recorder = _UsageRecordingClient(client)
    describer = VisionDescriber(client=recorder, model=model, detail=detail)
    combo_dir = run_dir / model / detail
    frames_out = combo_dir / "frames"
    frames_out.mkdir(parents=True, exist_ok=True)

    records: list[FrameRecord] = []
    for i, path in enumerate(frames, start=1):
        saved_name = f"{i:04d}_{path.name}"
        shutil.copyfile(path, frames_out / saved_name)
        start = time.monotonic()
        ctx = await describer.describe(to_data_url(path))
        latency = time.monotonic() - start
        usage = recorder.last_usage
        prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
        completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
        records.append(
            FrameRecord(
                filename=saved_name,
                description=ctx.description,
                label=ctx.label,
                advisory_flags=ctx.advisory_flags,
                latency_s=round(latency, 3),
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                cost_usd=round(_cost_usd(model, prompt_tokens, completion_tokens), 6),
            )
        )
    _write_combo(combo_dir, model, detail, records)
    return records


def _write_combo(
    combo_dir: Path, model: str, detail: str, records: list[FrameRecord]
) -> None:
    (combo_dir / "results.json").write_text(
        json.dumps([r.model_dump() for r in records], indent=2), encoding="utf-8"
    )
    lines = [f"# {model} @ detail={detail}", ""]
    for r in records:
        adv = ", ".join(r.advisory_flags) or "none"
        lines += [
            f"## {r.filename}",
            "",
            f"![{r.filename}](frames/{r.filename})",
            "",
            f"- **label:** {r.label}",
            f"- **description:** {r.description}",
            f"- **advisory_flags:** {adv}",
            f"- **latency:** {r.latency_s}s | **tokens:** {r.prompt_tokens} in / "
            f"{r.completion_tokens} out | **cost:** ${r.cost_usd}",
            "",
        ]
    (combo_dir / "results.md").write_text("\n".join(lines), encoding="utf-8")


def _write_comparison(
    run_dir: Path,
    frames: list[Path],
    combos: list[tuple[str, str]],
    by_combo: dict[tuple[str, str], list[FrameRecord]],
) -> None:
    ref_model, ref_detail = combos[0]
    lines = ["# Vision describer comparison (by image)", ""]
    for i, path in enumerate(frames, start=1):
        saved_name = f"{i:04d}_{path.name}"
        lines += [
            f"## {saved_name}",
            "",
            f"![{saved_name}]({ref_model}/{ref_detail}/frames/{saved_name})",
            "",
            "| model | detail | label | description | advisory_flags | cost |",
            "|---|---|---|---|---|---|",
        ]
        for (model, detail) in combos:
            r = by_combo[(model, detail)][i - 1]
            adv = ", ".join(r.advisory_flags) or "none"
            desc = r.description.replace("|", "\\|")
            lines.append(
                f"| {model} | {detail} | {r.label} | {desc} | {adv} | ${r.cost_usd} |"
            )
        lines.append("")
    (run_dir / "comparison.md").write_text("\n".join(lines), encoding="utf-8")


async def run_eval(
    client: Any, run_dir: Path, frames_dir: Path = VISION_FRAMES_DIR
) -> dict:
    frames = discover_frames(frames_dir)
    combos = [
        (m, d) for m in config.VISION_EVAL_MODELS for d in config.VISION_EVAL_DETAILS
    ]
    by_combo: dict[tuple[str, str], list[FrameRecord]] = {}
    aggregates = []
    for (model, detail) in combos:
        records = await run_combo(model, detail, frames, client, run_dir)
        by_combo[(model, detail)] = records
        total_cost = round(sum(r.cost_usd for r in records), 6)
        mean_latency = (
            round(sum(r.latency_s for r in records) / len(records), 3) if records else 0.0
        )
        aggregates.append(
            {
                "model": model,
                "detail": detail,
                "total_cost_usd": total_cost,
                "mean_latency_s": mean_latency,
            }
        )
    if frames:
        _write_comparison(run_dir, frames, combos, by_combo)
    manifest = {
        "models": config.VISION_EVAL_MODELS,
        "details": config.VISION_EVAL_DETAILS,
        "num_frames": len(frames),
        "combos": aggregates,
    }
    (run_dir / "run.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


async def main() -> None:
    frames = discover_frames()
    if not frames:
        print(
            f"No frames found in {VISION_FRAMES_DIR}. "
            "Drop .jpg/.jpeg/.png scenes there first."
        )
        return
    client = OpenAIClient()
    run_id = datetime.now().strftime("run-%Y%m%d-%H%M%S")
    run_dir = VISION_EVAL_RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    print(f"Vision eval run: {run_id}\nFrames: {len(frames)}  ->  {run_dir}")

    manifest = await run_eval(client, run_dir)
    for combo in manifest["combos"]:
        print(
            f"  {combo['model']:<14} {combo['detail']:<5} "
            f"cost=${combo['total_cost_usd']:<10} mean_latency={combo['mean_latency_s']}s"
        )
    print(f"\nComparison: {run_dir / 'comparison.md'}")


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `.venv\Scripts\python -m pytest tests/test_run_vision_eval.py -v`
Expected: PASS (discover, data-url, and full sweep tests).

- [ ] **Step 6: Commit**

```bash
git add src/memaide/eval/run_vision_eval.py src/memaide/eval/vision_frames/README.md tests/test_run_vision_eval.py
git commit -m "feat(eval): add vision-describer (model x detail) eval harness"
```

---

### Task 9: Documentation

**Files:**
- Modify: `docs/architecture.md`
- Modify: `README.md`

- [ ] **Step 1: Update architecture doc**

In `docs/architecture.md`, add a section describing the M2 vision pipeline. Insert (find the vision section or append a new one near the existing vision/M2 content):

```markdown
## Vision pipeline (M2)

Frames arrive as base64 data-URL strings from a `FrameSource`
(`vision/frame_source.py`; `StubFrameSource` for tests, a WebSocket source in the
audio/live-media increment). `VisionPipeline` (`vision/pipeline.py`) throttles to one
describe per `VISION_INTERVAL_SECONDS`, calls `VisionDescriber.describe()`
(`vision/describer.py`, gpt-4o-mini at `VISION_DETAIL`), and awaits an injected `sink`
with each `VisionContext`. A failing describe is logged and skipped — one bad frame
never kills the stream.

Describer flags are **advisory only**: they land in `VisionContext.advisory_flags`,
kept separate from the rule-based `flags` that drive deterministic escalation, so a
hallucinated `person_on_floor` can never fire safety logic. The brain surfaces them as
an `Advisory:` segment on the `[VISION CONTEXT]` line.

### Vision-describer eval

`python -m memaide.eval.run_vision_eval` sweeps every (`VISION_EVAL_MODELS` x
`VISION_EVAL_DETAILS`) combo over the frames in `src/memaide/eval/vision_frames/`,
making real API calls, and writes a timestamped run under `docs/vision-eval-runs/`
(per-combo `results.json`/`results.md` with copied frames, a top-level `comparison.md`
grouped by image, and a `run.json` manifest with per-combo cost + mean latency). Drop
representative `.jpg`/`.png` scenes into the frames dir; the harness globs them.
```

- [ ] **Step 2: Update README**

In `README.md`, add to the usage/eval section:

```markdown
### Vision-describer eval

Add point-of-view frames (`.jpg`/`.jpeg`/`.png`) to `src/memaide/eval/vision_frames/`,
then run:

```powershell
.venv\Scripts\python -m memaide.eval.run_vision_eval
```

This sweeps gpt-4o-mini and gpt-5.4-mini at `low` and `high` image detail over every
frame and writes a comparison run under `docs/vision-eval-runs/<run-id>/` (open
`comparison.md` to see each image next to all four models' description/label/flags and
cost). Needs `OPENAI_API_KEY` and access to both models; a handful of frames is a few
cents per run.
```

- [ ] **Step 3: Commit**

```bash
git add docs/architecture.md README.md
git commit -m "docs: document the M2 vision pipeline and describer eval"
```

---

### Task 10: Full suite green + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `.venv\Scripts\python -m pytest -q`
Expected: all tests pass (the prior 50 M1 tests + the new vision/pipeline/describer/eval/config/schema tests). No failures, no errors.

- [ ] **Step 2 (optional, requires OPENAI_API_KEY + a real frame): smoke the eval**

Drop one real `.jpg` into `src/memaide/eval/vision_frames/`, then:

Run: `.venv\Scripts\python -m memaide.eval.run_vision_eval`
Expected: a new `docs/vision-eval-runs/run-<timestamp>/` with `comparison.md`, `run.json`, and per-combo `results.md` whose embedded image renders next to a plausible description. Inspect `comparison.md` to make the model/detail decision (the spec's open decision).

- [ ] **Step 3: Final commit (only if a real frame was added)**

```bash
git add src/memaide/eval/vision_frames docs/vision-eval-runs
git commit -m "chore(eval): add vision fixture frame(s) and first describer run"
```

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-06-18-vision-context-rayban-ingestion-design.md`, vision portions):
- VisionDescriber (component 1) → Task 3. ✅ model/detail constructor params, base64 data URL input, strict-JSON system prompt, image_url part with `detail`, maps to `advisory_flags`.
- FrameSource (component 2) → Task 5. ✅ runtime_checkable Protocol + StubFrameSource.
- VisionPipeline (component 3) → Task 6. ✅ throttle to interval, sink per context, failing describe skipped, injectable clock.
- Vision-describer eval (component 8) → Tasks 7+8. ✅ (model×detail) sweep, fixture glob, per-frame record (filename, VisionContext, latency, usage, cost), output layout (per-combo frames/ + results.json/md, top-level comparison.md + run.json), usage via eval-only client variant.
- Schema change (`advisory_flags`) → Task 1. ✅ additive, default empty, `flags` unchanged.
- Brain advisory segment (other edits) → Task 4. ✅
- Config additions (`VISION_DETAIL`, eval models/details, `VISION_PRICING`) → Task 2. ✅ (`VISION_INTERVAL_SECONDS` already existed; not duplicated.)
- Docs (architecture.md, README) → Task 9. ✅
- **Deferred to Plan B (audio/live media):** STT, TTS, `on_silence_tick`, voice loop, WebSocket server, `websockets` dep, audio config. These are explicitly out of this plan's scope.

**Placeholder scan:** No TBD/TODO/"add error handling" placeholders — every code step shows complete code; the only "optional" steps (Task 10 smoke, fixture frame) require a real image the plan cannot synthesize and are clearly marked optional.

**Type consistency:** `VisionDescriber(client=..., model=..., detail=...)` used identically in Tasks 3, 8. `complete_json(messages, model=, temperature=)` matches the existing client and the `_UsageRecordingClient` wrapper. `complete_json_with_raw(messages, model=, temperature=) -> (dict, resp)` defined in Task 7, consumed in Task 8. `VisionContext(description, label, flags, advisory_flags)` consistent across Tasks 1, 3, 4, 6, 8. `FrameRecord` fields match between the model definition, `_write_combo`, `_write_comparison`, and the test assertions.
