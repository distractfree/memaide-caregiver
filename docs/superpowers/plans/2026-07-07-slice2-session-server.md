# Slice 2 Session Server (Voice/Vision Live Session) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Python side of Slice 2 — my server owns the live voice/vision WebSocket session, correlates it with patient context POSTed by koko, and reports escalation (real-time) and the transcript (on conclude) back to koko.

**Architecture:** One asyncio process runs two listeners sharing an in-memory `SessionRegistry`: the FastAPI app on `:8080` (adds `POST /session/start`) and the existing `websockets` media server on `:8765`. `/session/start` stashes context keyed by `session_id`; the WebSocket `hello {session_id}` waits for it (buffer-and-wait, ~10s). A `KokoReporter` seam POSTs escalation the instant it fires (once) and the `SessionRecord` + `outcome` on session end.

**Tech Stack:** Python, FastAPI/uvicorn, `websockets`, httpx, pydantic, pytest (async auto mode).

---

## File Structure

- **Create** `src/memaide/service/session_registry.py` — `SessionContext` dataclass + `SessionRegistry` (buffer-and-wait correlation, orphan drop).
- **Create** `src/memaide/service/session.py` — `register_session(req, registry)` (builds `SessionContext`, reuses `_to_patient_context`).
- **Create** `src/memaide/service/koko_reporter.py` — `KokoReporter` (outbound escalation/conclude POSTs; no-op when unconfigured).
- **Create** `scripts/run_session_server.py` — combined one-process/two-listener entry point + `build_components()`.
- **Modify** `src/memaide/schemas.py` — add `HandoffType.PATIENT_ENDED`.
- **Modify** `src/memaide/service/schemas.py` — add `SessionStartRequest`.
- **Modify** `src/memaide/service/app.py` — add `registry` to `ServiceDeps`; add `POST /session/start`.
- **Modify** `src/memaide/config.py` — add `KOKO_BASE_URL`, `KOKO_API_KEY`.
- **Modify** `src/memaide/server/voice_loop.py` — add `on_escalation` edge-triggered callback.
- **Modify** `src/memaide/server/ws.py` — add `registry`/`reporter` to `ServerDeps`; correlate `hello` by `session_id`; add conclude flow.
- **Modify** `README.md` — document `KOKO_BASE_URL` / `KOKO_API_KEY`.
- **Tests:** `tests/test_session_registry.py`, `tests/test_service_session.py`, `tests/test_koko_reporter.py`, extend `tests/test_voice_loop.py`, extend `tests/test_ws.py`, `tests/test_run_session_server.py`.

Run the whole suite with: `python -m pytest -q`

---

### Task 1: Add `PATIENT_ENDED` handoff type

**Files:**
- Modify: `src/memaide/schemas.py:19-22`
- Test: `tests/test_schemas.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_schemas.py`:

```python
def test_handoff_type_has_patient_ended():
    from memaide.schemas import HandoffType

    assert HandoffType.PATIENT_ENDED.value == "patient_ended"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_schemas.py::test_handoff_type_has_patient_ended -v`
Expected: FAIL with `AttributeError: PATIENT_ENDED`

- [ ] **Step 3: Add the enum value**

In `src/memaide/schemas.py`, change the `HandoffType` enum:

```python
class HandoffType(str, Enum):
    CAREGIVER_JOINED = "caregiver_joined"
    TIMEOUT = "timeout"
    PATIENT_RESOLVED = "patient_resolved"
    PATIENT_ENDED = "patient_ended"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_schemas.py::test_handoff_type_has_patient_ended -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/memaide/schemas.py tests/test_schemas.py
git commit -m "feat: add PATIENT_ENDED handoff type for deliberate session stop"
```

---

### Task 2: `SessionRegistry` + `SessionContext`

**Files:**
- Create: `src/memaide/service/session_registry.py`
- Test: `tests/test_session_registry.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_session_registry.py`:

```python
import asyncio

from memaide.schemas import PatientContext
from memaide.service.session_registry import SessionContext, SessionRegistry


def _ctx(sid="s1"):
    return SessionContext(
        session_id=sid, patient=PatientContext(patient_id="p1", name="Rose")
    )


async def test_context_first_then_wait_returns_it():
    reg = SessionRegistry()
    reg.put_context("s1", _ctx())
    got = await reg.wait_context("s1", timeout=0.1)
    assert got.patient.name == "Rose"


async def test_wait_first_then_context_arrives():
    reg = SessionRegistry()

    async def late_put():
        await asyncio.sleep(0.01)
        reg.put_context("s1", _ctx())

    waiter = asyncio.create_task(reg.wait_context("s1", timeout=0.5))
    await late_put()
    got = await waiter
    assert got.session_id == "s1"


async def test_wait_times_out_returns_none():
    reg = SessionRegistry()
    got = await reg.wait_context("missing", timeout=0.05)
    assert got is None


async def test_drop_removes_context_and_event():
    reg = SessionRegistry()
    reg.put_context("s1", _ctx())
    reg.drop("s1")
    got = await reg.wait_context("s1", timeout=0.05)
    assert got is None


async def test_default_timeout_is_used_when_none_passed():
    reg = SessionRegistry(wait_timeout=0.05)
    got = await reg.wait_context("missing")
    assert got is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_session_registry.py -v`
