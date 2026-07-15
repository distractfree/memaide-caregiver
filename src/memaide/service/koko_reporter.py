"""POSTs live-session events back to koko. Best-effort: failures are logged, never raised.

A no-op when `base_url` is unset (dev), so the live session runs standalone. `client` is an
httpx.AsyncClient-shaped object exposing `async post(url, json=..., headers=...)`; when None,
a short-lived httpx client is created per call.
"""

import logging
from typing import Any

from memaide.schemas import EscalationDecision, SessionRecord, VisionContext

_log = logging.getLogger(__name__)


class KokoReporter:
    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        client: Any = None,
        timeout: float = 5.0,
    ):
        self._base = base_url.rstrip("/") if base_url else None
        self._api_key = api_key
        self._client = client
        self._timeout = timeout

    @property
    def enabled(self) -> bool:
        return self._base is not None

    async def escalation(self, session_id: str, decision: EscalationDecision) -> None:
        await self._post(
            f"/ai-sessions/{session_id}/escalation",
            {"reason": decision.reason, "triggered_by": list(decision.triggered_by)},
        )

    async def conclude(
        self, session_id: str, record: SessionRecord, outcome: str
    ) -> None:
        body = record.model_dump(mode="json")
        body["outcome"] = outcome
        await self._post(f"/ai-sessions/{session_id}/conclude", body)

    async def frame(
        self, session_id: str, ctx: VisionContext, frame_url: str | None, seq: int
    ) -> None:
        body: dict = {
            "seq": seq,
            "ts": ctx.ts.isoformat(),
            "vision": {
                "description": ctx.description,
                "label": ctx.label,
                "flags": list(ctx.flags),
                "advisory_flags": list(ctx.advisory_flags),
            },
        }
        if frame_url:
            b64 = frame_url.split(",", 1)[1] if "," in frame_url else frame_url
            body["image"] = {"mime": "image/jpeg", "b64": b64}
        await self._post(f"/ai-sessions/{session_id}/frames", body)

    async def _post(self, path: str, body: dict) -> None:
        if self._base is None:
            _log.info("[koko] no-op (KOKO_BASE_URL unset): would POST %s", path)
            return
        url = f"{self._base}{path}"
        headers = {"X-Api-Key": self._api_key} if self._api_key else {}
        try:
            if self._client is not None:
                await self._client.post(url, json=body, headers=headers)
            else:
                import httpx

                async with httpx.AsyncClient(timeout=self._timeout) as c:
                    await c.post(url, json=body, headers=headers)
        except Exception as exc:  # noqa: BLE001 - best-effort; never crash the session
            _log.warning("[koko] POST %s failed: %s", path, exc)
