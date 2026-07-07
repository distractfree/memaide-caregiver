from fastapi.testclient import TestClient

from memaide import config
from memaide.schemas import AgentDecision
from memaide.service.app import ServiceDeps, create_app


class StubBrain:
    def __init__(self, decision=None, raises=False):
        self._decision = decision or AgentDecision(reply_text="Let's sit down.")
        self._raises = raises

    async def respond(self, transcript, vision=None, extra_context=None):
        if self._raises:
            raise RuntimeError("upstream boom")
        return self._decision


def _client(brain, monkeypatch, api_key=None):
    monkeypatch.setattr(config, "AI_AGENT_API_KEY", api_key)
    deps = ServiceDeps(make_brain=lambda patient: brain)
    return TestClient(create_app(deps))


def _payload():
    return {
        "session": {"session_id": "s1"},
        "patient": {"patient_id": "p1", "name": "Rose"},
        "latest_message": "I feel dizzy",
    }


def test_health_ok(monkeypatch):
    client = _client(StubBrain(), monkeypatch)
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_infer_happy_path(monkeypatch):
    client = _client(StubBrain(), monkeypatch)
    r = client.post("/infer", json=_payload())
    assert r.status_code == 200
    body = r.json()
    assert body["reply_text"] == "Let's sit down."
    assert body["escalate"] is False


def test_infer_rejects_bad_api_key(monkeypatch):
    client = _client(StubBrain(), monkeypatch, api_key="secret")
    r = client.post("/infer", json=_payload(), headers={"X-Api-Key": "wrong"})
    assert r.status_code == 401


def test_infer_accepts_good_api_key(monkeypatch):
    client = _client(StubBrain(), monkeypatch, api_key="secret")
    r = client.post("/infer", json=_payload(), headers={"X-Api-Key": "secret"})
    assert r.status_code == 200


def test_infer_422_on_malformed_body(monkeypatch):
    client = _client(StubBrain(), monkeypatch)
    r = client.post("/infer", json={"session": {"session_id": "s1"}})
    assert r.status_code == 422


def test_infer_502_on_brain_failure(monkeypatch):
    client = _client(StubBrain(raises=True), monkeypatch)
    r = client.post("/infer", json=_payload())
    assert r.status_code == 502
