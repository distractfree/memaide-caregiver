from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Role(str, Enum):
    AGENT = "agent"
    PATIENT = "patient"
    SYSTEM = "system"


class HandoffType(str, Enum):
    CAREGIVER_JOINED = "caregiver_joined"
    TIMEOUT = "timeout"
    PATIENT_RESOLVED = "patient_resolved"


class SessionStatus(str, Enum):
    ACTIVE = "active"
    ENDED = "ended"


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


class Turn(BaseModel):
    role: Role
    text: str
    ts: datetime = Field(default_factory=_now)
    scene_label: str | None = None


class VisionContext(BaseModel):
    description: str
    label: str
    ts: datetime = Field(default_factory=_now)
    flags: list[str] = Field(default_factory=list)
    advisory_flags: list[str] = Field(default_factory=list)


class AgentDecision(BaseModel):
    model_config = ConfigDict(extra="ignore")

    reply_text: str
    wants_escalation: bool = False
    handoff_ready: bool = False
    intent: str = "assist"


class EscalationDecision(BaseModel):
    escalate: bool
    reason: str = ""
    triggered_by: list[str] = Field(default_factory=list)


class SessionRecord(BaseModel):
    id: str
    patient_id: str
    related_caretaker_id: str | None = None
    started_at: datetime
    ended_at: datetime | None = None
    handoff_at: datetime | None = None
    handoff_type: HandoffType | None = None
    transcript: list[Turn] = Field(default_factory=list)
    final_scene_label: str | None = None
    escalated: bool = False
    status: SessionStatus = SessionStatus.ACTIVE
