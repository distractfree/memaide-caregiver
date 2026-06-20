import os

from dotenv import load_dotenv

# Load OPENAI_API_KEY (and optional ANTHROPIC_API_KEY) from a .env file if one exists.
# No-op when there is no .env, so this is safe for library/integration use too.
# override=True so .env is authoritative even when a stale OPENAI_API_KEY is already
# set in the OS environment (otherwise load_dotenv won't overwrite it).
load_dotenv(override=True)

# --- Models ---
BRAIN_MODEL = "gpt-5.4-mini"
VISION_MODEL = "gpt-4o-mini"
REALTIME_MODEL = "gpt-4o-mini-realtime-preview"  # Milestone 2
JUDGE_MODEL = "claude-opus-4-8"

# --- Conversation ---
OPENING_LINE = "Hi, I'm here to help. Can you tell me what's wrong?"
EMERGENCY_SUGGESTION = "I'm going to call emergency services (911) for you now."

# --- Escalation (rule-based, LLM-independent) ---
SILENCE_SECONDS = 30.0
DISTRESS_KEYWORDS = [
    "can't breathe",
    "cant breathe",
    "chest pain",
    "chest feels tight",
    "i fell",
    "i've fallen",
    "ive fallen",
    "can't get up",
    "cant get up",
    "bleeding",
    "call 911",
    "emergency",
    "can't move",
    "cant move",
    "heart attack",
    "stroke",
]
CRITICAL_VISION_FLAGS = {"person_on_floor", "fall_detected", "no_motion"}

# Models that reject a custom sampling temperature and only accept the API default (1).
# The GPT-5.0 family is stricter here than gpt-5.4, which does accept e.g. 0.4.
FIXED_TEMPERATURE_MODELS = {"gpt-5-mini"}

# --- Vision (Milestone 2) ---
VISION_INTERVAL_SECONDS = 7.0
VISION_DETAIL = "low"  # passed to image_url.detail; "low" pins gpt-4o-mini at ~2,833 img tokens

# Vision-describer eval sweep (real API calls; see eval/run_vision_eval.py).
VISION_EVAL_MODELS = ["gpt-4o-mini", "gpt-5.4-mini"]
VISION_EVAL_DETAILS = ["low", "high"]

# Per-token list price (USD) for the eval's cost computation. Verified 2026-06:
# gpt-4o-mini $0.15/$0.60 per 1M in/out; gpt-5.4-mini $0.75/$4.50 per 1M in/out.
VISION_PRICING = {
    "gpt-4o-mini": {"in": 0.15 / 1_000_000, "out": 0.60 / 1_000_000},
    "gpt-5.4-mini": {"in": 0.75 / 1_000_000, "out": 4.50 / 1_000_000},
}

# --- Secrets ---
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
