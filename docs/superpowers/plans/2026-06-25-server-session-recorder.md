# Server Session Recorder + Vision Interval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save every inbound video frame per session to disk on the server, and have the brain consume a frame every 2 s instead of 7 s.

**Architecture:** A new `SessionRecorder` seam (Protocol) with a no-op default (`NullSessionRecorder`) so recording is **opt-in** and never affects the existing vision/voice tasks; a `FileSessionRecorder` writes one JPEG per frame plus a `manifest.json`. It is injected via `ServerDeps` (a per-session factory) and called from `handle()` alongside the existing frame demux. The vision sampling change is a one-line `config` constant edit.

**Tech Stack:** Python 3, asyncio, pytest (async auto-mode), stdlib `base64`/`json`/`pathlib`.

---

## File Structure

- **Create:** `src/memaide/server/recorder.py` — `SessionRecorder` Protocol, `NullSessionRecorder`, `FileSessionRecorder`.
- **Create:** `tests/test_recorder.py` — unit tests for the recorders.
- **Modify:** `src/memaide/config.py` — `VISION_INTERVAL_SECONDS` 7→2; add `RECORDINGS_DIR`.
- **Modify:** `src/memaide/server/ws.py` — add `make_recorder` to `ServerDeps`; call recorder in `handle()`.
- **Modify:** `tests/test_config.py` — assert the new interval + `RECORDINGS_DIR`.
- **Modify:** `tests/test_ws.py` — assert frames are recorded through `handle()`.
- **Modify:** `.gitignore` — ignore the `recordings/` output dir.
- **Modify:** `docs/cost-analysis.md` — update the vision-frame row for the 2 s interval.

---

## Task 1: Config — 2 s interval + recordings dir

**Files:**
- Modify: `src/memaide/config.py:48` and the Vision section
- Test: `tests/test_config.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_config.py`:

```python
def test_vision_interval_and_recordings_dir():
    assert config.VISION_INTERVAL_SECONDS == 2.0
    assert config.RECORDINGS_DIR == "recordings"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python -m pytest tests/test_config.py::test_vision_interval_and_recordings_dir -v`
Expected: FAIL — `VISION_INTERVAL_SECONDS == 7.0` (assert 7.0 == 2.0) / `RECORDINGS_DIR` missing (AttributeError).

- [ ] **Step 3: Make the changes**

In `src/memaide/config.py`, change line 48:

```python
VISION_INTERVAL_SECONDS = 2.0  # brain consumes one described frame every 2s (was 7s)
```

And add to the WebSocket section (after `WS_PORT = 8765`):

```python
# Directory for per-session frame recordings (opt-in via a FileSessionRecorder).
RECORDINGS_DIR = "recordings"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv\Scripts\python -m pytest tests/test_config.py -v`
Expected: PASS (all config tests).

- [ ] **Step 5: Commit**

```bash
git add src/memaide/config.py tests/test_config.py
git commit -m "feat(config): sample vision every 2s; add RECORDINGS_DIR"
```

---

## Task 2: `SessionRecorder` module

**Files:**
- Create: `src/memaide/server/recorder.py`
- Test: `tests/test_recorder.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_recorder.py`:

```python
import base64
import json

from memaide.server.recorder import (
    FileSessionRecorder,
    NullSessionRecorder,
    SessionRecorder,
)


def _data_url(raw: bytes) -> str:
    return "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii")


def test_null_and_file_are_session_recorders():
    assert isinstance(NullSessionRecorder(), SessionRecorder)
    assert isinstance(FileSessionRecorder("s1", "."), SessionRecorder)


async def test_null_recorder_writes_nothing(tmp_path):
    rec = NullSessionRecorder()
    await rec.write(_data_url(b"ABC"))
    await rec.close()
    assert list(tmp_path.iterdir()) == []


async def test_file_recorder_writes_frames_and_manifest(tmp_path):
    rec = FileSessionRecorder("s1", tmp_path, clock=_clock_from([1.0, 2.0]))
    await rec.write(_data_url(b"one"))
    await rec.write(_data_url(b"two"))
    await rec.close()

    session_dir = tmp_path / "s1"
    jpgs = sorted(p.name for p in session_dir.glob("*.jpg"))
    assert jpgs == ["000000-1.000.jpg", "000001-2.000.jpg"]
    assert (session_dir / "000000-1.000.jpg").read_bytes() == b"one"

    manifest = json.loads((session_dir / "manifest.json").read_text())
    assert manifest == [
        {"seq": 0, "ts": 1.0, "file": "000000-1.000.jpg"},
        {"seq": 1, "ts": 2.0, "file": "000001-2.000.jpg"},
    ]


async def test_file_recorder_accepts_raw_base64_without_data_url(tmp_path):
    rec = FileSessionRecorder("s2", tmp_path, clock=_clock_from([5.0]))
    await rec.write(base64.b64encode(b"raw").decode("ascii"))
    await rec.close()
    assert (tmp_path / "s2" / "000000-5.000.jpg").read_bytes() == b"raw"


async def test_file_recorder_skips_bad_base64(tmp_path):
    rec = FileSessionRecorder("s3", tmp_path, clock=_clock_from([1.0, 2.0]))
    await rec.write("data:image/jpeg;base64,!!!not-base64!!!")  # skipped
    await rec.write(_data_url(b"good"))
    await rec.close()

    session_dir = tmp_path / "s3"
    jpgs = sorted(p.name for p in session_dir.glob("*.jpg"))
    assert jpgs == ["000000-2.000.jpg"]  # seq did not advance on the bad frame


async def test_file_recorder_no_manifest_when_no_frames(tmp_path):
    rec = FileSessionRecorder("s4", tmp_path)
    await rec.close()
    assert not (tmp_path / "s4").exists()


def _clock_from(values):
    it = iter(values)
    return lambda: next(it)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python -m pytest tests/test_recorder.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'memaide.server.recorder'`.

