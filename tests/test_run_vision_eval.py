import base64
import json

from memaide.eval.run_vision_eval import discover_frames, run_eval, to_data_url

# Smallest valid 1x1 PNG (enough to exercise file -> data URL + the mocked describe path).
_PNG_1x1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


class _FakeRawClient:
    """Stands in for OpenAIClient.complete_json_with_raw — no network."""

    def __init__(self):
        self.calls = 0

    async def complete_json_with_raw(self, messages, model="gpt-4o-mini", temperature=None):
        self.calls += 1
        data = {"description": "a kitchen", "label": "kitchen", "flags": ["tv_on"]}

        class _Usage:
            prompt_tokens = 2833
            completion_tokens = 20

        class _Resp:
            usage = _Usage()

        return data, _Resp()


def _make_frames(frames_dir, names):
    frames_dir.mkdir(parents=True, exist_ok=True)
    for name in names:
        (frames_dir / name).write_bytes(_PNG_1x1)


def test_discover_frames_globs_images_and_ignores_others(tmp_path):
    fd = tmp_path / "frames"
    _make_frames(fd, ["b.png", "a.jpg"])
    (fd / "notes.txt").write_text("ignore me", encoding="utf-8")
    found = [p.name for p in discover_frames(fd)]
    assert found == ["a.jpg", "b.png"]  # sorted, images only


def test_to_data_url_encodes_mime_and_base64(tmp_path):
    fd = tmp_path / "frames"
    _make_frames(fd, ["a.png"])
    url = to_data_url(fd / "a.png")
    assert url.startswith("data:image/png;base64,")


async def test_run_eval_sweeps_matrix_and_writes_outputs(tmp_path, monkeypatch):
    from memaide import config

    # Shrink the matrix to keep the test small and deterministic.
    monkeypatch.setattr(config, "VISION_EVAL_MODELS", ["gpt-4o-mini", "gpt-5.4-mini"])
    monkeypatch.setattr(config, "VISION_EVAL_DETAILS", ["low"])

    frames_dir = tmp_path / "frames"
    _make_frames(frames_dir, ["0001.png", "0002.png"])
    run_dir = tmp_path / "run"
    run_dir.mkdir()

    manifest = await run_eval(_FakeRawClient(), run_dir, frames_dir=frames_dir)

    # Per-combo outputs exist and frames were copied in.
    for model in ["gpt-4o-mini", "gpt-5.4-mini"]:
        combo = run_dir / model / "low"
        assert (combo / "results.json").exists()
        assert (combo / "results.md").exists()
        assert (combo / "frames" / "0001_0001.png").exists()
        rows = json.loads((combo / "results.json").read_text(encoding="utf-8"))
        assert len(rows) == 2
        # cost = 2833*in + 20*out for this model
        price = config.VISION_PRICING[model]
        expected = round(2833 * price["in"] + 20 * price["out"], 6)
        assert rows[0]["cost_usd"] == expected
        assert rows[0]["advisory_flags"] == ["tv_on"]

    # Top-level artifacts.
    assert (run_dir / "comparison.md").exists()
    assert manifest["num_frames"] == 2
    assert len(manifest["combos"]) == 2  # 2 models x 1 detail
