import pytest

from memaide.vision.describer import VisionDescriber
from memaide.vision.rule_check import StubVisionCheck, VisionCheck


def test_stub_vision_check_returns_configured_flags():
    check = StubVisionCheck(flags=["person_on_floor"])
    assert check.check(frame=None) == ["person_on_floor"]


def test_stub_vision_check_defaults_to_empty():
    assert StubVisionCheck().check() == []


def test_stub_is_a_vision_check():
    assert isinstance(StubVisionCheck(), VisionCheck)


async def test_describer_is_not_implemented_in_m1():
    with pytest.raises(NotImplementedError):
        await VisionDescriber().describe(frame=b"")
