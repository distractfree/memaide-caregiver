import logging

from fastapi import Header, HTTPException

from memaide import config

_log = logging.getLogger(__name__)


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """FastAPI dependency: enforce X-Api-Key when AI_AGENT_API_KEY is configured.

    When the env var is unset, auth is disabled (dev convenience) with a warning.
    """
    expected = config.AI_AGENT_API_KEY
    if not expected:
        _log.warning("AI_AGENT_API_KEY not set; /infer auth is DISABLED (dev mode).")
        return None
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="invalid or missing API key")
    return None