Expected: FAIL with `ModuleNotFoundError: memaide.service.session_registry`

- [ ] **Step 3: Implement the registry**

Create `src/memaide/service/session_registry.py`:

```python
"""In-memory correlation between koko's context POST and the media WebSocket.

`/session/start` calls `put_context(session_id, ctx)`; the WebSocket `hello` calls
`wait_context(session_id)`. The per-session `asyncio.Event` is created on demand by
whichever side arrives first, so arrival order does not matter. `drop` clears a session
on conclude (or via a periodic sweep for a context whose WebSocket never connected).
"""

import asyncio
from dataclasses import dataclass, field
from typing import Any

from memaide.schemas import PatientContext


@dataclass
class SessionContext:
    session_id: str
    patient: PatientContext
    vitals: Any = None
    beacons: list = field(default_factory=list)


class SessionRegistry:
    def __init__(self, wait_timeout: float = 10.0):
        self._ctx: dict[str, SessionContext] = {}
        self._ready: dict[str, asyncio.Event] = {}
        self._wait_timeout = wait_timeout

    def _event(self, sid: str) -> asyncio.Event:
        return self._ready.setdefault(sid, asyncio.Event())

    def put_context(self, sid: str, ctx: SessionContext) -> None:
        self._ctx[sid] = ctx
        self._event(sid).set()

    async def wait_context(
        self, sid: str, timeout: float | None = None
    ) -> SessionContext | None:
        t = self._wait_timeout if timeout is None else timeout
        try:
            await asyncio.wait_for(self._event(sid).wait(), t)
        except asyncio.TimeoutError:
            return None
        return self._ctx.get(sid)

    def drop(self, sid: str) -> None:
        self._ctx.pop(sid, None)
        self._ready.pop(sid, None)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_session_registry.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add src/memaide/service/session_registry.py tests/test_session_registry.py
git commit -m "feat: SessionRegistry for buffer-and-wait session correlation"
```

---

### Task 3: `SessionStartRequest` schema

**Files:**
- Modify: `src/memaide/service/schemas.py` (append after `InferResponse`)
- Test: `tests/test_service_schemas.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_service_schemas.py`:

```python
def test_session_start_request_parses_minimal_and_full():
    from memaide.service.schemas import SessionStartRequest

    minimal = SessionStartRequest(
        session_id="s1", patient={"patient_id": "p1", "name": "Rose"}
    )
    assert minimal.session_id == "s1"
    assert minimal.beacons == []
    assert minimal.vitals is None

    full = SessionStartRequest(
        session_id="s2",
        patient={"patient_id": "p1", "name": "Rose"},
        vitals={"heart_rate": 88},
        beacons=[{"room": "kitchen"}],
    )
    assert full.vitals.heart_rate == 88
    assert full.beacons[0].room == "kitchen"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_service_schemas.py::test_session_start_request_parses_minimal_and_full -v`
Expected: FAIL with `ImportError: cannot import name 'SessionStartRequest'`

- [ ] **Step 3: Add the schema**

Append to `src/memaide/service/schemas.py` (reuses `InferPatient`, `Vitals`, `BeaconEvent` already defined in this file):

```python
class SessionStartRequest(BaseModel):
    session_id: str
    patient: InferPatient
    vitals: Vitals | None = None
    beacons: list[BeaconEvent] = Field(default_factory=list)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_service_schemas.py::test_session_start_request_parses_minimal_and_full -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/memaide/service/schemas.py tests/test_service_schemas.py
git commit -m "feat: SessionStartRequest schema for /session/start"
```

---

### Task 4: `POST /session/start` route + registry in `ServiceDeps`

**Files:**
- Create: `src/memaide/service/session.py`
- Modify: `src/memaide/service/app.py`
- Test: `tests/test_service_session.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_service_session.py`:

