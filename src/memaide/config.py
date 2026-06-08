"""Central configuration: model names, thresholds, and env-derived secrets."""

import os

from dotenv import load_dotenv

# Load OPENAI_API_KEY (and optional ANTHROPIC_API_KEY) from a .env file if one exists.
# No-op when there is no .env, so this is safe for library/integration use too.
load_dotenv()

# --- Models ---
BRAIN_MODEL = "gpt-4o-mini"
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

# --- Vision (Milestone 2) ---
VISION_INTERVAL_SECONDS = 7.0

# --- Secrets ---
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
