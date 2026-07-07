from memaide.service.schemas import InferRequest, InferResponse


def _minimal_request_dict():
    return {
        "session": {"session_id": "s1"},
        "patient": {"patient_id": "p1", "name": "Rose"},
        "latest_message": "I feel dizzy",
    }


def test_infer_request_parses_minimal_payload():
    req = InferRequest.model_validate(_minimal_request_dict())
    assert req.patient.name == "Rose"
    assert req.latest_message == "I feel dizzy"
    assert req.vitals is None
    assert req.beacons_triggered == []
    assert req.seconds_since_last_speech == 0.0


def test_infer_request_parses_full_payload():
    data = _minimal_request_dict()
    data["patient"].update({
        "age": 78, "bio_info": "Lives alone.", "known_conditions": ["diabetes"],
        "medications": [{"name": "Metformin", "dose": "500mg"}],
        "caregiver": {"id": "c1", "name": "John", "phone": "+1"},
    })
    data["vitals"] = {"heart_rate": 82, "motion_state": "still", "step_count": 1203}
    data["beacons_triggered"] = [{"room": "bathroom", "dwell_seconds": 240}]
    data["history"] = [{"role": "ai", "text": "Hi"}, {"role": "patient", "text": "hi"}]
    req = InferRequest.model_validate(data)
    assert req.patient.medications[0].name == "Metformin"
    assert req.vitals.heart_rate == 82
    assert req.beacons_triggered[0].room == "bathroom"
    assert req.patient.caregiver.name == "John"
    assert req.history[1].role == "patient"


def test_infer_response_defaults():
    resp = InferResponse(reply_text="ok")
    assert resp.escalate is False
    assert resp.escalation.reason == ""
    assert resp.escalation.triggered_by == []
    assert resp.intent == "assist"