```python
from fastapi.testclient import TestClient

from memaide import config
from memaide.schemas import AgentDecision
from memaide.service.app import ServiceDeps, create_app
from memaide.service.session_registry import SessionRegistry


class StubBrain:
    async def respond(self, transcript, vision=None, extra_context=None):
        return AgentDecision(reply_text="ok")


def _client(registry, monkeypatch, api_key=None):
    monkeypatch.setattr(config, "AI_AGENT_API_KEY", api_key)
    deps = ServiceDeps(make_brain=lambda patient: StubBrain(), registry=registry)
    return TestClient(create_app(deps))


def _payload():
    return {
        "session_id": "s1",
        "patient": {"patient_id": "p1", "name": "Rose"},
        "vitals": {"heart_rate": 90},
        "beacons": [{"room": "kitchen"}],
    }


def test_session_start_registers_context(monkeypatch):
    reg = SessionRegistry()
    client = _client(reg, monkeypatch)
    r = client.post("/session/start", json=_payload())
    assert r.status_code == 200
    assert r.json() == {"status": "registered"}
    assert "s1" in reg._ctx
    assert reg._ctx["s1"].patient.name == "Rose"
    assert reg._ctx["s1"].vitals.heart_rate == 90


def test_session_start_rejects_bad_api_key(monkeypatch):
    client = _client(SessionRegistry(), monkeypatch, api_key="secret")
    r = client.post("/session/start", json=_payload(), headers={"X-Api-Key": "wrong"})
    assert r.status_code == 401


def test_session_start_422_on_malformed_body(monkeypatch):
    client = _client(SessionRegistry(), monkeypatch)
    r = client.post("/session/start", json={"session_id": "s1"})  # no patient
    assert r.status_code == 422


def test_session_start_503_without_registry(monkeypatch):
    monkeypatch.setattr(config, "AI_AGENT_API_KEY", None)
    deps = ServiceDeps(make_brain=lambda patient: StubBrain())  # registry defaults None
    client = TestClient(create_app(deps))
    r = client.post("/session/start", json=_payload())
    assert r.status_code == 503
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_service_session.py -v`
Expected: FAIL (`ServiceDeps` has no `registry`; `/session/start` returns 404)

- [ ] **Step 3: Implement `register_session`**

Create `src/memaide/service/session.py`:

```python
"""Build a SessionContext from koko's /session/start body and stash it in the registry.

Reuses `_to_patient_context` from the /infer path so the patient block is interpreted
identically on both the text and voice paths.
"""

from memaide.service.infer import _to_patient_context
from memaide.service.schemas import SessionStartRequest
from memaide.service.session_registry import SessionContext, SessionRegistry


def register_session(req: SessionStartRequest, registry: SessionRegistry) -> None:
    ctx = SessionContext(
        session_id=req.session_id,
        patient=_to_patient_context(req.patient),
        vitals=req.vitals,
        beacons=list(req.beacons),
    )
    registry.put_context(req.session_id, ctx)
```

- [ ] **Step 4: Wire the route and add `registry` to `ServiceDeps`**

In `src/memaide/service/app.py`, update the imports, the `ServiceDeps` dataclass, and add the route. The full file becomes:

```python
import logging
from dataclasses import dataclass
from typing import Any, Callable

from fastapi import Depends, FastAPI, HTTPException

from memaide.safety.escalation import EscalationMonitor
from memaide.schemas import PatientContext
from memaide.service.auth import require_api_key
from memaide.service.infer import run_infer
from memaide.service.schemas import InferRequest, InferResponse, SessionStartRequest
from memaide.service.session import register_session
from memaide.service.session_registry import SessionRegistry

_log = logging.getLogger(__name__)


@dataclass
class ServiceDeps:
    """Injectable seams so the app is built from testable parts."""

    make_brain: Callable[[PatientContext], Any]
    monitor: EscalationMonitor | None = None
    registry: SessionRegistry | None = None


def create_app(deps: ServiceDeps) -> FastAPI:
    app = FastAPI(title="MemAide /infer service")
    monitor = deps.monitor or EscalationMonitor()

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok"}

    @app.post("/infer", response_model=InferResponse)
    async def infer(
        req: InferRequest, _: None = Depends(require_api_key)
    ) -> InferResponse:
        try:
            return await run_infer(req, deps.make_brain, monitor)
        except HTTPException:
            raise
        except Exception:  # noqa: BLE001 - any brain/upstream failure -> 502 for koko fallback
            _log.exception("infer failed")
            raise HTTPException(status_code=502, detail="inference failed")

    @app.post("/session/start")
    async def session_start(
        req: SessionStartRequest, _: None = Depends(require_api_key)
    ) -> dict:
        if deps.registry is None:
            raise HTTPException(status_code=503, detail="session registry unavailable")
        register_session(req, deps.registry)
        return {"status": "registered"}

    return app
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/test_service_session.py tests/test_service_app.py -v`
Expected: PASS (new session tests + existing infer tests still green)

- [ ] **Step 6: Commit**

```bash
git add src/memaide/service/session.py src/memaide/service/app.py tests/test_service_session.py
git commit -m "feat: POST /session/start registers live-session context"
```

---

### Task 5: `KokoReporter` + config vars

**Files:**
- Modify: `src/memaide/config.py` (append after the `/infer` block, ~line 79)
- Create: `src/memaide/service/koko_reporter.py`
- Test: `tests/test_koko_reporter.py`

- [ ] **Step 1: Add config vars**

In `src/memaide/config.py`, after the `INFER_PORT = 8080` line, add:

