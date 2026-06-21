# MemAide Agent Foundation

The standalone AI agent "brain" for MemAide: an assistive voice agent for elderly
patients. This package is text-driven and fully testable; live audio/video (gpt-4o-mini
realtime + frame describer + TTS + WebSocket server) is Milestone 2.

## Layout
See [docs/architecture.md](docs/architecture.md) for module diagrams and data flow.

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
# Then create a .env file in the repo root that sets OPENAI_API_KEY.
```

## Test
```bash
.venv\Scripts\python -m pytest -v
```

## Evaluate (needs only OPENAI_API_KEY)

Runs every dataset conversation through each model in `EVAL_MODELS` and writes transcripts
to `docs/eval-runs/<run_id>/<model>/` (JSON + a self-contained markdown that includes the
scoring rubric), where `<run_id>` is a unique timestamp per run (e.g. `run-20260617-143205`).
Each run also drops a `run.json` manifest (models, case count, few-shot-example count,
per-model escalation accuracy). Paste a markdown file into a chat to score it against the
rubric — no Anthropic key needed.

```bash
.venv\Scripts\python -m memaide.eval.run_eval
```

Optional automated API judge (Claude): `pip install -e ".[judge]"`, set `ANTHROPIC_API_KEY`,
then use `memaide.eval.run_case` with `memaide.eval.judge.Judge`.

### Vision-describer eval

Add point-of-view frames (`.jpg`/`.jpeg`/`.png`) to `src/memaide/eval/vision_frames/`,
then run:

```bash
.venv\Scripts\python -m memaide.eval.run_vision_eval
```

This sweeps gpt-4o-mini and gpt-5.4-mini at `low` and `high` image detail over every
frame and writes a comparison run under `docs/vision-eval-runs/<run-id>/` (open
`comparison.md` to see each image next to all four models' description/label/flags and
cost). Needs `OPENAI_API_KEY` and access to both models; a handful of frames is a few
cents per run.

### Live voice + media server (M2)

The WebSocket server (`memaide.server.ws`) carries the Ray-Ban POV-camera and microphone
streams over one connection and runs two concurrent tasks per session: the throttled
vision pipeline (keeps the latest scene) and a turn-based voice loop
(**STT → text brain → TTS**). The audio models (`gpt-4o-mini-transcribe`,
`gpt-4o-mini-tts`) are pure converters; all reasoning stays in the text brain and the
rule-based safety monitor. A silence tick lets the "silence + abnormal vision" escalation
fire without patient speech.

Every seam (describer, STT, TTS, brain) is injected via `ServerDeps`, so the whole stack
runs against stubs in tests with no network or audio devices. To run a real server you
provide a `ServerDeps` with live `VisionDescriber`, `SpeechToText`, `TextToSpeech`, and a
brain factory, then `await serve(deps)` (needs `OPENAI_API_KEY` and the `websockets`
package). The Ray-Ban mobile app (Meta Wearables toolkit) is the client; on-device capture
is out of scope for this repo.

## Integration notes for the backend team
- Construct one `AgentSession` per Help-button session; call `start()` (agent speaks
  first), then `handle_patient_input(text, vision=?, seconds_since_last_speech=?)` per
  patient turn, then `stop(handoff_type)` to get a `SessionRecord`.
- `SessionRecord` fields mirror the `agent_sessions` table; persist `transcript`
  progressively from `session.transcript` if needed.
- Provide `PatientContext` from the patient record at session start.
- Replace `StubVisionCheck` with a real `VisionCheck` implementation to feed vision flags.




File Notes: 
Brain.py: The agent brain: turns transcript + vision context into an AgentDecision.
Session.py: Session orchestration: opening line, turn loop, transcript, and stop record.
Schemas.py: Pydantic data contracts shared across the agent and with the backend.
Escalation.py: LLM-independent, rule-based escalation check.
Config.py: Central configuration: model names, thresholds, and env-derived secrets.
prompts.py: LLM system prompt and few-shot examples.
Openai_client.py: Thin async wrapper over the OpenAI SDK returning parsed JSON objects.
Run_eval.py: Run the agent over the eval dataset and export transcripts for scoring.
Dataset.py: Representative patient conversations used to evaluate the agent.
few_shot.py: Few-shot example exchanges embedded directly into the system prompt.
System_prompt.py: Build the agent system prompt, including injected patient context.

