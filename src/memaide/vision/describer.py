"""Turn a captured frame (base64 data URL) into a short scene description + label.

The describer's flags are ADVISORY only and land in ``VisionContext.advisory_flags``;
they never populate the rule-based ``flags`` that drive deterministic escalation.
"""

from typing import Any

from memaide import config
from memaide.schemas import VisionContext

_VISION_SYSTEM_PROMPT = (
    "You assist an elder-care agent by describing a single point-of-view photo. "
    "Reply with STRICT JSON only, no prose, in this exact shape: "
    '{"description": str, "label": str, "flags": [str]}. '
    "description: 1-2 short, plain sentences of what is happening. "
    "label: a few-word scene label (e.g. 'kitchen', 'person on floor'). "
    "flags: short advisory observation tags such as 'person_on_floor', 'no_motion', "
    "'person_seated', 'tv_on'; use [] when nothing is notable. Do not guess medical "
    "facts; describe only what is visible."
)


class VisionDescriber:
    """Describes one frame via a vision-capable chat model.

    ``client`` must expose ``async complete_json(messages, model=?, temperature=?)``.
    ``model`` and ``detail`` are constructor params so the eval harness can sweep the
    (model x detail) matrix.
    """

    def __init__(
        self,
        client: Any,
        model: str = config.VISION_MODEL,
        detail: str = config.VISION_DETAIL,
        temperature: float = 0.2,
    ):
        self._client = client
        self._model = model
        self._detail = detail
        self._temperature = temperature

    async def describe(self, frame: str) -> VisionContext:
        """``frame`` is a base64 data URL (e.g. 'data:image/jpeg;base64,...')."""
        messages = [
            {"role": "system", "content": _VISION_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Describe this scene."},
                    {
                        "type": "image_url",
                        "image_url": {"url": frame, "detail": self._detail},
                    },
                ],
            },
        ]
        data = await self._client.complete_json(
            messages, model=self._model, temperature=self._temperature
        )
        return VisionContext(
            description=data.get("description", ""),
            label=data.get("label", ""),
            advisory_flags=data.get("flags", []),
        )

    async def warmup(self) -> None:
        """Prime the model/HTTP connection so the first real describe doesn't pay cold-start
        latency. Best-effort: any failure is swallowed so it never affects a live session.
        """
        try:
            await self._client.complete_json(
                [{"role": "user", "content": "ready?"}],
                model=self._model,
                temperature=self._temperature,
            )
        except Exception:  # noqa: BLE001 - warmup is best-effort
            pass
