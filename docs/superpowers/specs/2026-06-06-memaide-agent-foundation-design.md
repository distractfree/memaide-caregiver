# MemAide AI Agent Foundation — Design Spec

**Date:** 2026-06-06
**Status:** Approved (pending written-spec review)
**Owner:** Anthony

---

## 1. Background & Goal

MemAide is an assistive agent for elderly patients. When a patient presses a **Help**
button, an AI agent session starts: it talks with the patient over smart glasses
(audio + egocentric video), reassures and assists them, watches for genuine distress,
and bridges until a caregiver joins — escalating to emergency services if needed.

The full product (backend, caregiver portal, device apps, database) is being built by
teammates. **Their code is not yet available.** This spec covers only the piece we own
now: the **standalone AI agent foundation** — a Python package that is the agent
"brain" plus its supporting layers, designed to be cleanly integrated by the teammates'
backend later.

### Goal of this deliverable

A self-contained, well-tested Python package (`memaide`) that:

- Runs the core agent conversation logic over text, with vision and audio represented
  as text context.
- Carries a calibrated system prompt, few-shot examples, and patient-context injection.
- Performs LLM-independent, rule-based safety escalation.
- Models sessions and transcripts in the shape the backend will persist.
- Ships with a Claude-Opus-based evaluation harness so the prompt can be measured and
  iterated.

It explicitly does **not** own the database, the caregiver portal, or device hardware.
It exposes interfaces and emits records shaped to match the backend contracts.

---

## 2. Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Language / runtime | **Python** | Best fit for AI work, evals, Whisper, async; easiest to unit-test the brain. |
| Core architecture | **Hybrid: `gpt-4o-mini-realtime` voice + `gpt-4o-mini` vision** | `gpt-4o-mini-realtime` supports only text + audio (no vision). Frames are described to text by `gpt-4o-mini` (which does support images) and injected as context. Keeps everything on the mini family. |
| Integration surface | **Pure core module + thin WebSocket server** | A directly-callable, testable core plus a transport wrapper teammates pipe media into. |
| Build order | **Testable brain + prompt + eval first**, live media second | De-risks correctness before media plumbing. |
| Brain model | `gpt-4o-mini` (chat completions) | Per requirement; vision-capable for frame description. |
| Voice model (M2) | `gpt-4o-mini-realtime-preview` | Low-latency speech-to-speech; target < 1s. |
| Eval judge | **Claude Opus (`claude-opus-4-8`)** | Per task breakdown ("Claude Opus as judge"). Anthropic API. |

### Rejected alternatives

- **Single full `gpt-realtime`** (natively accepts audio + text + image): simplest data
  flow, but more expensive and not the `gpt-4o-mini` family the team specified.
- **Pure Whisper → mini → TTS pipeline**: easiest to test but ~2–3s latency; the hybrid
  keeps voice latency low while still being testable at the brain layer.

### Key accepted trade-off

Because `gpt-4o-mini-realtime` has no vision, video is **not** truly "inside" the voice
model. We convert frames to a short text scene description and inject it as conversation
context. This is a deliberate, documented limitation of the hybrid approach.

---

## 3. Milestones

### Milestone 1 — Testable brain + prompt + eval (build now)

Everything is **text-in / text-out**: vision arrives as a text scene description, audio
arrives as already-transcribed text. Fully unit-tested and evaluatable.

In scope:

- Agent brain (`gpt-4o-mini` chat) producing reply text + structured decision.
- System prompt (persona, safety rules, tone, task scope) + patient-context injection.
- 3–10 few-shot example exchanges.
- Rule-based escalation monitor (LLM-independent).
- Session orchestration: opening line, turn-taking, transcript, timestamps,
  handoff/escalation state.
- Data contracts (`PatientContext`, `Turn`, `VisionContext`, `AgentDecision`,
  `SessionRecord`) matching the backend `agent_sessions` schema.
- Claude-Opus evaluation harness with a representative dataset and scoring rubric.
- Vision/voice/WebSocket pieces present as **interfaces/stubs** so M2 just fills them in.

### Milestone 2 — Live media (next)

- `gpt-4o-mini-realtime` voice loop (speech-to-speech).
- `gpt-4o-mini` frame describer running every 5–10s.
- TTS / on-screen text output rendering.
- Thin WebSocket server wrapping a live session.
- Real (or teammate-provided) rule-based vision check feeding flags.

This spec drives **Milestone 1**. Milestone 2 is described for context and interface
shape only; it gets its own plan later.

---

## 4. Architecture

Layered, with each layer independently testable and communicating through small
contracts.

### 4.1 Agent core / brain — `agent/brain.py`

`AgentBrain.respond(state) -> AgentDecision`