```python
# --- koko callbacks (Slice 2: my server -> koko) ---
# Base URL my server POSTs escalation/conclude to. Unset -> KokoReporter is a no-op (dev).
KOKO_BASE_URL = os.environ.get("KOKO_BASE_URL")
# Shared secret my server sends to koko as X-Api-Key on those callbacks.
KOKO_API_KEY = os.environ.get("KOKO_API_KEY")
```

- [ ] **Step 2: Write the failing tests**

Create `tests/test_koko_reporter.py`:

```python
from datetime import datetime, timezone

from memaide.schemas import EscalationDecision, HandoffType, Role, SessionRecord, Turn
from memaide.service.koko_reporter import KokoReporter


class FakeClient:
    def __init__(self, raises=False):
        self.calls = []
        self._raises = raises

    async def post(self, url, json=None, headers=None):
        self.calls.append({"url": url, "json": json, "headers": headers})
        if self._raises:
            raise RuntimeError("boom")


def _record():
    return SessionRecord(
        id="s1",
        patient_id="p1",
        started_at=datetime(2026, 7, 7, tzinfo=timezone.utc),
        ended_at=datetime(2026, 7, 7, tzinfo=timezone.utc),
        handoff_type=HandoffType.PATIENT_ENDED,
        transcript=[Turn(role=Role.PATIENT, text="I fell")],
        escalated=True,
    )


def test_disabled_when_no_base_url():
    assert KokoReporter(base_url=None).enabled is False


def test_enabled_with_base_url():
    assert KokoReporter(base_url="http://koko:4000").enabled is True


async def test_escalation_posts_reason_and_triggered_by():
    fc = FakeClient()
    rep = KokoReporter(base_url="http://koko:4000", api_key="k", client=fc)
    await rep.escalation("s1", EscalationDecision(escalate=True, reason="fell", triggered_by=["vision"]))
    assert fc.calls[0]["url"] == "http://koko:4000/ai-sessions/s1/escalation"
    assert fc.calls[0]["json"] == {"reason": "fell", "triggered_by": ["vision"]}
    assert fc.calls[0]["headers"] == {"X-Api-Key": "k"}


async def test_conclude_posts_record_plus_outcome():
    fc = FakeClient()
    rep = KokoReporter(base_url="http://koko:4000", client=fc)
    await rep.conclude("s1", _record(), "patient_ended")
    body = fc.calls[0]["json"]
    assert fc.calls[0]["url"] == "http://koko:4000/ai-sessions/s1/conclude"
    assert body["outcome"] == "patient_ended"
    assert body["transcript"][0]["text"] == "I fell"
    assert body["escalated"] is True


async def test_no_op_when_disabled_does_not_call_client():
    fc = FakeClient()
    rep = KokoReporter(base_url=None, client=fc)
    await rep.escalation("s1", EscalationDecision(escalate=True))
    await rep.conclude("s1", _record(), "disconnected")
    assert fc.calls == []


async def test_post_failure_is_swallowed():
    fc = FakeClient(raises=True)
    rep = KokoReporter(base_url="http://koko:4000", client=fc)
    await rep.escalation("s1", EscalationDecision(escalate=True))  # must not raise
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `python -m pytest tests/test_koko_reporter.py -v`
Expected: FAIL with `ModuleNotFoundError: memaide.service.koko_reporter`

- [ ] **Step 4: Implement `KokoReporter`**

Create `src/memaide/service/koko_reporter.py`:

```python
"""POSTs live-session events back to koko. Best-effort: failures are logged, never raised.

A no-op when `base_url` is unset (dev), so the live session runs standalone. `client` is an
httpx.AsyncClient-shaped object exposing `async post(url, json=..., headers=...)`; when None,
a short-lived httpx client is created per call.
"""

import logging
from typing import Any

from memaide.schemas import EscalationDecision, SessionRecord

_log = logging.getLogger(__name__)


class KokoReporter:
    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        client: Any = None,
        timeout: float = 5.0,
    ):
        self._base = base_url.rstrip("/") if base_url else None
        self._api_key = api_key
        self._client = client
        self._timeout = timeout

    @property
    def enabled(self) -> bool:
        return self._base is not None

    async def escalation(self, session_id: str, decision: EscalationDecision) -> None:
        await self._post(
            f"/ai-sessions/{session_id}/escalation",
            {"reason": decision.reason, "triggered_by": list(decision.triggered_by)},
        )

    async def conclude(
        self, session_id: str, record: SessionRecord, outcome: str
    ) -> None:
        body = record.model_dump(mode="json")
        body["outcome"] = outcome
        await self._post(f"/ai-sessions/{session_id}/conclude", body)

    async def _post(self, path: str, body: dict) -> None:
        if self._base is None:
            _log.info("[koko] no-op (KOKO_BASE_URL unset): would POST %s", path)
            return
        url = f"{self._base}{path}"
        headers = {"X-Api-Key": self._api_key} if self._api_key else {}
        try:
            if self._client is not None:
                await self._client.post(url, json=body, headers=headers)
            else:
                import httpx

                async with httpx.AsyncClient(timeout=self._timeout) as c:
                    await c.post(url, json=body, headers=headers)
        except Exception as exc:  # noqa: BLE001 - best-effort; never crash the session
            _log.warning("[koko] POST %s failed: %s", path, exc)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/test_koko_reporter.py tests/test_config.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/memaide/config.py src/memaide/service/koko_reporter.py tests/test_koko_reporter.py
