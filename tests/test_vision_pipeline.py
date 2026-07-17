import asyncio

from memaide.schemas import VisionContext
from memaide.server.ws import WebSocketFrameSource
from memaide.vision.frame_source import FrameSource, StubFrameSource
from memaide.vision.pipeline import VisionPipeline


async def test_stub_frame_source_yields_all_frames():
    src = StubFrameSource(["a", "b", "c"])
    out = [f async for f in src.frames()]
    assert out == ["a", "b", "c"]


def test_stub_is_a_frame_source():
    assert isinstance(StubFrameSource([]), FrameSource)


class _FakeDescriber:
    def __init__(self):
        self.calls = []

    async def describe(self, frame):
        self.calls.append(frame)
        return VisionContext(description="d", label="l")


class _RaisingDescriber:
    def __init__(self):
        self.calls = 0

    async def describe(self, frame):
        self.calls += 1
        raise RuntimeError("boom")


def _clock_from(values):
    it = iter(values)
    return lambda: next(it)


async def test_pipeline_throttles_to_one_describe_per_interval():
    describer = _FakeDescriber()
    received = []

    async def sink(ctx):
        received.append(ctx)

    # interval=7: f0 at t=0 describes; f1@1, f2@2 are skipped; f3@10 describes.
    pipeline = VisionPipeline(
        source=StubFrameSource(["f0", "f1", "f2", "f3"]),
        describer=describer,
        sink=sink,
        interval=7.0,
        clock=_clock_from([0.0, 1.0, 2.0, 10.0]),
    )
    await pipeline.run()

    assert describer.calls == ["f0", "f3"]
    assert len(received) == 2


async def test_pipeline_skips_a_failing_describe_without_aborting():
    describer = _RaisingDescriber()
    received = []

    async def sink(ctx):
        received.append(ctx)

    pipeline = VisionPipeline(
        source=StubFrameSource(["only"]),
        describer=describer,
        sink=sink,
        interval=0.0,
        clock=_clock_from([0.0]),
    )
    await pipeline.run()  # must not raise

    assert describer.calls == 1
    assert received == []  # sink never called for the failed frame


async def test_pipeline_describes_newest_frame_and_drops_backlog():
    # A WebSocketFrameSource buffers, so a slow describe lets frames pile up. The pipeline
    # should skip that backlog and describe only the newest frame (real-time tracking).
    src = WebSocketFrameSource()
    release = asyncio.Event()
    calls = []

    class BlockingDescriber:
        async def describe(self, frame):
            calls.append(frame)
            if len(calls) == 1:
                await release.wait()  # hold the first describe while a backlog builds
            return VisionContext(description="d", label=frame)

    received = []

    async def sink(ctx):
        received.append(ctx.label)

    pipeline = VisionPipeline(source=src, describer=BlockingDescriber(), sink=sink, interval=0.0)
    task = asyncio.create_task(pipeline.run())

    await src.put("f0")
    await asyncio.sleep(0.02)  # loop pulls f0 and blocks inside describe
    await src.put("f1")
    await src.put("f2")
    await src.put("f3")
    await asyncio.sleep(0.02)  # f1..f3 now buffered behind the blocked describe
    release.set()
    await asyncio.sleep(0.02)  # loop finishes f0, then drains to the newest (f3)
    await src.close()
    await task

    assert calls == ["f0", "f3"]  # f1, f2 dropped
    assert received == ["f0", "f3"]
