"""Tests for the FramePreviewWriter (latest.jpg + latest.json live snapshot)."""

import base64
import json

from memaide.schemas import EscalationDecision, VisionContext
from memaide.server.frame_preview import FramePreviewWriter, write_index_html


def test_write_index_html_creates_page(tmp_path):
    path = write_index_html(tmp_path / "preview")
    assert path.name == "index.html"
    html = path.read_text(encoding="utf-8")
    assert "latest.json" in html and "latest.jpg" in html


def _ctx(**kw):
    base = dict(description="a person on the floor", label="person on floor",
                flags=["person_on_floor"], advisory_flags=["person_on_floor", "no_motion"])
    base.update(kw)
    return VisionContext(**base)


def _data_url(payload: bytes = b"ABC") -> str:
    return "data:image/jpeg;base64," + base64.b64encode(payload).decode("ascii")


async def test_write_persists_jpg_and_json(tmp_path):
    w = FramePreviewWriter(tmp_path)
    decision = EscalationDecision(escalate=True, reason="vision:person_on_floor",
                                  triggered_by=["vision:person_on_floor"])
    await w.write(ctx=_ctx(), frame_url=_data_url(b"JPEGBYTES"),
                  flags=["person_on_floor"], decision=decision)

    assert (tmp_path / "latest.jpg").read_bytes() == b"JPEGBYTES"
    meta = json.loads((tmp_path / "latest.json").read_text())
    assert meta["label"] == "person on floor"
    assert meta["flags"] == ["person_on_floor"]
    assert meta["escalate"] is True
    assert meta["triggered_by"] == ["vision:person_on_floor"]


async def test_write_without_frame_still_writes_json(tmp_path):
    w = FramePreviewWriter(tmp_path)
    await w.write(ctx=_ctx(flags=[]), frame_url=None, flags=[], decision=None)

    assert not (tmp_path / "latest.jpg").exists()
    meta = json.loads((tmp_path / "latest.json").read_text())
    assert meta["escalate"] is False


async def test_write_swallows_bad_frame_payload(tmp_path):
    w = FramePreviewWriter(tmp_path)
    # Not valid base64 after the comma -> jpg skipped, json still written, no raise.
    await w.write(ctx=_ctx(flags=[]), frame_url="data:image/jpeg;base64,%%%not-b64%%%",
                  flags=[], decision=None)

    assert not (tmp_path / "latest.jpg").exists()
    assert (tmp_path / "latest.json").exists()