git commit -m "feat: KokoReporter for real-time escalation and conclude callbacks"
```

---

### Task 6: `VoiceLoop` edge-triggered escalation callback

**Files:**
- Modify: `src/memaide/server/voice_loop.py:19-36` (constructor) and `:67-77` (`_emit_turn`)
- Test: `tests/test_voice_loop.py`

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_voice_loop.py`:

```python
async def test_on_escalation_fires_once_across_multiple_escalating_turns():
    session = _session(StubBrain())
    sent, send = _collector()
    reported = []

    async def on_escalation(decision):
        reported.append(decision)

    loop = VoiceLoop(
        session=session,
        stt=StubSpeechToText([STTEvent("final", "I fell"), STTEvent("final", "I fell again")]),
        tts=StubTextToSpeech(audio=b"WAV"),
        send=send,
        on_escalation=on_escalation,
    )
    await loop.run(_audio((b"x", b"y")))

    # "I fell" trips the rule-based monitor on the first turn; callback fires exactly once.
    assert len(reported) == 1
    assert reported[0].escalate is True


async def test_no_on_escalation_callback_is_fine():
    session = _session(StubBrain())
    sent, send = _collector()
    loop = VoiceLoop(
        session=session,
        stt=StubSpeechToText([STTEvent("final", "I fell")]),
        tts=StubTextToSpeech(audio=b"WAV"),
        send=send,
    )
    await loop.run(_audio())  # no callback provided -> must not raise
    assert any(m["type"] == "escalation" for m in sent)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_voice_loop.py::test_on_escalation_fires_once_across_multiple_escalating_turns -v`
Expected: FAIL with `TypeError: __init__() got an unexpected keyword argument 'on_escalation'`

- [ ] **Step 3: Add the callback to the constructor**

In `src/memaide/server/voice_loop.py`, replace the `__init__` signature and body (lines 20-36) with:

```python
    def __init__(
        self,
        session: Any,
        stt: Any,
        tts: Any,
        send: Callable[[dict], Awaitable[None]],
        get_vision: Callable[[], VisionContext | None] | None = None,
        clock: Callable[[], float] | None = None,
        on_escalation: Callable[[Any], Awaitable[None]] | None = None,
    ):
        self._session = session
        self._stt = stt
        self._tts = tts
        self._send = send
        self._get_vision = get_vision or (lambda: None)
        self._clock = clock or time.monotonic
        self._last_speech_at = self._clock()
        self._seq = 0
        self._on_escalation = on_escalation
        self._escalation_reported = False
```

- [ ] **Step 4: Fire the callback once in `_emit_turn`**

In the same file, replace the escalation block inside `_emit_turn` (currently lines 69-77) with:

```python
        decision = getattr(self._session, "last_escalation", None)
        if decision is not None and decision.escalate:
            await self._send(
                {
                    "type": "escalation",
                    "reason": decision.reason,
                    "triggered_by": list(decision.triggered_by),
                }
            )
            if self._on_escalation is not None and not self._escalation_reported:
                self._escalation_reported = True
                await self._on_escalation(decision)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/test_voice_loop.py -v`
Expected: PASS (new + existing voice-loop tests green)

- [ ] **Step 6: Commit**

```bash
git add src/memaide/server/voice_loop.py tests/test_voice_loop.py
git commit -m "feat: VoiceLoop edge-triggered on_escalation callback (fires once)"
```

---

### Task 7: `ws.py` — registry correlation + conclude flow

**Files:**
- Modify: `src/memaide/server/ws.py` (`ServerDeps`, `_await_hello`, `handle`)
- Test: `tests/test_ws.py`

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_ws.py` (top-level, alongside the existing helpers):

```python
import pytest

from memaide.schemas import PatientContext
from memaide.service.session_registry import SessionContext, SessionRegistry


class FakeReporter:
    def __init__(self):
        self.escalations = []
        self.concludes = []

    async def escalation(self, session_id, decision):
        self.escalations.append((session_id, decision))

    async def conclude(self, session_id, record, outcome):
        self.concludes.append((session_id, record, outcome))


def _hello_id_only(sid="s1"):
    return json.dumps({"type": "hello", "session_id": sid})


def _registry_with(sid="s1"):
    reg = SessionRegistry(wait_timeout=0.1)
    reg.put_context(
        sid, SessionContext(session_id=sid, patient=PatientContext(patient_id="p1", name="Rose"))
    )
    return reg


