# WhatsApp Caregiver Alert (Slice 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a live-session escalation, the AI server sends the caregiver an approved 4-variable `caregiver_alert` WhatsApp message.

**Architecture:** Preserve structured caregiver info (name+phone) on `SessionContext`, add a standalone `EscalationNotifier` that maps escalation trigger codes to a caregiver-facing situation phrase and sends the `caregiver_alert` template (offloaded to a thread), and hook it into the existing once-per-session `on_escalation` closure in `server/ws.py`. Wired only when `WHATSAPP_TOKEN` is set.

**Tech Stack:** Python 3, pydantic, FastAPI/uvicorn, `websockets`, pytest + pytest-asyncio (`asyncio_mode=auto`). WhatsApp send via the existing stdlib-`urllib` `WhatsAppSender`.

**Spec:** `docs/superpowers/specs/2026-07-08-whatsapp-fall-alert-design.md`

---

## File Structure

- **Modify** `src/memaide/config.py` — add `CAREGIVER_PORTAL_BASE_URL`, `CAREGIVER_SESSION_PATH`.
- **Modify** `src/memaide/service/session_registry.py` — add `caregiver` to `SessionContext`.
- **Modify** `src/memaide/service/session.py` — populate caregiver in `register_session`.
- **Create** `src/memaide/notify/escalation_alert.py` — `situation_phrase()` + `EscalationNotifier`.
- **Modify** `src/memaide/server/ws.py` — add `ServerDeps.notifier`, capture caregiver, call notifier in `on_escalation`.
- **Modify** `scripts/run_session_server.py` — build + inject the notifier.
- **Modify** `HANDOFF.md` + `deploy/README.md` — document the new env vars, the 4-var template, and the `{{4}}` route caveat.
- **Test** `tests/test_service_session.py`, `tests/test_escalation_alert.py` (new), `tests/test_ws.py`, `tests/test_run_session_server.py`.

---

### Task 1: Config constants for the caregiver portal URL

**Files:**
- Modify: `src/memaide/config.py` (after the WhatsApp block, ~line 106)

Plain module constants — no test needed.

- [ ] **Step 1: Add the config constants**

Add after the `WHATSAPP_LANG` line in `src/memaide/config.py`:

```python

# --- Caregiver portal (for the {{4}} live-session link in caregiver-alert WhatsApps) ---
# Base URL of koko's caregiver portal + the path template to one live session.
# NOTE: CONFIRM the exact path with koko — a wrong path yields a 404 in the caregiver's
# message. Default path mirrors the template example (/session/<id>).
CAREGIVER_PORTAL_BASE_URL = os.environ.get("CAREGIVER_PORTAL_BASE_URL", "")
CAREGIVER_SESSION_PATH = os.environ.get("CAREGIVER_SESSION_PATH", "/session/{id}")
```

- [ ] **Step 2: Verify it imports**

Run: `python -c "from memaide import config; print(config.CAREGIVER_SESSION_PATH)"`
Expected: prints `/session/{id}`

- [ ] **Step 3: Commit**

```bash
git add src/memaide/config.py
git commit -m "feat: add caregiver portal URL config for caregiver-alert link"
```

---

### Task 2: Carry caregiver info on SessionContext

**Files:**
- Modify: `src/memaide/service/session_registry.py:13-21`
- Modify: `src/memaide/service/session.py:12-19`
- Test: `tests/test_service_session.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_service_session.py`:

```python
def test_session_start_preserves_caregiver(monkeypatch):
    reg = SessionRegistry()
    client = _client(reg, monkeypatch)
    payload = _payload()
    payload["patient"]["caregiver"] = {"name": "Anthony", "phone": "+15551234567"}
    r = client.post("/session/start", json=payload)
    assert r.status_code == 200
    cg = reg._ctx["s1"].caregiver
    assert cg is not None
    assert cg.name == "Anthony"
    assert cg.phone == "+15551234567"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_service_session.py::test_session_start_preserves_caregiver -v`
Expected: FAIL with `AttributeError: 'SessionContext' object has no attribute 'caregiver'`

- [ ] **Step 3: Add the caregiver field to SessionContext**

In `src/memaide/service/session_registry.py`, add the import and the field. Replace lines 13-21:

```python
from memaide.schemas import PatientContext
from memaide.service.schemas import CaregiverInfo


@dataclass
class SessionContext:
    session_id: str
    patient: PatientContext
    vitals: Any = None
    beacons: list = field(default_factory=list)
    caregiver: CaregiverInfo | None = None
```

- [ ] **Step 4: Populate caregiver in register_session**

