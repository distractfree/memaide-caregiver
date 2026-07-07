# Slice 1 `/infer` HTTP Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a stateless Python `POST /infer` HTTP service that koko's backend calls per patient message to get a real AI reply + escalation decision, replacing his scripted placeholder.

**Architecture:** A FastAPI app (`src/memaide/service/`) validates the request, authenticates via `X-Api-Key`, and delegates to a pure `run_infer()` function that reconstructs an ephemeral `PatientContext` + transcript per call, runs one `AgentBrain.respond()` turn, OR-s in the rule-based `EscalationMonitor`, and maps the result to the response. Nothing is retained between calls. `AgentSession` is untouched (reserved for the Slice 2 voice path).

**Tech Stack:** Python 3.11+, FastAPI + uvicorn (new optional `service` extra), Pydantic 2 (already present), pytest + FastAPI `TestClient` (httpx).

**Spec:** `docs/superpowers/specs/2026-07-06-slice1-infer-implementation-design.md`

**Conventions:** tests are `async def` (pytest `asyncio_mode = "auto"` — no decorator needed), plain `assert`, stub-client pattern that records what it received (see `tests/test_brain.py`). No self-attribution in commit messages.

---

### Task 1: Extend `PatientContext` with a `Medication` model

**Files:**
- Modify: `src/memaide/schemas.py`
- Test: `tests/test_schemas.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_schemas.py`:

```python
from memaide.schemas import Medication, PatientContext


def test_patient_context_new_fields_default_empty():
    p = PatientContext(patient_id="p1", name="Rose")
    assert p.age is None
    assert p.bio_info is None
    assert p.medications == []


def test_patient_context_accepts_medications():
    p = PatientContext(
        patient_id="p1", name="Rose", age=78, bio_info="Lives alone.",
        medications=[Medication(name="Metformin", dose="500mg", schedule="twice daily")],
    )
    assert p.age == 78
    assert p.medications[0].name == "Metformin"
    assert p.medications[0].active is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_schemas.py -k "new_fields or accepts_medications" -v`
Expected: FAIL — `ImportError: cannot import name 'Medication'`.

- [ ] **Step 3: Write minimal implementation**

In `src/memaide/schemas.py`, add the `Medication` model immediately above `class PatientContext` and extend `PatientContext`:

```python
class Medication(BaseModel):
    name: str
    dose: str | None = None
    schedule: str | None = None
    active: bool = True


class PatientContext(BaseModel):
    patient_id: str
    name: str
    preferred_name: str | None = None
    known_conditions: list[str] = Field(default_factory=list)
    language: str = "en"
    notes: str | None = None
    age: int | None = None
    bio_info: str | None = None
    medications: list[Medication] = Field(default_factory=list)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_schemas.py -v`
