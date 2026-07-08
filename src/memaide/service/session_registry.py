"""In-memory correlation between koko's context POST and the media WebSocket.

`/session/start` calls `put_context(session_id, ctx)`; the WebSocket `hello` calls
`wait_context(session_id)`. The per-session `asyncio.Event` is created on demand by
whichever side arrives first, so arrival order does not matter. `drop` clears a session
on conclude (or via a periodic sweep for a context whose WebSocket never connected).
"""

import asyncio
from dataclasses import dataclass, field
from typing import Any

from memaide.schemas import PatientContext
from memaide.service.schemas import CaregiverInfo


@dataclass
class SessionContext:
    session_id: str
    patient: PatientContext
    vitals: Any = None
    beacons: list = field(default_factory=list)
    caregiver: CaregiverInfo | None = None


class SessionRegistry:
    def __init__(self, wait_timeout: float = 10.0):
        self._ctx: dict[str, SessionContext] = {}
        self._ready: dict[str, asyncio.Event] = {}
        self._wait_timeout = wait_timeout

    def _event(self, sid: str) -> asyncio.Event:
        return self._ready.setdefault(sid, asyncio.Event())

    def put_context(self, sid: str, ctx: SessionContext) -> None:
        self._ctx[sid] = ctx
        self._event(sid).set()

    async def wait_context(
        self, sid: str, timeout: float | None = None
    ) -> SessionContext | None:
        t = self._wait_timeout if timeout is None else timeout
        try:
            await asyncio.wait_for(self._event(sid).wait(), t)
        except asyncio.TimeoutError:
            return None
        return self._ctx.get(sid)

    def drop(self, sid: str) -> None:
        self._ctx.pop(sid, None)
        self._ready.pop(sid, None)