async def test_hello_correlates_context_from_registry():
    reg = _registry_with("s1")
    ws = FakeWS([_hello_id_only("s1"), _frame(), json.dumps({"type": "bye"})])
    await handle(ws, _deps(registry=reg))
    assert any(m["type"] == "vision_context" for m in ws.sent)


async def test_unknown_session_closes_with_error():
    reg = SessionRegistry(wait_timeout=0.05)  # no context put
    ws = FakeWS([_hello_id_only("nope"), _frame()])
    await handle(ws, _deps(registry=reg))
    assert ws.sent == [{"type": "error", "text": "unknown session"}]


async def test_bye_concludes_with_patient_ended_and_drops_context():
    reg = _registry_with("s1")
    rep = FakeReporter()
    ws = FakeWS([_hello_id_only("s1"), _frame(), json.dumps({"type": "bye"})])
    await handle(ws, _deps(registry=reg, reporter=rep))
    assert len(rep.concludes) == 1
    sid, record, outcome = rep.concludes[0]
    assert sid == "s1" and outcome == "patient_ended"
    assert record.handoff_type.value == "patient_ended"
    assert await reg.wait_context("s1", timeout=0.01) is None  # dropped


async def test_disconnect_without_bye_concludes_with_disconnected():
    reg = _registry_with("s1")
    rep = FakeReporter()
    ws = FakeWS([_hello_id_only("s1"), _frame()])  # stream ends, no bye
    await handle(ws, _deps(registry=reg, reporter=rep))
    assert rep.concludes[0][2] == "disconnected"
    assert rep.concludes[0][1].handoff_type is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_ws.py -v`
Expected: FAIL (`ServerDeps` has no `registry`/`reporter`; hello with no `patient` builds a default patient and never errors/concludes)

- [ ] **Step 3: Extend `ServerDeps`**

In `src/memaide/server/ws.py`, add two fields to the `ServerDeps` dataclass (after `observer`):

```python
    # Slice 2: when set, hello correlates context by session_id via the registry, and
    # session events are reported back to koko. Both default None -> legacy behavior
    # (patient carried in hello, no koko callbacks) so the bridge tester app still works.
    registry: Any = None
    reporter: Any = None
```

- [ ] **Step 4: Rewrite `_await_hello` to return the raw hello dict, add helpers**

Replace `_await_hello` (lines 96-113) with the following, and add the outcome map + a patient-from-hello fallback:

```python
from memaide.schemas import HandoffType  # add to the existing schemas import at top

_OUTCOME_HANDOFF = {
    "patient_ended": HandoffType.PATIENT_ENDED,
    "caregiver_joined": HandoffType.CAREGIVER_JOINED,
    "disconnected": None,
}


async def _await_hello(websocket: Any) -> dict | None:
    async for raw in websocket:
        msg = _parse(raw)
        if msg and msg.get("type") == "hello":
            return msg
    return None


def _patient_from_hello(msg: dict) -> PatientContext:
    """Legacy path: build the patient from the hello payload (bridge tester app)."""
    data = msg.get("patient") or {}
    try:
        return (
            PatientContext(**data)
            if data
            else PatientContext(patient_id=msg.get("session_id", "unknown"), name="Patient")
        )
    except Exception:  # noqa: BLE001 - bad patient payload -> safe default
        return PatientContext(patient_id="unknown", name="Patient")
