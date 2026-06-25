import base64
import json

from memaide.server.recorder import (
    FileSessionRecorder,
    NullSessionRecorder,
    SessionRecorder,
)


def _data_url(raw: bytes) -> str:
    return "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii")


def test_null_and_file_are_session_recorders():
    assert isinstance(NullSessionRecorder(), SessionRecorder)
    assert isinstance(FileSessionRecorder("s1", "."), SessionRecorder)


async def test_null_recorder_writes_nothing(tmp_path):
    rec = NullSessionRecorder()
    await rec.write(_data_url(b"ABC"))
    await rec.close()
    assert list(tmp_path.iterdir()) == []


async def test_file_recorder_writes_frames_and_manifest(tmp_path):
    rec = FileSessionRecorder("s1", tmp_path, clock=_clock_from([1.0, 2.0]))
    await rec.write(_data_url(b"one"))
    await rec.write(_data_url(b"two"))
    await rec.close()

    session_dir = tmp_path / "s1"
    jpgs = sorted(p.name for p in session_dir.glob("*.jpg"))
    assert jpgs == ["000000-1.000.jpg", "000001-2.000.jpg"]
    assert (session_dir / "000000-1.000.jpg").read_bytes() == b"one"

    manifest = json.loads((session_dir / "manifest.json").read_text())
    assert manifest == [
        {"seq": 0, "ts": 1.0, "file": "000000-1.000.jpg"},
        {"seq": 1, "ts": 2.0, "file": "000001-2.000.jpg"},
    ]


async def test_file_recorder_accepts_raw_base64_without_data_url(tmp_path):
    rec = FileSessionRecorder("s2", tmp_path, clock=_clock_from([5.0]))
    await rec.write(base64.b64encode(b"raw").decode("ascii"))
    await rec.close()
    assert (tmp_path / "s2" / "000000-5.000.jpg").read_bytes() == b"raw"


async def test_file_recorder_skips_bad_base64(tmp_path):
    rec = FileSessionRecorder("s3", tmp_path, clock=_clock_from([1.0, 2.0]))
    await rec.write("data:image/jpeg;base64,!!!not-base64!!!")  # skipped
    await rec.write(_data_url(b"good"))
    await rec.close()

    session_dir = tmp_path / "s3"
    jpgs = sorted(p.name for p in session_dir.glob("*.jpg"))
    assert jpgs == ["000000-2.000.jpg"]  # seq did not advance on the bad frame


async def test_file_recorder_no_manifest_when_no_frames(tmp_path):
    rec = FileSessionRecorder("s4", tmp_path)
    await rec.close()
    assert not (tmp_path / "s4").exists()


async def test_file_recorder_swallows_io_error(tmp_path):
    # A plain file where the session dir should go makes mkdir raise -> must be swallowed.
    (tmp_path / "s5").write_bytes(b"i am a file, not a dir")
    rec = FileSessionRecorder("s5", tmp_path, clock=_clock_from([1.0]))
    await rec.write(_data_url(b"frame"))  # must NOT raise
    await rec.close()                      # must NOT raise
    # The colliding file is untouched and no frame was recorded.
    assert (tmp_path / "s5").read_bytes() == b"i am a file, not a dir"


def _clock_from(values):
    it = iter(values)
    return lambda: next(it)