In `src/memaide/service/session.py`, replace the `SessionContext(...)` construction (lines 13-18):

```python
    ctx = SessionContext(
        session_id=req.session_id,
        patient=_to_patient_context(req.patient),
        vitals=req.vitals,
        beacons=list(req.beacons),
        caregiver=req.patient.caregiver,
    )
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_service_session.py -v`
Expected: PASS (all, including the new test)

- [ ] **Step 6: Commit**

```bash
git add src/memaide/service/session_registry.py src/memaide/service/session.py tests/test_service_session.py
git commit -m "feat: preserve caregiver name+phone on SessionContext"
```

---

### Task 3: Situation phrase map ({{3}})

**Files:**
- Create: `src/memaide/notify/escalation_alert.py`
- Test: `tests/test_escalation_alert.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_escalation_alert.py`:

```python
from memaide.notify.escalation_alert import situation_phrase


def test_situation_phrase_maps_known_code():
    assert situation_phrase(["vision:person_on_floor"]) == "a possible fall"


def test_situation_phrase_joins_multiple():
    assert (
        situation_phrase(["vision:person_on_floor", "vision:no_motion"])
        == "a possible fall and no movement or possible unresponsiveness"
    )


def test_situation_phrase_unknown_code_falls_back():
    assert situation_phrase(["mystery"]) == "a possible emergency"


def test_situation_phrase_empty_falls_back():
    assert situation_phrase([]) == "a possible emergency"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_escalation_alert.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'memaide.notify.escalation_alert'`

- [ ] **Step 3: Create the module with situation_phrase**

Create `src/memaide/notify/escalation_alert.py`:

```python
"""Build and send the caregiver WhatsApp caregiver alert on a live-session escalation.

Turns an EscalationDecision into the 4-variable `caregiver_alert` template message. The blocking
WhatsApp send is offloaded to a thread so it never stalls the session's event loop, and all
failures are logged and swallowed — a notify must never crash the session.
"""

import asyncio
import logging

from memaide.notify.whatsapp import WhatsAppSender
from memaide.schemas import EscalationDecision
from memaide.service.schemas import CaregiverInfo

_log = logging.getLogger(__name__)

# triggered_by code -> caregiver-facing phrase for {{3}}.
_SITUATION_PHRASES = {
    "vision:person_on_floor": "a possible fall",
    "vision:fall_detected": "a fall",
    "vision:no_motion": "no movement or possible unresponsiveness",
    "distress_keyword": "verbal signs of distress",
    "silence_with_abnormal_vision": "no response with concerning surroundings",
}
_GENERIC_SITUATION = "a possible emergency"


def situation_phrase(triggered_by: list[str]) -> str:
    """Map escalation trigger codes to one caregiver-facing situation phrase ({{3}})."""
    phrases = [_SITUATION_PHRASES.get(code) for code in triggered_by]
    phrases = [p for p in phrases if p]
    if not phrases:
        return _GENERIC_SITUATION
    return " and ".join(phrases)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_escalation_alert.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/memaide/notify/escalation_alert.py tests/test_escalation_alert.py
git commit -m "feat: map escalation trigger codes to caregiver situation phrase"
```

---

### Task 4: EscalationNotifier

**Files:**
- Modify: `src/memaide/notify/escalation_alert.py`
- Test: `tests/test_escalation_alert.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_escalation_alert.py`:

