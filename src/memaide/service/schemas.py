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