- **Input:** conversation turns so far + latest patient utterance (text) + current
  `VisionContext` (text scene description + label) + `PatientContext`.
- **Output:** `AgentDecision` = reply text **plus** structured fields
  (`wants_escalation`, `handoff_ready`, `intent`).
- Uses `gpt-4o-mini` chat completions. The prompt assembles system prompt + few-shot +
  injected patient context + running transcript + the current vision context.
- This is the heart of the system: pure, deterministic to test (OpenAI mocked), and the
  unit the eval harness measures.

### 4.2 Vision layer — `vision/`

- `vision/describer.py` — `VisionDescriber`: frame → short scene description + scene
  label via `gpt-4o-mini` vision. **M2.** In M1 the brain simply accepts a
  `VisionContext` text value (supplied by tests or callers).
- `vision/rule_check.py` — `RuleBasedVisionCheck`: an LLM-independent interface returning
  flags such as `person_on_floor` or `no_motion`. Ships as a **pluggable stub** in M1 so
  teammates' real CV / glasses pipeline can implement it later. Its output feeds the
  escalation monitor.

### 4.3 Safety / escalation — `safety/escalation.py`

`EscalationMonitor` performs a **parallel, rule-based** check that runs independently of
the LLM and can fire before the model responds:

- Distress keywords detected in the (transcribed) patient text.
- Silence timer: no patient speech for X seconds.
- Vision flags from `RuleBasedVisionCheck` (e.g. `person_on_floor`).
- Combination rules (e.g. prolonged silence **and** an abnormal vision flag).

On trigger it returns an `EscalationDecision` that sets `escalated = true` and causes the
session to suggest an emergency call (911). Thresholds (`silence_seconds`, keyword list)
are configurable in `config.py`.

> Note: true acoustic distress detection needs raw audio features that are not available
> at the brain layer. In M1 the rule-based check operates on transcribed text + explicit
> keyword rules + vision flags + silence timing; richer acoustic signals can be added at
> the audio layer in M2.

### 4.4 Session orchestration — `agent/session.py`

`AgentSession` runs the loop and owns session state:

1. On start, the agent **speaks first** with a fixed opening line
   ("Hi, I'm here to help. Can you tell me what's wrong?").
2. Loop: receive patient input → run `EscalationMonitor` (parallel, may short-circuit)
   → fold in current `VisionContext` → `AgentBrain.respond()` → append turn → render
   reply (text now; TTS in M2) → repeat.
3. Handles turn-taking and silence detection.
4. Tracks timestamps and produces a `SessionRecord` on stop (timeout, patient resolved,
   or caregiver joined).

The session treats escalation as the logical OR of two independent signals: the
rule-based `EscalationMonitor` (the authoritative, LLM-independent guard) **or** the
brain's `AgentDecision.wants_escalation`. Either one sets `escalated = true` and triggers
the 911 suggestion; the rule-based path can fire before the brain has even responded.

### 4.5 Transport — `io/`

- `io/openai_client.py` — thin wrapper over the OpenAI SDK (chat + vision now; realtime
  stub for M2). Centralizes model names, retries, and error handling.
- `io/transport_ws.py` — thin WebSocket server wrapping a live `AgentSession`. **M2.**
  Defined as an interface in M1.

---

## 5. Data flow (one turn)

```
patient utterance (text / transcribed)
        + latest VisionContext
        + PatientContext
            │
            ├──> EscalationMonitor (parallel, rule-based) ──> may short-circuit to escalation
            │
            └──> AgentBrain.respond() ──> AgentDecision
                        │
                        └──> append Turn to transcript
                                 └──> render reply (text now; TTS in M2)
```

---

## 6. Data contracts

Defined with **pydantic** in `schemas.py`. These are the integration surface for the
backend; field names track the `agent_sessions` table in the task breakdown.

- **`PatientContext`** — `patient_id`, `name`, `preferred_name?`, `known_conditions: list[str]`,
  `language` (default `"en"`), `notes?`. Placeholder the DB maps to; injected into the
  prompt at session start.
- **`Turn`** — `role: "agent" | "patient" | "system"`, `text`, `ts` (ISO 8601),
  `scene_label?`.
- **`VisionContext`** — `description: str`, `label: str`, `ts`, `flags: list[str]`.
- **`AgentDecision`** — `reply_text`, `wants_escalation: bool`, `handoff_ready: bool`,
  `intent: str`.
- **`EscalationDecision`** — `escalate: bool`, `reason: str`, `triggered_by: list[str]`.
- **`SessionRecord`** — mirrors `agent_sessions`: `id`, `patient_id`,
  `related_caretaker_id?`, `started_at`, `ended_at?`, `handoff_at?`,
  `handoff_type: "caregiver_joined" | "timeout" | "patient_resolved" | None`,
  `transcript: list[Turn]`, `final_scene_label?`, `escalated: bool`,
  `status: "active" | "ended"`.
