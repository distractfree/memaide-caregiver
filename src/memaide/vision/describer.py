"""Milestone 2: turn a captured frame into a short scene description + label.

Placeholder so the package layout and interface are fixed; implemented in M2 with
the gpt-4o-mini vision model.
"""

from typing import Any

from memaide.schemas import VisionContext


class VisionDescriber:
    async def describe(self, frame: Any) -> VisionContext:
        raise NotImplementedError("VisionDescriber is implemented in Milestone 2.")
