# MemAide Agent Foundation

The standalone AI agent "brain" for MemAide: an assistive voice agent for elderly
patients. This package is text-driven and fully testable; live audio/video (gpt-4o-mini
realtime + frame describer + TTS + WebSocket server) is Milestone 2.

## Layout
- `memaide.schemas` — pydantic data contracts (the backend integration surface).
- `memaide.agent.brain` — `AgentBrain.respond()` → structured `AgentDecision` (gpt-4o-mini).
- `memaide.agent.session` — `AgentSession` turn loop → `SessionRecord`.
- `memaide.safety.escalation` — LLM-independent rule-based escalation.
- `memaide.prompts` — system prompt + few-shot examples.
- `memaide.vision` — pluggable rule-based check (stub) + M2 describer placeholder.
- `memaide.eval` — dataset, Claude Opus judge, and runner.

## Setup
```bash
python -m venv .venv
.venv\Scripts\python -m pip install -e ".[dev]"
copy .env.example .env   # then fill in OPENAI_API_KEY and ANTHROPIC_API_KEY
```

## Test
```bash
.venv\Scripts\python -m pytest -v
```

## Evaluate (needs API keys)
```bash
.venv\Scripts\python -m memaide.eval.run_eval
```

## Integration notes for the backend team
- Construct one `AgentSession` per Help-button session; call `start()` (agent speaks
  first), then `handle_patient_input(text, vision=?, seconds_since_last_speech=?)` per
  patient turn, then `stop(handoff_type)` to get a `SessionRecord`.
- `SessionRecord` fields mirror the `agent_sessions` table; persist `transcript`
  progressively from `session.transcript` if needed.
- Provide `PatientContext` from the patient record at session start.
- Replace `StubVisionCheck` with a real `VisionCheck` implementation to feed vision flags.