Expected: PASS (all existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/memaide/schemas.py tests/test_schemas.py
git commit -m "feat: add Medication model and age/bio_info/medications to PatientContext"
```

---

### Task 2: Thread new profile fields into the system prompt

**Files:**
- Modify: `src/memaide/prompts/system_prompt.py`
- Test: `tests/test_prompts.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_prompts.py`:

```python
from memaide.schemas import Medication


def test_system_prompt_includes_age_bio_and_medications_when_present():
    patient = PatientContext(
        patient_id="p1", name="Rose", age=78, bio_info="Lives alone with a cat.",
        medications=[Medication(name="Metformin", dose="500mg", schedule="twice daily")],
    )
    prompt = build_system_prompt(patient)
    assert "78" in prompt
    assert "Lives alone with a cat." in prompt
    assert "Metformin" in prompt
    assert "500mg" in prompt


def test_system_prompt_omits_medication_line_when_none():
    prompt = build_system_prompt(PatientContext(patient_id="p", name="Sam"))
    assert "medications" not in prompt.lower()


def test_system_prompt_skips_inactive_medications():
    patient = PatientContext(
        patient_id="p", name="Sam",
        medications=[Medication(name="OldDrug", active=False)],
    )
    prompt = build_system_prompt(patient)
    assert "OldDrug" not in prompt
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_prompts.py -k "age_bio or omits_medication or skips_inactive" -v`
Expected: FAIL — assertions on age/bio/medications not found.

- [ ] **Step 3: Write minimal implementation**

Replace `_patient_block` in `src/memaide/prompts/system_prompt.py` and add `_format_med`:

```python
def _format_med(med) -> str:
    parts = [med.name]
    if med.dose:
        parts.append(med.dose)
    if med.schedule:
        parts.append(med.schedule)
    return " ".join(parts)


def _patient_block(patient: PatientContext) -> str:
    call_name = patient.preferred_name or patient.name
    conditions = ", ".join(patient.known_conditions) if patient.known_conditions else "none on file"
    notes = patient.notes if patient.notes else "none"
    lines = [
        "ABOUT THE PERSON YOU ARE HELPING",
        f"- Name: {patient.name} (call them {call_name})",
    ]
    if patient.age is not None:
        lines.append(f"- Age: {patient.age}")
    if patient.bio_info:
        lines.append(f"- Background: {patient.bio_info}")
    lines.append(f"- Known conditions: {conditions}")
    active_meds = [_format_med(m) for m in patient.medications if m.active]
    if active_meds:
        lines.append(f"- Current medications: {'; '.join(active_meds)}")
    lines.append(f"- Preferred language: {patient.language}")
    lines.append(f"- Notes: {notes}")
    return "\n".join(lines)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_prompts.py -v`
Expected: PASS (existing prompt tests still pass — the Name/conditions/language/notes lines are unchanged in wording).

- [ ] **Step 5: Commit**

```bash
git add src/memaide/prompts/system_prompt.py tests/test_prompts.py
git commit -m "feat: render age, background, and active medications in the system prompt"
```

---

### Task 3: Add `extra_context` to `AgentBrain.respond`

**Files:**
- Modify: `src/memaide/agent/brain.py`
- Test: `tests/test_brain.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_brain.py`:

```python
async def test_respond_appends_extra_context_as_system_messages():
    client = StubClient({"reply_text": "x"})
    brain = AgentBrain(client=client, patient=_patient())
    await brain.respond(
        [Turn(role=Role.PATIENT, text="hi")],
        extra_context=["[VITALS] heart_rate=82", "[LOCATION] bathroom for 240s"],
    )
    system_msgs = [m["content"] for m in client.last_messages if m["role"] == "system"]
    assert any("[VITALS] heart_rate=82" in c for c in system_msgs)
    assert any("[LOCATION] bathroom for 240s" in c for c in system_msgs)


async def test_respond_without_extra_context_unchanged():
    client = StubClient({"reply_text": "x"})
    brain = AgentBrain(client=client, patient=_patient())
    await brain.respond([Turn(role=Role.PATIENT, text="hi")])
    # exactly one system message (the base prompt) when no vision/extra_context
    system_msgs = [m for m in client.last_messages if m["role"] == "system"]
    assert len(system_msgs) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_brain.py -k "extra_context" -v`
Expected: FAIL — `respond()` got an unexpected keyword argument `extra_context`.

- [ ] **Step 3: Write minimal implementation**

In `src/memaide/agent/brain.py`, update `_build_messages` and `respond`:

```python
    def _build_messages(
        self,
        transcript: list[Turn],
        vision: VisionContext | None,
        extra_context: list[str] | None = None,
    ) -> list[dict]:
        messages: list[dict] = [{"role": "system", "content": self._system_prompt}]
        for turn in transcript:
            messages.append({"role": _ROLE_MAP[turn.role], "content": turn.text})
        for note in extra_context or []:
            messages.append({"role": "system", "content": note})
        if vision is not None:
            flags = ", ".join(vision.flags) if vision.flags else "none"
            content = (
                f"[VISION CONTEXT] Scene: {vision.label}. "
                f"{vision.description} Flags: {flags}."
            )
            if vision.advisory_flags:
                content += f" Advisory: {', '.join(vision.advisory_flags)}."
            messages.append({"role": "system", "content": content})
        return messages

    async def respond(
        self,
        transcript: list[Turn],
        vision: VisionContext | None = None,
        extra_context: list[str] | None = None,
    ) -> AgentDecision:
        messages = self._build_messages(transcript, vision, extra_context)
        data = await self._client.complete_json(messages, model=self._model)
        decision = AgentDecision.model_validate(data)
        return decision.model_copy(
            update={"reply_text": strip_foreign_text(decision.reply_text)}
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_brain.py -v`
Expected: PASS (all existing brain tests unchanged + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/memaide/agent/brain.py tests/test_brain.py
git commit -m "feat: accept optional extra_context system messages in AgentBrain.respond"
```

---

### Task 4: Add service config values

**Files:**
- Modify: `src/memaide/config.py`
- Test: `tests/test_config.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_config.py`:

```python
def test_infer_service_config_defaults():
    from memaide import config
    assert config.INFER_HOST == "0.0.0.0"
    assert config.INFER_PORT == 8080
    # AI_AGENT_API_KEY is read from env; attribute must exist (None when unset)
    assert hasattr(config, "AI_AGENT_API_KEY")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_config.py -k "infer_service" -v`
Expected: FAIL — `AttributeError: module 'memaide.config' has no attribute 'INFER_HOST'`.

- [ ] **Step 3: Write minimal implementation**

In `src/memaide/config.py`, add after the WebSocket server section:

```python
# --- /infer HTTP service (Slice 1: koko backend bridge) ---
# Shared secret koko sends as the X-Api-Key header. When unset, /infer auth is
# DISABLED (local dev); production deploy must set it.
AI_AGENT_API_KEY = os.environ.get("AI_AGENT_API_KEY")
INFER_HOST = "0.0.0.0"
INFER_PORT = 8080
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_config.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/memaide/config.py tests/test_config.py
git commit -m "feat: add AI_AGENT_API_KEY and INFER_HOST/PORT config"
```

---

### Task 5: Add FastAPI/uvicorn (`service` extra) + httpx (dev)

**Files:**
- Modify: `pyproject.toml`

- [ ] **Step 1: Edit `pyproject.toml`**

Replace the `[project.optional-dependencies]` block:

```toml
[project.optional-dependencies]
dev = ["pytest>=8.0", "pytest-asyncio>=0.23", "httpx>=0.27"]
# Optional automated eval judge (Claude). Not needed for the default export-only flow.
judge = ["anthropic>=0.40"]
# HTTP /infer service (Slice 1). Install on the droplet with: pip install -e ".[service]"
service = ["fastapi>=0.110", "uvicorn[standard]>=0.29"]
```

- [ ] **Step 2: Install the new deps into the venv**

Run: `pip install -e ".[dev,service]"`
Expected: installs `fastapi`, `uvicorn`, `httpx` with no errors.

- [ ] **Step 3: Verify imports resolve**

Run: `python -c "import fastapi, uvicorn, httpx; print('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add pyproject.toml
git commit -m "build: add fastapi/uvicorn service extra and httpx dev dep"
```

---

### Task 6: `/infer` request/response schemas

**Files:**
- Create: `src/memaide/service/__init__.py` (empty)
- Create: `src/memaide/service/schemas.py`
- Test: `tests/test_service_schemas.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_service_schemas.py`:

```python
from memaide.service.schemas import InferRequest, InferResponse


def _minimal_request_dict():
    return {
        "session": {"session_id": "s1"},
        "patient": {"patient_id": "p1", "name": "Rose"},
        "latest_message": "I feel dizzy",
    }


def test_infer_request_parses_minimal_payload():
    req = InferRequest.model_validate(_minimal_request_dict())
    assert req.patient.name == "Rose"
    assert req.latest_message == "I feel dizzy"
    assert req.vitals is None
    assert req.beacons_triggered == []
    assert req.seconds_since_last_speech == 0.0


def test_infer_request_parses_full_payload():
    data = _minimal_request_dict()
    data["patient"].update({
        "age": 78, "bio_info": "Lives alone.", "known_conditions": ["diabetes"],
        "medications": [{"name": "Metformin", "dose": "500mg"}],
        "caregiver": {"id": "c1", "name": "John", "phone": "+1"},
    })
    data["vitals"] = {"heart_rate": 82, "motion_state": "still", "step_count": 1203}
    data["beacons_triggered"] = [{"room": "bathroom", "dwell_seconds": 240}]
    data["history"] = [{"role": "ai", "text": "Hi"}, {"role": "patient", "text": "hi"}]
    req = InferRequest.model_validate(data)
    assert req.patient.medications[0].name == "Metformin"
    assert req.vitals.heart_rate == 82
    assert req.beacons_triggered[0].room == "bathroom"
    assert req.patient.caregiver.name == "John"
    assert req.history[1].role == "patient"


def test_infer_response_defaults():
    resp = InferResponse(reply_text="ok")
    assert resp.escalate is False
    assert resp.escalation.reason == ""
    assert resp.escalation.triggered_by == []
    assert resp.intent == "assist"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_service_schemas.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'memaide.service'`.

- [ ] **Step 3: Create the package + schemas**

Create empty `src/memaide/service/__init__.py`. Create `src/memaide/service/schemas.py`:

```python
from __future__ import annotations

from pydantic import BaseModel, Field


class SessionInfo(BaseModel):
    session_id: str
    started_at: str | None = None
    help_event_id: str | None = None
    trigger: str | None = None


class CaregiverInfo(BaseModel):
    id: str | None = None
    name: str | None = None
    phone: str | None = None


class MedicationInput(BaseModel):
    name: str
    dose: str | None = None
    schedule: str | None = None
    active: bool = True


class InferPatient(BaseModel):
    patient_id: str
    name: str
    preferred_name: str | None = None
    age: int | None = None
    bio_info: str | None = None
    language: str = "en"
    known_conditions: list[str] = Field(default_factory=list)
    medications: list[MedicationInput] = Field(default_factory=list)
    caregiver: CaregiverInfo | None = None
    notes: str | None = None


class Vitals(BaseModel):
    heart_rate: int | None = None
    motion_state: str | None = None
    step_count: int | None = None
    timestamp: str | None = None


class BeaconEvent(BaseModel):
    room: str | None = None
    detected_at: str | None = None
    dwell_seconds: float | None = None
    estimated_distance_m: float | None = None
    exited_at: str | None = None


class HistoryItem(BaseModel):
    role: str
    text: str
    ts: str | None = None


class InferRequest(BaseModel):
    session: SessionInfo
    patient: InferPatient
    vitals: Vitals | None = None
    beacons_triggered: list[BeaconEvent] = Field(default_factory=list)
    vision: dict | None = None  # always null on the text path (Slice 2 populates)
    history: list[HistoryItem] = Field(default_factory=list)
    latest_message: str
    seconds_since_last_speech: float = 0.0


class EscalationInfo(BaseModel):
    reason: str = ""
    triggered_by: list[str] = Field(default_factory=list)


class InferResponse(BaseModel):
    reply_text: str
    escalate: bool = False
    escalation: EscalationInfo = Field(default_factory=EscalationInfo)
    handoff_ready: bool = False
    intent: str = "assist"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_service_schemas.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/memaide/service/__init__.py src/memaide/service/schemas.py tests/test_service_schemas.py
git commit -m "feat: add /infer request and response schemas"
```

---

### Task 7: `run_infer` — context mapping and reply (happy path)

**Files:**
- Create: `src/memaide/service/infer.py`
- Test: `tests/test_infer.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_infer.py`:

```python
from memaide.safety.escalation import EscalationMonitor
from memaide.schemas import AgentDecision
from memaide.service.infer import run_infer
from memaide.service.schemas import InferRequest


class StubBrain:
    """Records the transcript/vision/extra_context it was called with."""

    def __init__(self, decision: AgentDecision):
        self._decision = decision
        self.calls: list[dict] = []
        self.patient = None

    async def respond(self, transcript, vision=None, extra_context=None):
        self.calls.append(
            {"transcript": transcript, "vision": vision, "extra_context": extra_context}
        )
        return self._decision


def _make_factory(brain: StubBrain):
    def factory(patient):
        brain.patient = patient
        return brain
    return factory


def _request(**overrides) -> InferRequest:
    data = {
        "session": {"session_id": "s1"},
        "patient": {"patient_id": "p1", "name": "Rose"},
        "latest_message": "I feel a bit dizzy",
    }
    data.update(overrides)
    return InferRequest.model_validate(data)


async def test_run_infer_returns_reply_and_defaults():
    brain = StubBrain(AgentDecision(reply_text="Let's sit down.", intent="reassure"))
    resp = await run_infer(_request(), _make_factory(brain), EscalationMonitor())
    assert resp.reply_text == "Let's sit down."
    assert resp.escalate is False
    assert resp.intent == "reassure"
    assert resp.handoff_ready is False


async def test_run_infer_builds_transcript_from_history_plus_latest():
    brain = StubBrain(AgentDecision(reply_text="ok"))
    req = _request(history=[{"role": "ai", "text": "Hi"}, {"role": "patient", "text": "hello"}])
    await run_infer(req, _make_factory(brain), EscalationMonitor())
    texts = [t.text for t in brain.calls[0]["transcript"]]
    assert texts == ["Hi", "hello", "I feel a bit dizzy"]
    # the latest message is a patient turn at the end
    assert brain.calls[0]["transcript"][-1].role.value == "patient"


async def test_run_infer_maps_caregiver_into_patient_notes():
    brain = StubBrain(AgentDecision(reply_text="ok"))
    data = {
        "session": {"session_id": "s1"},
        "patient": {"patient_id": "p1", "name": "Rose", "caregiver": {"name": "John"}},
        "latest_message": "hi",
    }
    await run_infer(InferRequest.model_validate(data), _make_factory(brain), EscalationMonitor())
    assert "John" in (brain.patient.notes or "")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_infer.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'memaide.service.infer'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/memaide/service/infer.py`:

```python
from typing import Any, Callable

from memaide import config
from memaide.safety.escalation import EscalationMonitor
from memaide.schemas import Medication, PatientContext, Role, Turn
from memaide.service.schemas import (
    EscalationInfo,
    InferPatient,
    InferRequest,
    InferResponse,
)

_HISTORY_ROLE_MAP = {
    "ai": Role.AGENT,
    "patient": Role.PATIENT,
    "system": Role.SYSTEM,
    "event": Role.SYSTEM,
}


def _to_patient_context(p: InferPatient) -> PatientContext:
    notes = p.notes
    if p.caregiver and p.caregiver.name:
        cg = f"Caregiver on call: {p.caregiver.name}."
        notes = f"{notes} {cg}".strip() if notes else cg
    return PatientContext(
        patient_id=p.patient_id,
        name=p.name,
        preferred_name=p.preferred_name,
        known_conditions=p.known_conditions,
        language=p.language,
        notes=notes,
        age=p.age,
        bio_info=p.bio_info,
        medications=[
            Medication(name=m.name, dose=m.dose, schedule=m.schedule, active=m.active)
            for m in p.medications
        ],
    )


def _build_transcript(history, latest_message: str) -> list[Turn]:
    turns: list[Turn] = [
        Turn(role=_HISTORY_ROLE_MAP.get(item.role, Role.SYSTEM), text=item.text)
        for item in history
    ]
    turns.append(Turn(role=Role.PATIENT, text=latest_message))
    return turns


def _format_live_context(req: InferRequest) -> list[str]:
    notes: list[str] = []
    v = req.vitals
    if v is not None:
        parts = []
        if v.heart_rate is not None:
            parts.append(f"heart_rate={v.heart_rate}")
        if v.motion_state:
            parts.append(f"motion={v.motion_state}")
        if v.step_count is not None:
            parts.append(f"steps={v.step_count}")
        if parts:
            suffix = f" (as of {v.timestamp})" if v.timestamp else ""
            notes.append(f"[VITALS] {', '.join(parts)}{suffix}")
    for b in req.beacons_triggered:
        if not b.room:
            continue
        seg = f"[LOCATION] {b.room}"
        if b.dwell_seconds is not None:
            seg += f" for {b.dwell_seconds:g}s"
        if b.estimated_distance_m is not None:
            seg += f", ~{b.estimated_distance_m:g}m"
        notes.append(seg)
    return notes


async def run_infer(
    req: InferRequest,
    make_brain: Callable[[PatientContext], Any],
    monitor: EscalationMonitor,
) -> InferResponse:
    patient = _to_patient_context(req.patient)
    brain = make_brain(patient)
    transcript = _build_transcript(req.history, req.latest_message)
    extra_context = _format_live_context(req)

    rule = monitor.check(req.latest_message, None, req.seconds_since_last_speech)
    decision = await brain.respond(transcript, vision=None, extra_context=extra_context)

    escalate = rule.escalate or decision.wants_escalation
    reason = rule.reason if rule.escalate else ""
    triggered = list(rule.triggered_by)
    if escalate and not rule.escalate and decision.wants_escalation:
        reason = "agent_requested"
        triggered = ["agent"]

    reply_text = decision.reply_text
    if escalate and config.EMERGENCY_SUGGESTION not in reply_text:
        reply_text = f"{reply_text} {config.EMERGENCY_SUGGESTION}".strip()

    return InferResponse(
        reply_text=reply_text,
        escalate=escalate,
        escalation=EscalationInfo(reason=reason, triggered_by=triggered),
        handoff_ready=decision.handoff_ready,
        intent=decision.intent,
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_infer.py -v`
Expected: PASS (the 3 happy-path tests).

- [ ] **Step 5: Commit**

```bash
git add src/memaide/service/infer.py tests/test_infer.py
git commit -m "feat: run_infer builds context and returns the brain reply"
```

---

### Task 8: `run_infer` — live vitals/beacons threading

**Files:**
- Modify: `tests/test_infer.py`
- (no source change expected — `_format_live_context` already implemented in Task 7; this task verifies it)

- [ ] **Step 1: Write the failing test**

Add to `tests/test_infer.py`:

```python
async def test_run_infer_threads_vitals_and_beacons_as_extra_context():
    brain = StubBrain(AgentDecision(reply_text="ok"))
    data = {
        "session": {"session_id": "s1"},
        "patient": {"patient_id": "p1", "name": "Rose"},
        "latest_message": "hi",
        "vitals": {"heart_rate": 82, "motion_state": "still", "step_count": 1203},
        "beacons_triggered": [{"room": "bathroom", "dwell_seconds": 240,
                               "estimated_distance_m": 1.2}],
    }
    await run_infer(InferRequest.model_validate(data), _make_factory(brain), EscalationMonitor())
    extra = brain.calls[0]["extra_context"]
    assert any("[VITALS]" in c and "heart_rate=82" in c and "motion=still" in c for c in extra)
    assert any("[LOCATION] bathroom for 240s" in c and "~1.2m" in c for c in extra)


async def test_run_infer_no_live_context_yields_empty_extra():
    brain = StubBrain(AgentDecision(reply_text="ok"))
    await run_infer(_request(), _make_factory(brain), EscalationMonitor())
    assert brain.calls[0]["extra_context"] == []
```

- [ ] **Step 2: Run test to verify it passes**

Run: `python -m pytest tests/test_infer.py -k "vitals_and_beacons or no_live_context" -v`
Expected: PASS (implementation from Task 7 already covers this).

> Note: if either test fails, fix `_format_live_context` in `src/memaide/service/infer.py` to match the asserted strings before committing.

- [ ] **Step 3: Commit**

```bash
git add tests/test_infer.py
git commit -m "test: verify vitals/beacons thread into /infer extra_context"
```

---

### Task 9: `run_infer` — escalation OR-ing, fallback reason, emergency suffix

**Files:**
- Modify: `tests/test_infer.py`
- (verifies escalation logic implemented in Task 7)

- [ ] **Step 1: Write the failing test**

Add to `tests/test_infer.py`:

```python
from memaide import config


async def test_run_infer_escalates_on_distress_keyword_with_rule_reason():
    brain = StubBrain(AgentDecision(reply_text="I'm here."))
    resp = await run_infer(
        _request(latest_message="I can't breathe"), _make_factory(brain), EscalationMonitor()
    )
    assert resp.escalate is True
    assert "distress_keyword" in resp.escalation.triggered_by
    assert config.EMERGENCY_SUGGESTION in resp.reply_text


async def test_run_infer_escalates_on_agent_request_with_fallback_reason():
    brain = StubBrain(AgentDecision(reply_text="This sounds serious.", wants_escalation=True))
    resp = await run_infer(
        _request(latest_message="my vision went dark"), _make_factory(brain), EscalationMonitor()
    )
    assert resp.escalate is True
    assert resp.escalation.reason == "agent_requested"
    assert resp.escalation.triggered_by == ["agent"]
    assert config.EMERGENCY_SUGGESTION in resp.reply_text


async def test_run_infer_no_escalation_leaves_reason_blank_and_no_suffix():
    brain = StubBrain(AgentDecision(reply_text="You're okay."))
    resp = await run_infer(
        _request(latest_message="I feel a little lonely"), _make_factory(brain), EscalationMonitor()
    )
    assert resp.escalate is False
    assert resp.escalation.reason == ""
    assert resp.escalation.triggered_by == []
    assert config.EMERGENCY_SUGGESTION not in resp.reply_text


async def test_run_infer_does_not_double_append_emergency_suffix():
    line = config.EMERGENCY_SUGGESTION
    brain = StubBrain(AgentDecision(reply_text=f"Stay calm. {line}", wants_escalation=True))
    resp = await run_infer(_request(), _make_factory(brain), EscalationMonitor())
    assert resp.reply_text.count(line) == 1
```

- [ ] **Step 2: Run test to verify it passes**

Run: `python -m pytest tests/test_infer.py -k "escalat or emergency" -v`
Expected: PASS (Task 7 implementation covers this logic).

> Note: if a test fails, reconcile the escalation block in `run_infer` with the asserted behavior before committing.

- [ ] **Step 3: Commit**

```bash
git add tests/test_infer.py
git commit -m "test: cover /infer escalation OR-ing, agent_requested fallback, emergency suffix"
```

---

### Task 10: `X-Api-Key` auth dependency

**Files:**
- Create: `src/memaide/service/auth.py`
- Test: `tests/test_service_auth.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_service_auth.py`:

```python
import pytest
from fastapi import HTTPException

from memaide import config
from memaide.service.auth import require_api_key


def test_auth_disabled_when_key_unset(monkeypatch):
    monkeypatch.setattr(config, "AI_AGENT_API_KEY", None)
    # returns without raising even when no header is provided
    assert require_api_key(x_api_key=None) is None


def test_auth_rejects_missing_or_wrong_key(monkeypatch):
    monkeypatch.setattr(config, "AI_AGENT_API_KEY", "secret")
    with pytest.raises(HTTPException) as exc:
        require_api_key(x_api_key=None)
    assert exc.value.status_code == 401
    with pytest.raises(HTTPException):
        require_api_key(x_api_key="wrong")


def test_auth_accepts_correct_key(monkeypatch):
    monkeypatch.setattr(config, "AI_AGENT_API_KEY", "secret")
    assert require_api_key(x_api_key="secret") is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_service_auth.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'memaide.service.auth'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/memaide/service/auth.py`:

```python
import logging

from fastapi import Header, HTTPException

from memaide import config

_log = logging.getLogger(__name__)


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """FastAPI dependency: enforce X-Api-Key when AI_AGENT_API_KEY is configured.

    When the env var is unset, auth is disabled (dev convenience) with a warning.
    """
    expected = config.AI_AGENT_API_KEY
    if not expected:
        _log.warning("AI_AGENT_API_KEY not set; /infer auth is DISABLED (dev mode).")
        return None
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="invalid or missing API key")
    return None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_service_auth.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/memaide/service/auth.py tests/test_service_auth.py
git commit -m "feat: add X-Api-Key auth dependency for /infer"
```

---

### Task 11: FastAPI app — routes, health, error handling

**Files:**
- Create: `src/memaide/service/app.py`
- Test: `tests/test_service_app.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_service_app.py`:

```python
from fastapi.testclient import TestClient

from memaide import config
from memaide.schemas import AgentDecision
from memaide.service.app import ServiceDeps, create_app


class StubBrain:
    def __init__(self, decision=None, raises=False):
        self._decision = decision or AgentDecision(reply_text="Let's sit down.")
        self._raises = raises

    async def respond(self, transcript, vision=None, extra_context=None):
        if self._raises:
            raise RuntimeError("upstream boom")
        return self._decision


def _client(brain, monkeypatch, api_key=None):
    monkeypatch.setattr(config, "AI_AGENT_API_KEY", api_key)
    deps = ServiceDeps(make_brain=lambda patient: brain)
    return TestClient(create_app(deps))


def _payload():
    return {
        "session": {"session_id": "s1"},
        "patient": {"patient_id": "p1", "name": "Rose"},
        "latest_message": "I feel dizzy",
    }


def test_health_ok(monkeypatch):
    client = _client(StubBrain(), monkeypatch)
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_infer_happy_path(monkeypatch):
    client = _client(StubBrain(), monkeypatch)
    r = client.post("/infer", json=_payload())
    assert r.status_code == 200
    body = r.json()
    assert body["reply_text"] == "Let's sit down."
    assert body["escalate"] is False


def test_infer_rejects_bad_api_key(monkeypatch):
    client = _client(StubBrain(), monkeypatch, api_key="secret")
    r = client.post("/infer", json=_payload(), headers={"X-Api-Key": "wrong"})
    assert r.status_code == 401


def test_infer_accepts_good_api_key(monkeypatch):
    client = _client(StubBrain(), monkeypatch, api_key="secret")
    r = client.post("/infer", json=_payload(), headers={"X-Api-Key": "secret"})
    assert r.status_code == 200


def test_infer_422_on_malformed_body(monkeypatch):
    client = _client(StubBrain(), monkeypatch)
    r = client.post("/infer", json={"session": {"session_id": "s1"}})  # missing patient/latest_message
    assert r.status_code == 422


def test_infer_502_on_brain_failure(monkeypatch):
    client = _client(StubBrain(raises=True), monkeypatch)
    r = client.post("/infer", json=_payload())
    assert r.status_code == 502
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_service_app.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'memaide.service.app'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/memaide/service/app.py`:

```python
import logging
from dataclasses import dataclass
from typing import Any, Callable

from fastapi import Depends, FastAPI, HTTPException

from memaide.safety.escalation import EscalationMonitor
from memaide.schemas import PatientContext
from memaide.service.auth import require_api_key
from memaide.service.infer import run_infer
from memaide.service.schemas import InferRequest, InferResponse

_log = logging.getLogger(__name__)


@dataclass
class ServiceDeps:
    """Injectable seams so the app is built from testable parts."""

    make_brain: Callable[[PatientContext], Any]
    monitor: EscalationMonitor | None = None


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

    return app
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_service_app.py -v`
Expected: PASS (all six).

- [ ] **Step 5: Commit**

```bash
git add src/memaide/service/app.py tests/test_service_app.py
git commit -m "feat: FastAPI app with /infer, /health, auth, and 502 error handling"
```

---

### Task 12: uvicorn entrypoint script

**Files:**
- Create: `scripts/run_infer_server.py`

- [ ] **Step 1: Create the entrypoint**

Create `scripts/run_infer_server.py`:

```python
"""Run the MemAide /infer HTTP service (Slice 1: koko backend bridge).

Serves POST /infer (and GET /health) with the real AgentBrain. koko calls this per
patient message instead of its scripted placeholder. Stateless: one brain turn per call.

    python scripts/run_infer_server.py
    #   service : http://0.0.0.0:8080   (koko points AI_AGENT_URL here)

Requires OPENAI_API_KEY (the brain). Set AI_AGENT_API_KEY to require the X-Api-Key header;
if it is unset, auth is DISABLED (local dev only).
"""

import logging
import sys
from pathlib import Path

# Make `memaide` importable without an editable install (src/ layout).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from memaide import config
from memaide.agent.brain import AgentBrain
from memaide.io.openai_client import OpenAIClient
from memaide.service.app import ServiceDeps, create_app

_log = logging.getLogger("memaide.infer")


def build_app():
    if not config.OPENAI_API_KEY:
        _log.error("OPENAI_API_KEY is not set (needed for the brain). Check your .env.")
        raise SystemExit(1)
    client = OpenAIClient()
    deps = ServiceDeps(make_brain=lambda patient: AgentBrain(client, patient))
    return create_app(deps)


def main() -> None:
    import uvicorn

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    if not config.AI_AGENT_API_KEY:
        _log.warning("AI_AGENT_API_KEY not set; /infer auth is DISABLED (dev mode).")
    app = build_app()
    _log.info("infer service: http://%s:%d  (POST /infer, GET /health)",
              config.INFER_HOST, config.INFER_PORT)
    uvicorn.run(app, host=config.INFER_HOST, port=config.INFER_PORT)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Smoke-test the health endpoint**

Run (needs `OPENAI_API_KEY` set; no real API call is made by `/health`):

```bash
python scripts/run_infer_server.py &
sleep 2
curl -s http://127.0.0.1:8080/health
kill %1
```

Expected: prints `{"status":"ok"}`.

> If `OPENAI_API_KEY` is unavailable in the dev shell, skip the live curl and instead verify import + app construction:
> `python -c "import scripts.run_infer_server as s; print('import ok')"` (expects `import ok`; construction is covered by Task 11 tests).

- [ ] **Step 3: Commit**

```bash
git add scripts/run_infer_server.py
git commit -m "feat: add run_infer_server uvicorn entrypoint"
```

---

### Task 13: Deployment — systemd unit + README update

**Files:**
- Create: `deploy/memaide-infer.service`
- Modify: `deploy/README.md`

- [ ] **Step 1: Create the systemd unit**

Create `deploy/memaide-infer.service`:

```ini
[Unit]
# MemAide /infer HTTP service (Slice 1: koko backend bridge), port 8080.
Description=MemAide /infer service (koko backend bridge)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=memaide
Group=memaide
WorkingDirectory=/opt/memaide
EnvironmentFile=/etc/memaide/memaide.env
ExecStart=/opt/memaide/.venv/bin/python scripts/run_infer_server.py
Restart=on-failure
RestartSec=3
StandardOutput=journal
StandardError=journal
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true
ReadWritePaths=/opt/memaide

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Update the deploy README**

In `deploy/README.md`, in the env-vars table (§5), add a row:

```markdown
| `AI_AGENT_API_KEY` | **yes (prod)** | Shared secret koko sends as `X-Api-Key`; unset = auth disabled (dev only) |
```

And add a subsection after the systemd section (§6):

```markdown
### /infer service (Slice 1)

The koko backend bridge runs as a second service on port **8080**:

```bash
# venv must have the service extra: pip install -e ".[service]"
cp /opt/memaide/deploy/memaide-infer.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now memaide-infer
curl -s http://127.0.0.1:8080/health      # -> {"status":"ok"}
```

koko sets `AI_AGENT_URL=http://<droplet-ip>:8080` and `AI_AGENT_API_KEY` to the same
secret you put in `/etc/memaide/memaide.env`. Since koko is co-located on the same droplet,
`/infer` can stay bound to the private interface / firewalled to localhost rather than
exposed publicly.
```

Also update the venv install step (§4) to note the service extra:

```markdown
.venv/bin/pip install -e ".[service]"   # /infer service needs fastapi+uvicorn
```

- [ ] **Step 3: Run the full test suite**

Run: `python -m pytest -q`
Expected: all tests pass (previous suite + all new service tests), no regressions.

- [ ] **Step 4: Commit**

```bash
git add deploy/memaide-infer.service deploy/README.md
git commit -m "deploy: add /infer systemd unit and document the service"
```

---

## Self-Review Notes

- **Spec coverage:** endpoint (T11), auth (T10), stateless run_infer (T7), PatientContext extension (T1), system-prompt static profile (T2), live vitals/beacons via brain `extra_context` (T3,T7,T8), escalation OR + agent_requested + emergency suffix (T9), response mapping (T7,T9), 422/502/401/health error handling (T11), `service` extra + config + entrypoint + deploy (T4,T5,T12,T13). All spec sections map to a task.
- **Caregiver handling:** the spec §2 extends `PatientContext` with only age/bio_info/medications; caregiver (spec §3) is threaded via a notes-append in `_to_patient_context` (T7) — no extra schema field, keeping §2 accurate. Covered by `test_run_infer_maps_caregiver_into_patient_notes`.
- **Type consistency:** `run_infer(req, make_brain, monitor)`, `AgentBrain.respond(transcript, vision=None, extra_context=None)`, `ServiceDeps(make_brain, monitor=None)`, and `require_api_key(x_api_key=...)` signatures are identical everywhere they appear.
- **Tasks 8 & 9** are verification-only (logic landed in Task 7); their tests are still written first and must pass before commit. If they fail, the note directs fixing Task 7's implementation.
```