- [ ] **Step 3: Write the implementation**

Create `src/memaide/server/recorder.py`:

```python
"""Per-session recorder: persists every inbound video frame to disk for later review.

A seam (``SessionRecorder`` Protocol) with a no-op default so recording is opt-in and
never affects the vision/voice tasks. ``FileSessionRecorder`` decodes the data-URL JPEG
payload and writes one file per frame (``<seq>-<ts>.jpg``) plus an ordered ``manifest.json``
written on close. All I/O errors and bad payloads are logged and skipped, never raised, so
recording can't take down a connection.
"""

import base64
import json
import logging
import time
from pathlib import Path
from typing import Callable, Protocol, runtime_checkable

_log = logging.getLogger(__name__)


@runtime_checkable
class SessionRecorder(Protocol):
    async def write(self, data_url: str) -> None: ...
    async def close(self) -> None: ...


class NullSessionRecorder:
    """Default no-op recorder: recording is opt-in (inject a FileSessionRecorder to enable)."""

    async def write(self, data_url: str) -> None:
        return None

    async def close(self) -> None:
        return None


class FileSessionRecorder:
    """Saves frames to ``<root>/<session_id>/<seq>-<ts>.jpg`` + ``manifest.json`` on close."""

    def __init__(
        self,
        session_id: str,
        root: str | Path,
        clock: Callable[[], float] | None = None,
    ) -> None:
        self._dir = Path(root) / session_id
        self._clock = clock or time.time
        self._seq = 0
        self._entries: list[dict] = []
        self._dir_made = False

    def _ensure_dir(self) -> None:
        if not self._dir_made:
            self._dir.mkdir(parents=True, exist_ok=True)
            self._dir_made = True

    @staticmethod
    def _decode(data_url: str) -> bytes:
        payload = data_url.split(",", 1)[1] if "," in data_url else data_url
        return base64.b64decode(payload, validate=True)

    async def write(self, data_url: str) -> None:
        try:
            jpeg = self._decode(data_url)
        except Exception as exc:  # noqa: BLE001 - bad payload -> skip the frame
            _log.warning("recorder: bad frame payload, skipping: %s", exc)
            return
        ts = self._clock()
        name = f"{self._seq:06d}-{ts:.3f}.jpg"
        try:
            self._ensure_dir()
            (self._dir / name).write_bytes(jpeg)
        except OSError as exc:
            _log.warning("recorder: frame write failed, skipping: %s", exc)
            return
        self._entries.append({"seq": self._seq, "ts": ts, "file": name})
        self._seq += 1

    async def close(self) -> None:
        if not self._entries:
            return
        try:
            self._ensure_dir()
            (self._dir / "manifest.json").write_text(json.dumps(self._entries, indent=2))
        except OSError as exc:
            _log.warning("recorder: manifest write failed: %s", exc)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python -m pytest tests/test_recorder.py -v`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/memaide/server/recorder.py tests/test_recorder.py
git commit -m "feat(server): add SessionRecorder (null + file)"
```

---

## Task 3: Wire the recorder into `ServerDeps` + `handle()`

**Files:**
- Modify: `src/memaide/server/ws.py:30-39` (`ServerDeps`), `:117-173` (`handle`)
- Test: `tests/test_ws.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_ws.py` (top-level imports already include `base64`, `json`):

```python
async def test_handle_records_frames_through_recorder(tmp_path):
    from memaide.server.recorder import FileSessionRecorder

    ws = FakeWS([_hello(), _frame(), json.dumps({"type": "bye"})])
    await handle(
        ws,
        _deps(make_recorder=lambda sid: FileSessionRecorder(sid, tmp_path)),
    )

    session_dir = tmp_path / "s1"
    jpgs = list(session_dir.glob("*.jpg"))
    assert len(jpgs) == 1
    assert jpgs[0].read_bytes() == b"ABC"  # _frame() payload is base64 of "ABC"
    assert (session_dir / "manifest.json").exists()


