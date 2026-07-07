from typing import Any, Callable

from memaide import config
from memaide.safety.escalation import EscalationMonitor
from memaide.schemas import Medication, PatientContext, Role, Turn
from memaide.service.schemas import (
    EscalationInfo,
    HistoryItem,
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


def _build_transcript(history: list[HistoryItem], latest_message: str) -> list[Turn]:
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
    """Run one stateless inference turn for koko's /infer call.

    Rebuilds an ephemeral PatientContext + transcript from the request, runs a single
    AgentBrain turn, OR-s in the rule-based EscalationMonitor, and maps the result to an
    InferResponse. No session state is retained; AgentSession is intentionally not used
    (that is the stateful voice path). ``vision`` is None on this text path — the request's
    ``vision`` field is always null until Slice 2 populates it.
    """
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