```python
from memaide.notify.escalation_alert import EscalationNotifier
from memaide.schemas import EscalationDecision
from memaide.service.schemas import CaregiverInfo


def _decision(triggered):
    return EscalationDecision(
        escalate=True, reason="; ".join(triggered), triggered_by=triggered
    )


class _FakeSender:
    def __init__(self, ok=True):
        self.calls = []
        self._ok = ok

    def send_template(self, to, template="hello_world", lang="en_US", variables=None):
        self.calls.append((to, template, lang, variables))
        return self._ok


def _notifier(sender, template="caregiver_alert", fallback_to="+1999"):
    return EscalationNotifier(
        sender,
        template=template,
        lang="en_US",
        portal_base_url="https://caregiver.guardianova.com",
        session_path="/session/{id}",
        fallback_to=fallback_to,
    )


async def test_notify_builds_four_variables_and_uses_caregiver_phone():
    sender = _FakeSender()
    cg = CaregiverInfo(name="Anthony", phone="+15551234567")
    await _notifier(sender).notify("123", "John", cg, _decision(["vision:person_on_floor"]))
    to, template, lang, variables = sender.calls[-1]
    assert to == "+15551234567"
    assert template == "caregiver_alert"
    assert variables == [
        "Anthony",
        "John",
        "a possible fall",
        "https://caregiver.guardianova.com/session/123",
    ]


async def test_notify_falls_back_to_configured_recipient_without_phone():
    sender = _FakeSender()
    cg = CaregiverInfo(name="Anthony", phone=None)
    await _notifier(sender, fallback_to="+1999").notify(
        "123", "John", cg, _decision(["distress_keyword"])
    )
    to, _t, _l, variables = sender.calls[-1]
    assert to == "+1999"
    assert variables[0] == "Anthony"
    assert variables[2] == "verbal signs of distress"


async def test_notify_uses_default_name_when_no_caregiver():
    sender = _FakeSender()
    await _notifier(sender).notify("123", "John", None, _decision(["vision:fall_detected"]))
    to, _t, _l, variables = sender.calls[-1]
    assert variables[0] == "Caregiver"
    assert to == "+1999"


async def test_notify_swallows_sender_failure():
    class _Boom:
        def send_template(self, *a, **k):
            raise RuntimeError("network down")

    # Must not raise.
    await _notifier(_Boom()).notify("123", "John", None, _decision(["distress_keyword"]))


async def test_notify_skips_when_no_recipient():
    sender = _FakeSender()
    await _notifier(sender, fallback_to=None).notify(
        "123", "John", None, _decision(["distress_keyword"])
    )
    assert sender.calls == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_escalation_alert.py -k notify -v`
Expected: FAIL with `ImportError: cannot import name 'EscalationNotifier'`

- [ ] **Step 3: Implement EscalationNotifier**

Append to `src/memaide/notify/escalation_alert.py`:

```python


class EscalationNotifier:
    """Sends the caregiver `caregiver_alert` WhatsApp for a live-session escalation."""

    def __init__(
        self,
        sender: WhatsAppSender,
        *,
        template: str,
        lang: str,
        portal_base_url: str,
        session_path: str,
        fallback_to: str | None,
    ):
        self._sender = sender
        self._template = template
        self._lang = lang
        self._portal_base_url = portal_base_url
        self._session_path = session_path
        self._fallback_to = fallback_to

    def _session_url(self, session_id: str) -> str:
        return f"{self._portal_base_url}{self._session_path.format(id=session_id)}"

    def _build(
        self,
        session_id: str,
        patient_name: str,
        caregiver: CaregiverInfo | None,
        decision: EscalationDecision,
    ) -> tuple[str | None, list[str]]:
        caregiver_name = caregiver.name if caregiver and caregiver.name else "Caregiver"
        to = caregiver.phone if caregiver and caregiver.phone else self._fallback_to
        variables = [
            caregiver_name,
            patient_name,
            situation_phrase(list(decision.triggered_by)),
            self._session_url(session_id),
        ]
        return to, variables

    async def notify(
        self,
        session_id: str,
        patient_name: str,
        caregiver: CaregiverInfo | None,
        decision: EscalationDecision,
    ) -> None:
        if self._template == "hello_world":
            _log.warning(
                "WHATSAPP_TEMPLATE is still 'hello_world' (takes no variables); the "
                "caregiver_alert send will be rejected. Set WHATSAPP_TEMPLATE=caregiver_alert."
            )
        to, variables = self._build(session_id, patient_name, caregiver, decision)
        if not to:
            _log.warning("[notify] no caregiver phone and no WHATSAPP_TO; skipping alert")
            return
        try:
            await asyncio.to_thread(
                self._sender.send_template, to, self._template, self._lang, variables
            )
        except Exception as exc:  # noqa: BLE001 - a notify must never crash the session
            _log.warning("[notify] WhatsApp caregiver alert failed: %s", exc)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_escalation_alert.py -v`
