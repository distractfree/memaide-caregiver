"""Run the MemAide live session server (Slice 2): /session/start + the media WebSocket
in ONE process sharing one SessionRegistry.

    python scripts/run_session_server.py
    #   HTTP  : http://0.0.0.0:8080   (POST /infer, POST /session/start, GET /health)
    #   media : ws://0.0.0.0:8765     (device points its WebSocket here)

koko POSTs /session/start with the patient context; the device opens the WebSocket with
hello {session_id}; my server correlates the two and runs the live voice/vision loop,
POSTing escalation (real-time) and the transcript (on conclude) back to koko.

Requires OPENAI_API_KEY (brain + vision + STT/TTS). Set AI_AGENT_API_KEY to require the
inbound X-Api-Key header. Set KOKO_BASE_URL (+ KOKO_API_KEY) to enable callbacks to koko;
unset -> callbacks are logged no-ops (standalone dev).
"""

import asyncio
import logging
import sys
from pathlib import Path

# Make `memaide` importable without an editable install (src/ layout).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from memaide import config
from memaide.agent.brain import AgentBrain
from memaide.agent.summarizer import SessionSummarizer
from memaide.audio.stt import SpeechToText
from memaide.audio.tts import TextToSpeech
from memaide.io.openai_client import OpenAIClient
from memaide.server.ws import ServerDeps, handle
from memaide.service.app import ServiceDeps, create_app
from memaide.service.koko_reporter import KokoReporter
from memaide.service.session_registry import SessionRegistry
from memaide.vision.describer import VisionDescriber

_log = logging.getLogger("memaide.session")


def _build_notifier(client):
    """Build the WhatsApp caregiver notifier, or None when no token is configured."""
    if not config.WHATSAPP_TOKEN or not config.WHATSAPP_PHONE_NUMBER_ID:
        return None
    from memaide.notify.alert_summary import SituationSummarizer
    from memaide.notify.escalation_alert import EscalationNotifier
    from memaide.notify.whatsapp import WhatsAppSender

    sender = WhatsAppSender(config.WHATSAPP_TOKEN, config.WHATSAPP_PHONE_NUMBER_ID)
    return EscalationNotifier(
        sender,
        template=config.WHATSAPP_TEMPLATE,
        lang=config.WHATSAPP_LANG,
        portal_base_url=config.CAREGIVER_PORTAL_BASE_URL,
        session_path=config.CAREGIVER_SESSION_PATH,
        fallback_to=config.WHATSAPP_TO,
        situation_summarizer=SituationSummarizer(client),
    )


def build_components(client):
    """Build the FastAPI app and the WebSocket ServerDeps sharing ONE SessionRegistry.

    Split out from main() so it is unit-testable without opening sockets. `client` is an
    OpenAI-SDK-shaped object; the constructors below only store it (no network at build).
    """
    registry = SessionRegistry()
    reporter = KokoReporter(config.KOKO_BASE_URL, config.KOKO_API_KEY)
    notifier = _build_notifier(client)
    app = create_app(
        ServiceDeps(make_brain=lambda p: AgentBrain(client, p), registry=registry)
    )
    ws_deps = ServerDeps(
        describer=VisionDescriber(client),
        stt=SpeechToText(client),
        tts=TextToSpeech(client),
        make_brain=lambda p: AgentBrain(client, p),
        registry=registry,
        reporter=reporter,
        notifier=notifier,
        summarizer=SessionSummarizer(client),
    )
    return app, ws_deps, registry


async def _serve() -> None:
    import uvicorn
    import websockets

    if not config.OPENAI_API_KEY:
        _log.error("OPENAI_API_KEY is not set (needed for brain/vision/STT/TTS).")
        raise SystemExit(1)
    if not config.AI_AGENT_API_KEY:
        _log.warning("AI_AGENT_API_KEY not set; inbound auth is DISABLED (dev mode).")
    if not config.KOKO_BASE_URL:
        _log.warning("KOKO_BASE_URL not set; koko callbacks are logged no-ops (dev mode).")

    client = OpenAIClient()
    app, ws_deps, _ = build_components(client)

    uv = uvicorn.Server(
        uvicorn.Config(app, host=config.INFER_HOST, port=config.INFER_PORT, log_level="info")
    )
    uv.install_signal_handlers = lambda: None  # main() owns shutdown of both listeners

    ws = await websockets.serve(
        lambda s: handle(s, ws_deps), config.WS_HOST, config.WS_PORT
    )
    _log.info("HTTP  : http://%s:%d  (/infer, /session/start, /health)",
              config.INFER_HOST, config.INFER_PORT)
    _log.info("media : ws://%s:%d  (device WebSocket)", config.WS_HOST, config.WS_PORT)
    await asyncio.gather(uv.serve(), ws.wait_closed())


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    try:
        asyncio.run(_serve())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