async def test_handle_defaults_to_no_recording(tmp_path):
    ws = FakeWS([_hello(), _frame(), json.dumps({"type": "bye"})])
    await handle(ws, _deps())  # default NullSessionRecorder
    assert list(tmp_path.iterdir()) == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python -m pytest tests/test_ws.py::test_handle_records_frames_through_recorder -v`
Expected: FAIL — `ServerDeps.__init__() got an unexpected keyword argument 'make_recorder'`.

- [ ] **Step 3: Add `make_recorder` to `ServerDeps`**

In `src/memaide/server/ws.py`, update the imports near the top:

```python
from memaide.server.recorder import NullSessionRecorder, SessionRecorder
```

Then in the `ServerDeps` dataclass, add the field (after `interval`):

```python
    make_recorder: Callable[[str], SessionRecorder] = (
        lambda session_id: NullSessionRecorder()
    )
```

- [ ] **Step 4: Call the recorder in `handle()`**

In `handle()`, right after the `session = AgentSession(...)` block, construct the recorder:

```python
    recorder = deps.make_recorder(session_id or "unknown")
```

In the inbound loop, update the `frame` branch to also record:

```python
            if mtype == "frame" and isinstance(msg.get("data_url"), str):
                await recorder.write(msg["data_url"])
                await frame_source.put(msg["data_url"])
```

In the `finally:` block, close the recorder alongside the sources:

```python
    finally:
        await frame_source.close()
        await audio_source.close()
        await recorder.close()
        await asyncio.gather(vision_task, voice_task, return_exceptions=True)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `.venv\Scripts\python -m pytest tests/test_ws.py -v`
Expected: PASS (all ws tests, including the two new ones).

- [ ] **Step 6: Commit**

```bash
git add src/memaide/server/ws.py tests/test_ws.py
git commit -m "feat(server): record inbound frames via injected SessionRecorder"
```

---

## Task 4: Ignore recordings output + update cost doc

**Files:**
- Modify: `.gitignore`
- Modify: `docs/cost-analysis.md:31`

- [ ] **Step 1: Ignore the recordings directory**

Append to `.gitignore`:

```gitignore
# Per-session frame recordings (FileSessionRecorder output)
recordings/
```

- [ ] **Step 2: Update the cost-analysis vision row**

In `docs/cost-analysis.md`, the vision-frame row currently reads:

```markdown
| Vision frames | 42 | `VISION_INTERVAL_SECONDS = 7` → 300 / 7 |
```

Replace the count and formula for the 2 s interval (300 s session / 2 s):

```markdown
| Vision frames | 150 | `VISION_INTERVAL_SECONDS = 2` → 300 / 2 |
```

Then recompute any total in that table that summed the old 42-frame number, and add a one-line note under the table:

```markdown
> Vision sampling moved 7s → 2s (2026-06-25) for fresher scene context; ~3.5× more
> describe calls. The full ~2 fps frame stream is also recorded to disk (see SessionRecorder).
```

- [ ] **Step 3: Verify the whole suite is green**

Run: `.venv\Scripts\python -m pytest -q`
Expected: PASS — all prior tests plus the new recorder/config/ws tests.

- [ ] **Step 4: Commit**

```bash
git add .gitignore docs/cost-analysis.md
git commit -m "chore: ignore recordings/; update cost analysis for 2s vision"
```

---

## Enabling recording (for the README / operator)

Recording is **off by default** (`NullSessionRecorder`). To turn it on when building real
deps for `serve()`:

```python
from pathlib import Path
from memaide import config
from memaide.server.recorder import FileSessionRecorder

deps = ServerDeps(
    describer=..., stt=..., tts=..., make_brain=...,
    make_recorder=lambda sid: FileSessionRecorder(sid, Path(config.RECORDINGS_DIR)),
)
```

---

## Self-Review

- **Spec coverage:** `SessionRecorder` saving inbound video frames → Tasks 2–3 ✅. JPEGs +
  manifest, video-only, bad-base64 skip, I/O tolerated → Task 2 tests ✅. Injectable seam,
  off by default → `ServerDeps.make_recorder` default `NullSessionRecorder` (Task 3) ✅.
  `VISION_INTERVAL_SECONDS` 7→2 → Task 1 ✅. Cost note (~3.5×) → Task 4 ✅.
- **Open question resolved:** recording is **opt-in / off by default** (Null), enabled by
  injecting `FileSessionRecorder`.
- **Placeholder scan:** none — all steps carry concrete code/commands.
- **Type consistency:** `SessionRecorder.write(data_url)` / `close()`, `make_recorder(session_id)`,
  `FileSessionRecorder(session_id, root, clock=)` used identically across Tasks 2–3.
