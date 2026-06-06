# MemAide AI Agent — Task Breakdown

---

## 1. Help Button Integration

- [ ] Trigger agent session start in parallel when the Help button is pressed
- [ skip for now] Create `help_event` in the backend on Help press
- [skip for now ] Fire caregiver alert (WhatsApp notification) simultaneously with agent session start
- [ ] Implement agent session stop when the session ends (timeout, patient resolved, or caregiver joined)

---

## 2. Audio Input Pipeline

- [ ] Set glasses microphone as the preferred audio input source
- [ ] Implement phone microphone as fallback if glasses mic is unavailable
- [ ] Implement watch as secondary fallback audio source
- [ ] Pipe microphone audio to the agent service via WebSocket in real time

---

## 3. Vision Pipeline

- [ ] Activate camera/egocentric stream on session start (glasses preferred, phone camera fallback)
- [ ] Capture vision frames on an interval (every 5–10 seconds) during the session
- [ ] Inject vision frames as context into the LLM at each capture interval
- [ ] Implement parallel rule-based vision check independent of the LLM (e.g., patient on the floor, no movement detected for X seconds triggers immediate escalation without waiting for LLM response)

---

## 4. Agent Response Output

- [ ] Deliver agent responses as TTS audio played to the patient
- [ ] Display agent responses as on-screen text simultaneously (subtitle/overlay)
- [ ] Show text input fallback UI on screen for non-verbal patients

---

## 5. Agent Session Loop

- [ ] Implement the core agent loop: listen → capture vision context → generate response → speak → repeat
- [ ] Have the agent speak first at session start ("Hi, I'm here to help. Can you tell me what's wrong?")
- [ ] Handle turn-taking and silence detection within the loop

---

## 6. Caregiver Handoff

- [ ] Detect when the caregiver joins (caregiver presses "Join Call" in portal, fires handoff event)
- [ ] On handoff detection, gracefully exit the agent (stop speaking, stop loop)
- [ ] Record `handoff_at` timestamp and set `handoff_type` to `caregiver_joined` in the session record
- [ ] If caregiver does not join and escalation is triggered, set `handoff_type` to `timeout` and flag `escalated = true`

---

## 7. Caregiver Portal Integration

- [ ] Send caregiver a push notification on session start that includes the live stream link and transcript URL
- [ ] Display live transcript in the caregiver portal alongside the egocentric stream
- [ ] Add "Join Call" button in portal that fires the handoff event to the backend
- [ ] Show agent session status (active, ended, escalated) in the portal

---

## 8. Database

- [ ] Create `agent_sessions` table with the following fields:
  - `id`
  - `patient_id`
  - `related_caretaker_id`
  - `started_at`
  - `ended_at`
  - `handoff_at` (null if caregiver never joined)
  - `handoff_type` — `caregiver_joined` | `timeout` | `patient_resolved`
  - `transcript` — JSONB array of conversation turns
  - `final_scene_label`
  - `escalated` — bool, true if 911 was suggested
  - `status` — `active` | `ended`
- [ ] Write transcript turns to the JSONB field progressively as the session runs

---

## 9. AI Stack Setup

- [ ] Select final model stack (GPT-4o mini Realtime API or Gemini 2.5 Flash + Whisper + TTS)
- [ ] Set up API credentials and streaming connection to the selected provider
- [ ] Confirm end-to-end voice latency is under 3 seconds; target under 1 second if using GPT-4o mini Realtime
- [ ] Profile each stage of the pipeline (STT, LLM, TTS) to identify bottlenecks if latency target is missed

---

## 10. Agent Calibration

- [ ] Write the agent system prompt covering:
  - Agent persona (calm, patient, reassuring)
  - Safety rules (escalate genuine distress immediately, never delay for conversation)
  - Tone guidelines (appropriate for elderly patients, not clinical)
  - Task scope (bridge until caregiver joins; assist independently if caregiver does not join)
- [ ] Add 3–10 few-shot examples directly in the system prompt showing ideal agent exchanges
- [ ] Inject relevant patient context from the database into the prompt at session start (name, known conditions if available)

---

## 11. Emergency Escalation

- [ ] Implement parallel rule-based escalation check that runs independently of the LLM
- [ ] Trigger escalation conditions: genuine distress detected in audio, no speech for X seconds combined with abnormal vision context
- [ ] On escalation, suggest emergency call (911) to patient and set `escalated = true` in session record
- [ ] Surface escalation status immediately in the caregiver portal

---

## 12. Evaluation

- [ ] Build a test set of representative patient conversations (covering distress, confusion, medication questions, non-verbal input)
- [ ] Run each test conversation through the agent
- [ ] Evaluate transcripts using Claude Opus as judge, scoring each on:
  - Safety: Did the agent escalate genuine distress immediately?
  - Clarity: Were responses concise and appropriate for an elderly patient?
  - Task completion: Was the patient's need addressed?
  - Tone: Was the agent calm and reassuring, not clinical?
  - Handoff readiness: Did the agent prepare useful context for the caregiver?
- [ ] Iterate on system prompt and few-shot examples based on evaluation scores
- [ ] Re-run evaluation after each prompt iteration to confirm improvement
