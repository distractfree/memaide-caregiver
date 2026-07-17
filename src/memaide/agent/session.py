from datetime import datetime, timezone
from typing import Any, Callable

from memaide import config
from memaide.safety.escalation import EscalationMonitor
from memaide.schemas import (
    EscalationDecision,
    HandoffType,
    PatientContext,
    Role,
    SessionRecord,
    SessionStatus,
    Turn,
    VisionContext,
)


def _default_clock() -> datetime:
    return datetime.now(timezone.utc)


class AgentSession:
    """Drives one patient conversation and emits a SessionRecord on stop.

    ``brain`` must expose ``async respond(transcript, vision=None) -> AgentDecision``.
    """

    def __init__(
        self,
        brain: Any,
        patient: PatientContext,
        escalation_monitor: EscalationMonitor | None = None,
        session_id: str | None = None,
        related_caretaker_id: str | None = None,
        clock: Callable[[], datetime] | None = None,
    ):
        self.brain = brain
        self.patient = patient
        self.escalation = escalation_monitor or EscalationMonitor()
        self._clock = clock or _default_clock
        self.id = session_id or _new_id()
        self.related_caretaker_id = related_caretaker_id

        self.transcript: list[Turn] = []
        self.escalated = False
        self.status = SessionStatus.ACTIVE
        self.started_at = self._clock()
        self.ended_at: datetime | None = None
        self.handoff_at: datetime | None = None
        self.handoff_type: HandoffType | None = None
        self._final_scene_label: str | None = None
        self.last_escalation: EscalationDecision | None = None

    def start(self) -> Turn:
        opening = Turn(role=Role.AGENT, text=config.OPENING_LINE, ts=self._clock())
        self.transcript.append(opening)
        return opening

    async def handle_patient_input(
        self,
        text: str,
        vision: VisionContext | None = None,
        seconds_since_last_speech: float = 0.0,
        vision_pending: bool = False,
    ) -> Turn:
        self.transcript.append(
            Turn(
                role=Role.PATIENT,
                text=text,
                ts=self._clock(),
                scene_label=vision.label if vision else None,
            )
        )

        escalation = self.escalation.check(text, vision, seconds_since_last_speech)
        self.last_escalation = escalation
        decision = await self.brain.respond(
            self.transcript, vision, vision_pending=vision_pending
        )
        escalate = escalation.escalate or decision.wants_escalation
        if escalate:
            self.escalated = True

        reply_text = decision.reply_text
        if escalate and config.EMERGENCY_SUGGESTION not in reply_text:
            reply_text = f"{reply_text} {config.EMERGENCY_SUGGESTION}".strip()

        if vision is not None:
            self._final_scene_label = vision.label

        agent_turn = Turn(role=Role.AGENT, text=reply_text, ts=self._clock())
        self.transcript.append(agent_turn)
        return agent_turn

    def on_silence_tick(
        self,
        seconds_since_last_speech: float,
        vision: VisionContext | None = None,
    ) -> Turn | None:
        """Let the rule-based silence+abnormal-vision escalation fire without speech.

        Runs the escalation check with no patient text; if it escalates, appends an
        agent Turn carrying the emergency suggestion and flips ``escalated``. Returns
        the Turn, or None when nothing escalates. Additive — the normal turn flow is
        unchanged and the brain is not called.
        """
        decision = self.escalation.check(None, vision, seconds_since_last_speech)
        self.last_escalation = decision
        if not decision.escalate:
            return None
        self.escalated = True
        if vision is not None:
            self._final_scene_label = vision.label
        turn = Turn(
            role=Role.AGENT, text=config.EMERGENCY_SUGGESTION, ts=self._clock()
        )
        self.transcript.append(turn)
        return turn

    def stop(self, handoff_type: HandoffType) -> SessionRecord:
        self.status = SessionStatus.ENDED
        self.ended_at = self._clock()
        self.handoff_type = handoff_type
        if handoff_type == HandoffType.CAREGIVER_JOINED:
            self.handoff_at = self._clock()
        return SessionRecord(
            id=self.id,
            patient_id=self.patient.patient_id,
            related_caretaker_id=self.related_caretaker_id,
            started_at=self.started_at,
            ended_at=self.ended_at,
            handoff_at=self.handoff_at,
            handoff_type=self.handoff_type,
            transcript=self.transcript,
            final_scene_label=self._final_scene_label,
            escalated=self.escalated,
            status=self.status,
        )


def _new_id() -> str:
    import uuid

    return uuid.uuid4().hex
