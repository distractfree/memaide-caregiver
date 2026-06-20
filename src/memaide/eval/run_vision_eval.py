"""Vision-describer eval: sweep (model x detail) over fixture frames, export results.

Export-only and mirrors run_eval.py. ``main()`` makes REAL OpenAI calls (needs
OPENAI_API_KEY and access to every model in VISION_EVAL_MODELS) and writes a timestamped
run dir under docs/vision-eval-runs/. Drop frames into
src/memaide/eval/vision_frames/ (any .jpg/.jpeg/.png); the harness globs them.

Run: python -m memaide.eval.run_vision_eval
"""

import asyncio
import base64
import json
import shutil
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from memaide import config
from memaide.io.openai_client import OpenAIClient
from memaide.vision.describer import VisionDescriber

VISION_FRAMES_DIR = Path(__file__).parent / "vision_frames"
VISION_EVAL_RUNS_DIR = Path("docs/vision-eval-runs")
_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}
_MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}


class FrameRecord(BaseModel):
    filename: str
    description: str
    label: str
    advisory_flags: list[str]
    latency_s: float
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float


class _UsageRecordingClient:
    """Wraps a client so the describer's complete_json call also exposes token usage."""

    def __init__(self, client: Any):
        self._client = client
        self.last_usage: Any = None

    async def complete_json(self, messages, model=config.VISION_MODEL, temperature=None):
        data, resp = await self._client.complete_json_with_raw(
            messages, model=model, temperature=temperature
        )
        self.last_usage = getattr(resp, "usage", None)
        return data


def discover_frames(frames_dir: Path = VISION_FRAMES_DIR) -> list[Path]:
    if not frames_dir.exists():
        return []
    return sorted(
        p for p in frames_dir.iterdir()
        if p.is_file() and p.suffix.lower() in _IMAGE_SUFFIXES
    )


def to_data_url(path: Path) -> str:
    mime = _MIME[path.suffix.lower()]
    b64 = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{b64}"


def _cost_usd(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    pricing = config.VISION_PRICING.get(model, {"in": 0.0, "out": 0.0})
    return prompt_tokens * pricing["in"] + completion_tokens * pricing["out"]


async def run_combo(
    model: str, detail: str, frames: list[Path], client: Any, run_dir: Path
) -> list[FrameRecord]:
    recorder = _UsageRecordingClient(client)
    describer = VisionDescriber(client=recorder, model=model, detail=detail)
    combo_dir = run_dir / model / detail
    frames_out = combo_dir / "frames"
    frames_out.mkdir(parents=True, exist_ok=True)

    records: list[FrameRecord] = []
    for i, path in enumerate(frames, start=1):
        saved_name = f"{i:04d}_{path.name}"
        shutil.copyfile(path, frames_out / saved_name)
        start = time.monotonic()
        ctx = await describer.describe(to_data_url(path))
        latency = time.monotonic() - start
        usage = recorder.last_usage
        prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
        completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
        records.append(
            FrameRecord(
                filename=saved_name,
                description=ctx.description,
                label=ctx.label,
                advisory_flags=ctx.advisory_flags,
                latency_s=round(latency, 3),
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                cost_usd=round(_cost_usd(model, prompt_tokens, completion_tokens), 6),
            )
        )
    _write_combo(combo_dir, model, detail, records)
    return records


def _write_combo(
    combo_dir: Path, model: str, detail: str, records: list[FrameRecord]
) -> None:
    (combo_dir / "results.json").write_text(
        json.dumps([r.model_dump() for r in records], indent=2), encoding="utf-8"
    )
    lines = [f"# {model} @ detail={detail}", ""]
    for r in records:
        adv = ", ".join(r.advisory_flags) or "none"
        lines += [
            f"## {r.filename}",
            "",
            f"![{r.filename}](frames/{r.filename})",
            "",
            f"- **label:** {r.label}",
            f"- **description:** {r.description}",
            f"- **advisory_flags:** {adv}",
            f"- **latency:** {r.latency_s}s | **tokens:** {r.prompt_tokens} in / "
            f"{r.completion_tokens} out | **cost:** ${r.cost_usd}",
            "",
        ]
    (combo_dir / "results.md").write_text("\n".join(lines), encoding="utf-8")


def _write_comparison(
    run_dir: Path,
    frames: list[Path],
    combos: list[tuple[str, str]],
    by_combo: dict[tuple[str, str], list[FrameRecord]],
) -> None:
    ref_model, ref_detail = combos[0]
    lines = ["# Vision describer comparison (by image)", ""]
    for i, path in enumerate(frames, start=1):
        saved_name = f"{i:04d}_{path.name}"
        lines += [
            f"## {saved_name}",
            "",
            f"![{saved_name}]({ref_model}/{ref_detail}/frames/{saved_name})",
            "",
            "| model | detail | label | description | advisory_flags | cost |",
            "|---|---|---|---|---|---|",
        ]
        for (model, detail) in combos:
            r = by_combo[(model, detail)][i - 1]
            adv = ", ".join(r.advisory_flags) or "none"
            desc = r.description.replace("|", "\\|")
            lines.append(
                f"| {model} | {detail} | {r.label} | {desc} | {adv} | ${r.cost_usd} |"
            )
        lines.append("")
    (run_dir / "comparison.md").write_text("\n".join(lines), encoding="utf-8")


async def run_eval(
    client: Any, run_dir: Path, frames_dir: Path = VISION_FRAMES_DIR
) -> dict:
    frames = discover_frames(frames_dir)
    combos = [
        (m, d) for m in config.VISION_EVAL_MODELS for d in config.VISION_EVAL_DETAILS
    ]
    by_combo: dict[tuple[str, str], list[FrameRecord]] = {}
    aggregates = []
    for (model, detail) in combos:
        records = await run_combo(model, detail, frames, client, run_dir)
        by_combo[(model, detail)] = records
        total_cost = round(sum(r.cost_usd for r in records), 6)
        mean_latency = (
            round(sum(r.latency_s for r in records) / len(records), 3) if records else 0.0
        )
        aggregates.append(
            {
                "model": model,
                "detail": detail,
                "total_cost_usd": total_cost,
                "mean_latency_s": mean_latency,
            }
        )
    if frames:
        _write_comparison(run_dir, frames, combos, by_combo)
    manifest = {
        "models": config.VISION_EVAL_MODELS,
        "details": config.VISION_EVAL_DETAILS,
        "num_frames": len(frames),
        "combos": aggregates,
    }
    (run_dir / "run.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


async def main() -> None:
    frames = discover_frames()
    if not frames:
        print(
            f"No frames found in {VISION_FRAMES_DIR}. "
            "Drop .jpg/.jpeg/.png scenes there first."
        )
        return
    client = OpenAIClient()
    run_id = datetime.now().strftime("run-%Y%m%d-%H%M%S")
    run_dir = VISION_EVAL_RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    print(f"Vision eval run: {run_id}\nFrames: {len(frames)}  ->  {run_dir}")

    manifest = await run_eval(client, run_dir)
    for combo in manifest["combos"]:
        print(
            f"  {combo['model']:<14} {combo['detail']:<5} "
            f"cost=${combo['total_cost_usd']:<10} mean_latency={combo['mean_latency_s']}s"
        )
    print(f"\nComparison: {run_dir / 'comparison.md'}")


if __name__ == "__main__":
    asyncio.run(main())
