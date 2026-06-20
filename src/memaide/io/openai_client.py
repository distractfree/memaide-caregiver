import asyncio
import json
from typing import Any

from memaide import config

# The gpt-5.4 endpoint intermittently returns a 400 whose message is a server-side
# body-read failure rather than a validation error ("something went wrong reading
# your request", with null param/code). It is transient and clears on retry.
_TRANSIENT_MESSAGES = ("something went wrong reading your request",)
_TRANSIENT_STATUS = {408, 409, 429, 500, 502, 503, 504}
_TRANSIENT_TYPES = {"APIConnectionError", "APITimeoutError", "InternalServerError"}


def _is_transient_error(exc: Exception) -> bool:
    """True for errors worth retrying (flaky network / server / the gpt-5.4 body-read 400)."""
    if type(exc).__name__ in _TRANSIENT_TYPES:
        return True
    if getattr(exc, "status_code", None) in _TRANSIENT_STATUS:
        return True
    msg = str(exc).lower()
    return any(m in msg for m in _TRANSIENT_MESSAGES)


class OpenAIClient:
    """Wraps AsyncOpenAI; ``complete_json`` returns a parsed dict.

    Pass ``client`` to inject a fake/SDK instance in tests. In production it
    lazily constructs ``AsyncOpenAI`` from the configured API key.
    """

    def __init__(self, api_key: str | None = None, client: Any | None = None):
        if client is not None:
            self._client = client
        else:
            from openai import AsyncOpenAI

            self._client = AsyncOpenAI(api_key=api_key or config.OPENAI_API_KEY)

    async def complete_json(
        self,
        messages: list[dict],
        model: str = config.BRAIN_MODEL,
        temperature: float | None = 0.4,
        max_retries: int = 4,
        retry_base_delay: float = 1.0,
    ) -> dict:
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "response_format": {"type": "json_object"},
        }
        if temperature is not None and model not in config.FIXED_TEMPERATURE_MODELS:
            kwargs["temperature"] = temperature

        delay = retry_base_delay
        for attempt in range(max_retries):
            try:
                resp = await self._client.chat.completions.create(**kwargs)
                return json.loads(resp.choices[0].message.content)
            except Exception as exc:  # noqa: BLE001 - re-raised unless transient
                if attempt == max_retries - 1 or not _is_transient_error(exc):
                    raise
                if delay:
                    await asyncio.sleep(delay)
                delay *= 2

    async def complete_json_with_raw(
        self,
        messages: list[dict],
        model: str = config.BRAIN_MODEL,
        temperature: float | None = None,
    ) -> tuple[dict, Any]:
        """Eval-only: like ``complete_json`` but also returns the raw SDK response.

        No retry wrapper — the eval tolerates per-frame failures itself. Lets the
        vision eval read ``resp.usage`` for cost computation.
        """
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "response_format": {"type": "json_object"},
        }
        if temperature is not None and model not in config.FIXED_TEMPERATURE_MODELS:
            kwargs["temperature"] = temperature
        resp = await self._client.chat.completions.create(**kwargs)
        data = json.loads(resp.choices[0].message.content)
        return data, resp
