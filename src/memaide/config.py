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
REALTIME_MODEL = "gpt-4o-mini-realtime-preview"  # DEPRECATED (M2): superseded by the STT->brain->TTS pipeline; kept, not wired.
JUDGE_MODEL = "claude-opus-4-8"

# --- Caregiver session summary (posted with the conclude callback) ---
SUMMARY_MODEL = BRAIN_MODEL
# The summarize call happens during session teardown, so it gets a short leash: past this the
# summary is dropped rather than holding the conclude POST open.
SUMMARY_TIMEOUT_SECONDS = 5.0
# Hard cap on the stored summary. The prompt asks for two sentences (~300 chars); this is the
# ceiling above which the text is trimmed back to a whole sentence or dropped.
SUMMARY_MAX_CHARS = 400

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
VISION_INTERVAL_SECONDS = 2.0  # brain consumes one described frame every 2s (was 7s)
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

# --- Audio (Milestone 2, Plan B) ---
# STT and TTS are pure converters (no inference); all reasoning stays in the text brain.
STT_MODEL = "gpt-4o-mini-transcribe"  # $0.003/min streaming transcription
TTS_MODEL = "gpt-4o-mini-tts"  # ~$0.015/min batch synthesis
TTS_VOICE = "alloy"
AUDIO_FORMAT = "pcm16"
AUDIO_SAMPLE_RATE = 24000

# --- WebSocket live-media server (Milestone 2, Plan B) ---
WS_HOST = "0.0.0.0"
WS_PORT = 8765

# --- /infer HTTP service (Slice 1: koko backend bridge) ---
# Shared secret koko sends as the X-Api-Key header. When unset, /infer auth is
# DISABLED (local dev); production deploy must set it.
AI_AGENT_API_KEY = os.environ.get("AI_AGENT_API_KEY")
INFER_HOST = "0.0.0.0"
INFER_PORT = 8080

# --- koko callbacks (Slice 2: my server -> koko) ---
# Base URL my server POSTs escalation/conclude to. Unset -> KokoReporter is a no-op (dev).
KOKO_BASE_URL = os.environ.get("KOKO_BASE_URL")
# Shared secret my server sends to koko as X-Api-Key on those callbacks.
KOKO_API_KEY = os.environ.get("KOKO_API_KEY")

# Directory for per-session frame recordings (opt-in via a FileSessionRecorder).
RECORDINGS_DIR = "recordings"

# Min seconds between caregiver notifications for one persistent escalation, so a
# condition seen on every ~2s frame sends at most one WhatsApp per this window.
ESCALATION_NOTIFY_COOLDOWN = 60.0
# Live-preview snapshot dir for the bridge server (latest.jpg + latest.json + index.html).
PREVIEW_DIR = "preview"
PREVIEW_PORT = 8000

# --- WhatsApp notify (Meta WhatsApp Cloud API) ---
# Token is the 24h test token or a permanent System User token; phone_number_id is the
# sending number's ID (stable). WHATSAPP_TO is the verified recipient for testing.
WHATSAPP_TOKEN = os.environ.get("WHATSAPP_TOKEN")
WHATSAPP_PHONE_NUMBER_ID = os.environ.get("WHATSAPP_PHONE_NUMBER_ID")
WHATSAPP_TO = os.environ.get("WHATSAPP_TO")
# Escalation alert template. Defaults to hello_world (always approved, en_US). The custom
# caregiver alert is named `caregiver_alert` and its language is `en` (NOT en_US), so switch
# with WHATSAPP_TEMPLATE=caregiver_alert AND WHATSAPP_LANG=en.
WHATSAPP_TEMPLATE = os.environ.get("WHATSAPP_TEMPLATE", "hello_world")
WHATSAPP_LANG = os.environ.get("WHATSAPP_LANG", "en_US")

# --- Caregiver portal (for the {{4}} link in caregiver-alert WhatsApps) ---
# Base URL of koko's caregiver portal. The {{4}} link defaults to koko's portal root
# (his live portal) rather than a per-session deep link, because koko's session route is
# not yet confirmed and a wrong path 404s. To deep-link a session once koko confirms the
# route, set CAREGIVER_SESSION_PATH (e.g. "/session/{id}").
CAREGIVER_PORTAL_BASE_URL = os.environ.get(
    "CAREGIVER_PORTAL_BASE_URL", "https://caregiver.guardianova.com"
)
CAREGIVER_SESSION_PATH = os.environ.get("CAREGIVER_SESSION_PATH", "")

# --- Secrets ---
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
