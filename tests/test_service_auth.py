import pytest
from fastapi import HTTPException

from memaide import config
from memaide.service.auth import require_api_key


def test_auth_disabled_when_key_unset(monkeypatch):
    monkeypatch.setattr(config, "AI_AGENT_API_KEY", None)
    assert require_api_key(x_api_key=None) is None


def test_auth_rejects_missing_or_wrong_key(monkeypatch):
    monkeypatch.setattr(config, "AI_AGENT_API_KEY", "secret")
    with pytest.raises(HTTPException) as exc:
        require_api_key(x_api_key=None)
    assert exc.value.status_code == 401
    with pytest.raises(HTTPException):
        require_api_key(x_api_key="wrong")


def test_auth_accepts_correct_key(monkeypatch):
    monkeypatch.setattr(config, "AI_AGENT_API_KEY", "secret")
    assert require_api_key(x_api_key="secret") is None