Expected: PASS (all 9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/memaide/notify/escalation_alert.py tests/test_escalation_alert.py
git commit -m "feat: EscalationNotifier builds+sends 4-var caregiver_alert WhatsApp"
```

---

### Task 5: Wire the notifier into the WebSocket escalation path

**Files:**
- Modify: `src/memaide/server/ws.py:31-51` (ServerDeps), `:143-150` (caregiver capture), `:174-177` (on_escalation)
- Test: `tests/test_ws.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_ws.py`:

```python
class FakeNotifier:
    def __init__(self):
        self.calls = []

    async def notify(self, session_id, patient_name, caregiver, decision):
        self.calls.append((session_id, patient_name, caregiver, decision))


async def test_escalation_invokes_notifier_with_caregiver():
    from memaide.service.schemas import CaregiverInfo

    reg = SessionRegistry()
    reg.put_context(
        "s1",
        SessionContext(
            session_id="s1",
            patient=PatientContext(patient_id="p1", name="Rose"),
            caregiver=CaregiverInfo(name="Anthony", phone="+15551234567"),
        ),
    )
    notifier = FakeNotifier()
    ws = FakeWS([_hello(), _audio(), json.dumps({"type": "bye"})])
    deps = _deps(
        stt=StubSpeechToText([STTEvent("final", "I can't breathe")]),
        registry=reg,
        notifier=notifier,
    )
    await handle(ws, deps)

    assert len(notifier.calls) == 1
    session_id, patient_name, caregiver, decision = notifier.calls[0]
    assert session_id == "s1"
    assert patient_name == "Rose"
    assert caregiver.name == "Anthony"
    assert decision.escalate is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_ws.py::test_escalation_invokes_notifier_with_caregiver -v`
Expected: FAIL with `TypeError: __init__() got an unexpected keyword argument 'notifier'`

- [ ] **Step 3: Add `notifier` to ServerDeps**

In `src/memaide/server/ws.py`, add the field right after `reporter: Any = None` (line 51):

```python
    registry: Any = None
    reporter: Any = None
    # Slice 2: when set, an escalation also sends the caregiver a WhatsApp caregiver alert.
    # Default None -> no WhatsApp (dev / no key). Built by run_session_server.
    notifier: Any = None
```

- [ ] **Step 4: Capture caregiver from the session context**

In `handle`, replace the registry-correlation block (lines 143-150):

```python
    caregiver = None
    if deps.registry is not None and session_id is not None:
        ctx = await deps.registry.wait_context(session_id)
        if ctx is None:
            await send({"type": "error", "text": "unknown session"})
            return
        patient = ctx.patient
        caregiver = ctx.caregiver
    else:
        patient = _patient_from_hello(hello)
```

- [ ] **Step 5: Call the notifier from on_escalation**

Replace the `on_escalation` block (lines 174-177):

```python
    on_escalation = None
    if (deps.reporter is not None or deps.notifier is not None) and session_id is not None:
        async def on_escalation(decision):  # noqa: E306 - closure over session_id/deps
            if deps.reporter is not None:
                await deps.reporter.escalation(session_id, decision)
            if deps.notifier is not None:
                await deps.notifier.notify(session_id, patient.name, caregiver, decision)
```

- [ ] **Step 6: Run the WS tests to verify they pass**

Run: `pytest tests/test_ws.py -v`
Expected: PASS (all, including the new test)

- [ ] **Step 7: Commit**

```bash
git add src/memaide/server/ws.py tests/test_ws.py
git commit -m "feat: send WhatsApp caregiver alert on live-session escalation"
```

---

### Task 6: Build and inject the notifier in the session server

**Files:**
- Modify: `scripts/run_session_server.py:39-58`
- Test: `tests/test_run_session_server.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_run_session_server.py` (and add `from memaide import config` at the top):

```python
def test_build_components_no_whatsapp_token_means_no_notifier(monkeypatch):
    monkeypatch.setattr(config, "WHATSAPP_TOKEN", None)
    _app, ws_deps, _reg = build_components(client=object())
    assert ws_deps.notifier is None


def test_build_components_builds_notifier_when_whatsapp_configured(monkeypatch):
    monkeypatch.setattr(config, "WHATSAPP_TOKEN", "tok")
    monkeypatch.setattr(config, "WHATSAPP_PHONE_NUMBER_ID", "pnid")
    _app, ws_deps, _reg = build_components(client=object())
    assert ws_deps.notifier is not None
```

Add this import near the top of the file (below the existing imports):

```python
from memaide import config
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_run_session_server.py -v`
Expected: FAIL — `test_build_components_builds_notifier_when_whatsapp_configured` fails with `AssertionError` (notifier is None because build_components doesn't build one yet).

- [ ] **Step 3: Build the notifier in build_components**

In `scripts/run_session_server.py`, add a helper above `build_components`:

```python
def _build_notifier():
    """Build the WhatsApp escalation notifier, or None when no token is configured."""
    if not config.WHATSAPP_TOKEN or not config.WHATSAPP_PHONE_NUMBER_ID:
        return None
    from memaide.notify.escalation_alert import EscalationNotifier
    from memaide.notify.whatsapp import WhatsAppSender

    sender = WhatsAppSender(config.WHATSAPP_TOKEN, config.WHATSAPP_PHONE_NUMBER_ID)
    return EscalationNotifier(
        sender,
        template=config.WHATSAPP_TEMPLATE,
        lang=config.WHATSAPP_LANG,
        portal_base_url=config.CAREGIVER_PORTAL_BASE_URL,
        session_path=config.CAREGIVER_SESSION_PATH,
        fallback_to=config.WHATSAPP_TO,
    )
```

Then in `build_components`, replace the `ws_deps = ServerDeps(...)` construction (lines 50-57) to build and pass the notifier:

```python
    reporter = KokoReporter(config.KOKO_BASE_URL, config.KOKO_API_KEY)
    notifier = _build_notifier()
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
        notifier=notifier,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_run_session_server.py -v`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/run_session_server.py tests/test_run_session_server.py
git commit -m "feat: inject WhatsApp notifier into session server when token set"
```

---

### Task 7: Document the new env vars and the caregiver_alert switch

**Files:**
- Modify: `deploy/README.md` (WhatsApp / env section)
- Modify: `HANDOFF.md:172-173` (the env-var bullet)

- [ ] **Step 1: Document env vars in deploy/README.md**

Find the WhatsApp env documentation in `deploy/README.md` (search for `WHATSAPP_`). Immediately after the existing WhatsApp variable lines, add:

```markdown

**Caregiver-alert WhatsApp (live-session escalation).** The AI server sends the caregiver an
approved `caregiver_alert` template with 4 variables: {{1}} caregiver name, {{2}} patient name,
{{3}} situation phrase (derived from the escalation), {{4}} a link to the live session in
koko's caregiver portal. To enable it:

- Set `WHATSAPP_TEMPLATE=caregiver_alert` (the template is approved; `hello_world` takes no
  variables and will be rejected).
- Set `CAREGIVER_PORTAL_BASE_URL` (e.g. `https://caregiver.guardianova.com`).
- Set `CAREGIVER_SESSION_PATH` if koko's route differs from the default `/session/{id}`.
  **Confirm this route with koko** — a wrong path 404s the link in the caregiver's message.

The alert recipient is the caregiver's phone from koko's `/session/start` payload, falling
back to `WHATSAPP_TO` (the test number) when absent. Without `WHATSAPP_TOKEN` the notifier
is not built and the session runs normally.
```

- [ ] **Step 2: Update the HANDOFF env note**

In `HANDOFF.md`, replace the WhatsApp env bullet (lines 172-173):

```markdown
- **`OPENAI_API_KEY`** (brain + vision describer). For live-session caregiver alerts, set
  `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_TO`, `WHATSAPP_TEMPLATE=caregiver_alert`
  (4-var template: caregiver, patient, situation, session link), and `CAREGIVER_PORTAL_BASE_URL`
  (+ `CAREGIVER_SESSION_PATH` if koko's route differs from `/session/{id}`). Documented in the
  README — no `.env.example`.
```

- [ ] **Step 3: Verify no accidental code changes**

Run: `git diff --stat`
Expected: only `deploy/README.md` and `HANDOFF.md` changed.

- [ ] **Step 4: Commit**

```bash
git add deploy/README.md HANDOFF.md
git commit -m "docs: document caregiver_alert WhatsApp env vars + portal URL"
```

---

### Task 8: Full test-suite verification

- [ ] **Step 1: Run the whole suite**

Run: `pytest -q`
Expected: PASS — all prior tests plus the new `test_escalation_alert.py` and the added tests in `test_service_session.py`, `test_ws.py`, `test_run_session_server.py`. No failures.

- [ ] **Step 2: If green, no commit needed** (verification only).

---

## Self-Review

**Spec coverage:**
- Data gap (caregiver on SessionContext) → Task 2. ✓
- Situation phrase map ({{3}}) → Task 3. ✓
- `EscalationNotifier` (4 vars, phone-over-`WHATSAPP_TO`, URL build, swallow failure, hello_world warning) → Task 4. ✓
- Config additions → Task 1. ✓
- Wiring (ServerDeps.notifier + ws on_escalation, once-per-session via existing guard) → Task 5. ✓
- run_session_server builds notifier only when token set → Task 6. ✓
- {{4}} 404 caveat + caregiver_alert switch documented → Tasks 1, 7. ✓
- Text (`/infer`) path deferred → not implemented by design (spec "Out of scope"). ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `EscalationNotifier.__init__` keyword args (`template`, `lang`, `portal_base_url`, `session_path`, `fallback_to`) match the `_build_notifier()` call in Task 6 and the `_notifier(...)` test helper in Task 4. `notify(session_id, patient_name, caregiver, decision)` signature matches the `on_escalation` call in Task 5 and `FakeNotifier.notify` in Task 5's test. `SessionContext.caregiver` (Task 2) matches `ctx.caregiver` (Task 5). `situation_phrase(list[str])` (Task 3) matches its use in `_build` (Task 4). ✓
