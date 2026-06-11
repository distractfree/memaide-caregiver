import json
from typing import Any

from memaide import config


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
        temperature: float = 0.4,
    ) -> dict:
        resp = await self._client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            response_format={"type": "json_object"},
        )
        return json.loads(resp.choices[0].message.content)