```

> Note: merge the `HandoffType` import into the existing `from memaide.schemas import ...` line rather than adding a duplicate import.

- [ ] **Step 5: Rewrite `handle` to correlate and conclude**

Replace the body of `handle` (lines 116-187) with:

```python
async def handle(websocket: Any, deps: ServerDeps) -> None:
    """Run one connection: correlate the session, fan frames/audio to the two tasks,
    then conclude (report the SessionRecord to koko) on exit."""
    send_lock = asyncio.Lock()

    async def send(msg: dict) -> None:
        async with send_lock:
            await websocket.send(json.dumps(msg))

    hello = await _await_hello(websocket)
    if hello is None:
        return
    session_id = hello.get("session_id")

    if deps.registry is not None and session_id is not None:
        ctx = await deps.registry.wait_context(session_id)
        if ctx is None:
            await send({"type": "error", "text": "unknown session"})
            return
        patient = ctx.patient
    else:
        patient = _patient_from_hello(hello)

    session = AgentSession(
        brain=deps.make_brain(patient), patient=patient, session_id=session_id
    )
    recorder = deps.make_recorder(session_id or "unknown")
    latest: dict[str, Any] = {"scene": None, "frame_url": None}

    async def sink(ctx: VisionContext) -> None:
        ctx = ctx.model_copy(update={"flags": deps.vision_check.check()})
        latest["scene"] = ctx
        await send(
            {
                "type": "vision_context",
                "description": ctx.description,
                "label": ctx.label,
                "advisory_flags": ctx.advisory_flags,
                "ts": ctx.ts.isoformat(),
            }
        )
        if deps.observer is not None:
            await deps.observer.on_scene(ctx, session, frame_url=latest["frame_url"])

    on_escalation = None
    if deps.reporter is not None and session_id is not None:
        async def on_escalation(decision):  # noqa: E306 - closure over session_id/reporter
            await deps.reporter.escalation(session_id, decision)

    frame_source = WebSocketFrameSource()
    audio_source = WebSocketAudioSource()
    pipeline = VisionPipeline(
        source=frame_source, describer=deps.describer, sink=sink, interval=deps.interval
    )
    loop = VoiceLoop(
        session=session,
        stt=deps.stt,
        tts=deps.tts,
        send=send,
        get_vision=lambda: latest["scene"],
        on_escalation=on_escalation,
    )

    vision_task = asyncio.create_task(pipeline.run())
    voice_task = asyncio.create_task(loop.run(audio_source))
    outcome = "disconnected"
    try:
        async for raw in websocket:
            msg = _parse(raw)
            if not msg:
                continue
            mtype = msg.get("type")
            if mtype == "frame" and isinstance(msg.get("data_url"), str):
                latest["frame_url"] = msg["data_url"]
                await recorder.write(msg["data_url"])
                await frame_source.put(msg["data_url"])
            elif mtype == "audio" and isinstance(msg.get("pcm"), str):
                try:
                    await audio_source.put(base64.b64decode(msg["pcm"]))
                except Exception:  # noqa: BLE001 - bad base64 -> drop the chunk
                    continue
            elif mtype == "bye":
                outcome = "patient_ended"
                break
            # unknown / malformed -> ignored (forward-compatible)
    finally:
        await frame_source.close()
        await audio_source.close()
        await recorder.close()
        await asyncio.gather(vision_task, voice_task, return_exceptions=True)
        record = session.stop(_OUTCOME_HANDOFF.get(outcome))
        if deps.reporter is not None and session_id is not None:
            await deps.reporter.conclude(session_id, record, outcome)
        if deps.registry is not None and session_id is not None:
            deps.registry.drop(session_id)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `python -m pytest tests/test_ws.py -v`
Expected: PASS (new correlation/conclude tests + existing legacy-hello tests green)

- [ ] **Step 7: Commit**

```bash
git add src/memaide/server/ws.py tests/test_ws.py
git commit -m "feat: WebSocket correlates context by session_id and concludes to koko"
```

---

### Task 8: Combined one-process entry point

**Files:**
- Create: `scripts/run_session_server.py`
- Test: `tests/test_run_session_server.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_run_session_server.py`:

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from run_session_server import build_components


def test_build_components_shares_one_registry_and_registers_route():
    app, ws_deps, registry = build_components(client=object())
    # Both listeners share the SAME registry instance.
    assert ws_deps.registry is registry
    # The HTTP app exposes /session/start.
    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/session/start" in paths
    assert "/infer" in paths
    # The reporter seam is wired into the WS deps.
    assert ws_deps.reporter is not None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_run_session_server.py -v`
Expected: FAIL with `ModuleNotFoundError: run_session_server`

- [ ] **Step 3: Implement the entry point**

Create `scripts/run_session_server.py`:

```python
"""Run the MemAide live session server (Slice 2): /session/start + the media WebSocket
in ONE process sharing one SessionRegistry.

    python scripts/run_session_server.py
    #   HTTP  : http://0.0.0.0:8080   (POST /infer, POST /session/start, GET /health)
    #   media : ws://0.0.0.0:8765     (device points its WebSocket here)

koko POSTs /session/start with the patient context; the device opens the WebSocket with
hello {session_id}; my server correlates the two and runs the live voice/vision loop,
POSTing escalation (real-time) and the transcript (on conclude) back to koko.

Requires OPENAI_API_KEY (brain + vision + STT/TTS). Set AI_AGENT_API_KEY to require the
inbound X-Api-Key header. Set KOKO_BASE_URL (+ KOKO_API_KEY) to enable callbacks to koko;
unset -> callbacks are logged no-ops (standalone dev).
"""

import asyncio
import logging
import sys
from pathlib import Path

# Make `memaide` importable without an editable install (src/ layout).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from memaide import config
from memaide.agent.brain import AgentBrain
from memaide.audio.stt import SpeechToText
from memaide.audio.tts import TextToSpeech
from memaide.io.openai_client import OpenAIClient
from memaide.server.ws import ServerDeps, handle
from memaide.service.app import ServiceDeps, create_app
from memaide.service.koko_reporter import KokoReporter
from memaide.service.session_registry import SessionRegistry
from memaide.vision.describer import VisionDescriber

_log = logging.getLogger("memaide.session")


