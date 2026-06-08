"""Pluggable, LLM-independent vision check.

Teammates' real CV / glasses pipeline implements ``VisionCheck``; ``StubVisionCheck``
lets the rest of the system be built and tested now.
"""

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class VisionCheck(Protocol):
    def check(self, frame: Any = None) -> list[str]:
        """Return a list of flag strings (e.g. ['person_on_floor']) for the frame."""
        ...


class StubVisionCheck:
    """Returns a fixed set of flags; useful for tests and wiring."""

    def __init__(self, flags: list[str] | None = None):
        self._flags = list(flags) if flags else []

    def check(self, frame: Any = None) -> list[str]:
        return list(self._flags)