- **Enums** — `HandoffType`, `SessionStatus`, `Role`.

The package **emits** `SessionRecord`s (and progressive transcript turns); it does not
persist them — the backend owns the database.

---

## 7. Prompt & calibration

- `prompts/system_prompt.py` — `build_system_prompt(patient: PatientContext) -> str`
  covering:
  - **Persona:** calm, patient, reassuring.
  - **Safety rules:** escalate genuine distress immediately; never delay escalation for
    conversation.
  - **Tone:** warm and plain, appropriate for elderly patients, not clinical.
  - **Task scope:** bridge until the caregiver joins; assist independently if the
    caregiver does not join.
  - **Patient context injection:** name / preferred name, known conditions, language.
- `prompts/few_shot.py` — 3–10 ideal exchanges illustrating distress escalation,
  confusion, a medication question, and a calm reassurance flow.

---

## 8. Configuration

`config.py` centralizes:

- Model names: `BRAIN_MODEL = "gpt-4o-mini"`, `VISION_MODEL = "gpt-4o-mini"`,
  `REALTIME_MODEL = "gpt-4o-mini-realtime-preview"` (M2), `JUDGE_MODEL = "claude-opus-4-8"`.
- Escalation thresholds: `SILENCE_SECONDS`, distress keyword list.
- Vision interval (5–10s) for M2.
- API keys from env: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (judge only). `.env.example`
  documents these.

---

## 9. Testing & evaluation

### 9.1 Unit tests (TDD) — `tests/`

- `AgentDecision` parsing from model output.
- Escalation rules: distress keyword, silence timer, vision flag, combination rules.
- Session loop transitions: opening line, turn append, stop conditions, record emission.
- Schema validation and serialization (round-trips to the backend shape).
- Prompt assembly (patient context correctly injected).
- All OpenAI / Anthropic calls mocked in unit tests.

### 9.2 Evaluation harness — `eval/`

- `eval/dataset.py` — representative patient conversations covering distress, confusion,
  medication questions, and non-verbal / text input.
- `eval/run_eval.py` — CLI that runs each conversation through the brain and collects
  transcripts.
- `eval/judge.py` — **Claude Opus (`claude-opus-4-8`)** scores each transcript on:
  **Safety** (did it escalate genuine distress immediately?), **Clarity** (concise and
  appropriate for an elderly patient?), **Task completion** (need addressed?),
  **Tone** (calm and reassuring, not clinical?), **Handoff readiness** (useful context
  prepared for the caregiver?).
- Workflow: run → score → report → iterate system prompt & few-shot → re-run to confirm
  improvement.

---

## 10. Package layout

```
mem_aide/
  pyproject.toml
  .env.example
  README.md
  src/memaide/
    __init__.py
    config.py
    schemas.py
    prompts/
      __init__.py
      system_prompt.py
      few_shot.py
    agent/
      __init__.py
      brain.py
      session.py
    vision/
      __init__.py
      describer.py       # M2
      rule_check.py
    safety/
      __init__.py
      escalation.py
    io/
      __init__.py
      openai_client.py
      transport_ws.py    # M2
    eval/
      __init__.py
      dataset.py
      judge.py
      run_eval.py
  tests/
    test_schemas.py
    test_brain.py
    test_escalation.py
    test_session.py
    test_prompts.py
```

---

## 11. Dependencies & tooling

- `pydantic` — data contracts and validation.
- `openai` — chat + vision (and realtime in M2).
- `anthropic` — Claude Opus eval judge.
- `pytest` (+ `pytest-asyncio` if the loop is async) — tests.
- Standard `venv` + `pip` with `pyproject.toml`; `uv` optional.

---

## 12. Out of scope (owned by teammates / later milestones)

- Database persistence, caregiver portal UI, push notifications, WhatsApp alerts.
- Device hardware selection and the glasses/phone/watch audio + camera capture.
- Help-button event creation and caregiver "Join Call" handoff signaling (we model the
  handoff state and consume a handoff signal, but do not implement the portal side).
- Live audio capture, STT wiring, TTS playback, and the WebSocket server implementation
  (Milestone 2).

---

## 13. Open questions / assumptions to confirm during implementation

- Exact `PatientContext` field set the backend will provide (current set is a reasonable
  placeholder).
- Whether the session loop should be `async` end-to-end now (recommended, to ease M2
  realtime/WebSocket) or sync in M1. Default: **async**.
- Final distress-keyword list and silence threshold (will be tuned via the eval harness).
