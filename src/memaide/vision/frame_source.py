"""Pluggable source of camera frames as base64 data-URL strings.

Mirrors the ``VisionCheck`` / ``StubVisionCheck`` seam: ``StubFrameSource`` drives
offline tests now; a ``WebSocketFrameSource`` implements this in Plan B.
"""

from typing import AsyncIterator, Protocol, runtime_checkable


@runtime_checkable
class FrameSource(Protocol):
    def frames(self) -> AsyncIterator[str]:
        """Yield base64 data-URL frame strings."""
        ...


class StubFrameSource:
    """Yields a fixed list of frames, for tests and wiring."""

    def __init__(self, frames: list[str]):
        self._frames = list(frames)

    async def frames(self) -> AsyncIterator[str]:
        for frame in self._frames:
            yield frame
