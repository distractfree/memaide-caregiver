"""Transport-agnostic vision pipeline: throttle frames, describe, push to a sink.

Reusable and fully mockable: a ``FrameSource`` feeds frames, a ``VisionDescriber``
turns each into a ``VisionContext`` at most once per ``interval``, and the result is
awaited on an injected ``sink`` (e.g. "store as latest scene + echo to client").
"""

import logging
import time
from typing import Any, Awaitable, Callable

from memaide import config
from memaide.schemas import VisionContext

_log = logging.getLogger(__name__)


class VisionPipeline:
    def __init__(
        self,
        source: Any,
        describer: Any,
        sink: Callable[[VisionContext], Awaitable[None]],
        interval: float = config.VISION_INTERVAL_SECONDS,
        clock: Callable[[], float] | None = None,
    ):
        self._source = source
        self._describer = describer
        self._sink = sink
        self._interval = interval
        self._clock = clock or time.monotonic
        self._last_at: float | None = None

    async def run(self) -> None:
        # Buffering sources (e.g. the WebSocket queue) can expose drain_latest() to skip to
        # the newest frame; stub/stream sources without it are consumed frame by frame.
        drain_latest = getattr(self._source, "drain_latest", None)
        async for frame in self._source.frames():
            # A slow describe() lets frames pile up in the source. Skip to the newest buffered
            # frame so the described scene tracks real time instead of replaying a stale backlog.
            if drain_latest is not None:
                newest = drain_latest()
                if newest is not None:
                    frame = newest
            now = self._clock()
            if self._last_at is not None and (now - self._last_at) < self._interval:
                continue
            self._last_at = now
            try:
                ctx = await self._describer.describe(frame)
            except Exception as exc:  # noqa: BLE001 - one bad frame must not kill the stream
                _log.warning("vision describe failed; skipping frame: %s", exc)
                continue
            await self._sink(ctx)
