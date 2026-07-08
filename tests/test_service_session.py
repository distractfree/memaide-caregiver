from fastapi.testclient import TestClient

from memaide import config
from memaide.schemas import AgentDecision
from memaide.service.app import ServiceDeps, create_app
from memaide.service.session_registry import SessionRegistry


class StubBrain:
    async def respond(self, transcript, vision=None, extra_context=None):
        return AgentDecision(reply_text="ok")


def _client(registry, monkeypatch, api_key=None):
    monkeypatch.setattr(config, "AI_AGENT_API_KEY", api_key)
    deps = ServiceDeps(make_brain=lambda patient: StubBrain(), registry=registry)
    return TestClient(create_app(deps))


def _payload():
    return {
        "session_id": "s1",
        "patient": {"patient_id": "p1", "name": "Rose"},
        "vitals": {"heart_rate": 90},
        "beacons": [{"room": "kitchen"}],
    }


def test_session_start_registers_context(monkeypatch):
    reg = SessionRegistry()
    client = _client(reg, monkeypatch)
    r = client.post("/session/start", json=_payload())
    assert r.status_code == 200
    assert r.json() == {"status": "registered"}
    assert "s1" in reg._ctx
    assert reg._ctx["s1"].patient.name == "Rose"
    assert reg._ctx["s1"].vitals.heart_rate == 90


def test_session_start_preserves_caregiver(monkeypatch):
    reg = SessionRegistry()
    client = _client(reg, monkeypatch)
    payload = _payload()
    payload["patient"]["caregiver"] = {"name": "Anthony", "phone": "+15551234567"}
    r = client.post("/session/start", json=payload)
    assert r.status_code == 200
    cg = reg._ctx["s1"].caregiver
    assert cg is not None
    assert cg.name == "Anthony"
    assert cg.phone == "+15551234567"


def test_session_start_rejects_bad_api_key(monkeypatch):
    client = _client(SessionRegistry(), monkeypatch, api_key="secret")
    r = client.post("/session/start", json=_payload(), headers={"X-Api-Key": "wrong"})
    assert r.status_code == 401


def test_session_start_422_on_malformed_body(monkeypatch):
    client = _client(SessionRegistry(), monkeypatch)
    r = client.post("/session/start", json={"session_id": "s1"})  # no patient
    assert r.status_code == 422


def test_session_start_503_without_registry(monkeypatch):
    monkeypatch.setattr(config, "AI_AGENT_API_KEY", None)
    deps = ServiceDeps(make_brain=lambda patient: StubBrain())  # registry defaults None
    client = TestClient(create_app(deps))
    r = client.post("/session/start", json=_payload())
    assert r.status_code == 503