def build_components(client):
    """Build the FastAPI app and the WebSocket ServerDeps sharing ONE SessionRegistry.

    Split out from main() so it is unit-testable without opening sockets. `client` is an
    OpenAI-SDK-shaped object; the constructors below only store it (no network at build).
    """
    registry = SessionRegistry()
    reporter = KokoReporter(config.KOKO_BASE_URL, config.KOKO_API_KEY)
    app = create_app(
        ServiceDeps(make_brain=lambda p: AgentBrain(client, p), registry=registry)
    )
    ws_deps = ServerDeps(
        describer=VisionDescriber(client),
        stt=SpeechToText(client),
        tts=TextToSpeech(client),
        make_brain=lambda p: AgentBrain(client, p),
        registry=registry,
        reporter=reporter,
    )
    return app, ws_deps, registry


async def _serve() -> None:
    import uvicorn
    import websockets

    if not config.OPENAI_API_KEY:
        _log.error("OPENAI_API_KEY is not set (needed for brain/vision/STT/TTS).")
        raise SystemExit(1)
    if not config.AI_AGENT_API_KEY:
        _log.warning("AI_AGENT_API_KEY not set; inbound auth is DISABLED (dev mode).")
    if not config.KOKO_BASE_URL:
        _log.warning("KOKO_BASE_URL not set; koko callbacks are logged no-ops (dev mode).")

    client = OpenAIClient()
    app, ws_deps, _ = build_components(client)

    uv = uvicorn.Server(
        uvicorn.Config(app, host=config.INFER_HOST, port=config.INFER_PORT, log_level="info")
    )
    uv.install_signal_handlers = lambda: None  # main() owns shutdown of both listeners

    ws = await websockets.serve(
        lambda s: handle(s, ws_deps), config.WS_HOST, config.WS_PORT
    )
    _log.info("HTTP  : http://%s:%d  (/infer, /session/start, /health)",
              config.INFER_HOST, config.INFER_PORT)
    _log.info("media : ws://%s:%d  (device WebSocket)", config.WS_HOST, config.WS_PORT)
    await asyncio.gather(uv.serve(), ws.wait_closed())


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    try:
        asyncio.run(_serve())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_run_session_server.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/run_session_server.py tests/test_run_session_server.py
git commit -m "feat: one-process session server (HTTP :8080 + media :8765, shared registry)"
```

---

### Task 9: Document the new env vars

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Find the env-var documentation anchor**

Run: `grep -n "AI_AGENT_API_KEY" README.md`
Expected: at least one line where `AI_AGENT_API_KEY` is documented (the Slice 1 env section).

- [ ] **Step 2: Add the koko-callback vars**

Immediately after the `AI_AGENT_API_KEY` entry in `README.md`, add:

```markdown
- `KOKO_BASE_URL` — (Slice 2) base URL of koko's API that my live-session server POSTs
  escalation (`/ai-sessions/:id/escalation`) and conclude (`/ai-sessions/:id/conclude`)
  callbacks to. Unset → those callbacks become logged no-ops (standalone dev).
- `KOKO_API_KEY` — (Slice 2) shared secret my server sends to koko as `X-Api-Key` on the
  callbacks above. Symmetric to `AI_AGENT_API_KEY` (which guards koko → my server).
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document KOKO_BASE_URL and KOKO_API_KEY env vars"
```

---

### Task 10: Full-suite verification

- [ ] **Step 1: Run the entire test suite**

Run: `python -m pytest -q`
Expected: all tests pass (the prior ~158 Slice 1 tests plus the new Slice 2 tests). If any Slice 1 test regressed, fix before proceeding — the legacy WebSocket path (patient in hello, no registry/reporter) must remain green.

- [ ] **Step 2: Confirm the server imports and builds**

Run: `python -c "import sys; sys.path.insert(0, 'scripts'); from run_session_server import build_components; a,d,r=build_components(object()); print('ok', d.registry is r)"`
Expected: `ok True`

---

## Notes for the implementer

- **Legacy compatibility is intentional.** `ServerDeps.registry`/`reporter` default to `None`; when unset, `ws.py` keeps the old behavior (patient carried in `hello`, no koko callbacks) so the `com.memaide.bridge` tester app and the existing `run_bridge_server.py` keep working. Slice 2 behavior is opt-in by injecting a registry + reporter (done in `run_session_server.py`).
- **`outcome` vs `handoff_type`.** `outcome` (`patient_ended` / `disconnected` / `caregiver_joined`) is the authoritative distinguisher in the conclude body; `handoff_type` is the coarser enum (`disconnected` maps to `None`). The `caregiver_joined` outcome is mapped but not yet triggered by any device message (future work).
- **Orphan sweep** (a `/session/start` whose WebSocket never connects) is noted in the spec as a leak guard. It is not in this plan's tasks because it needs a background timer tied to the server lifecycle; add it as a follow-up if sessions are observed to leak. `wait_context`'s timeout already prevents a stuck WebSocket.
- **Transcript is end-only** (Decision 2): it rides along in the `SessionRecord` on conclude. No per-turn streaming endpoint is built.
```
