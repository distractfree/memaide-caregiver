from memaide.vision.frame_source import FrameSource, StubFrameSource


async def test_stub_frame_source_yields_all_frames():
    src = StubFrameSource(["a", "b", "c"])
    out = [f async for f in src.frames()]
    assert out == ["a", "b", "c"]


def test_stub_is_a_frame_source():
    assert isinstance(StubFrameSource([]), FrameSource)
