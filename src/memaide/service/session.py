"""Build a SessionContext from koko's /session/start body and stash it in the registry.

Reuses `_to_patient_context` from the /infer path so the patient block is interpreted
identically on both the text and voice paths.
"""

from memaide.service.infer import _to_patient_context
from memaide.service.schemas import SessionStartRequest
from memaide.service.session_registry import SessionContext, SessionRegistry


def register_session(req: SessionStartRequest, registry: SessionRegistry) -> None:
    ctx = SessionContext(
        session_id=req.session_id,
        patient=_to_patient_context(req.patient),
        vitals=req.vitals,
        beacons=list(req.beacons),
        caregiver=req.patient.caregiver,
    )
    registry.put_context(req.session_id, ctx)
