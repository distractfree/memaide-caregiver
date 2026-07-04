"""Run the MemAide bridge server for the glasses vision trace (Part A).

Starts the WebSocket media server with the REAL vision describer, a console + live-preview
``VisionObserver``, per-session frame recording, and (if WhatsApp is configured) an escalation
alert. Frames-only: the voice loop idles with stub STT/TTS (no audio is sent by the frames-only
phone app). Watch the trace on stdout and open the live preview in a browser:

    python scripts/run_bridge_server.py
    #   WS server : ws://<laptop-LAN-IP>:8765   (point the phone here)
    #   preview   : http://localhost:8000       (frame + [vision]/[escalation] trace)

On each described frame it logs ``[vision] ...``; when the describer reports a critical scene
(person_on_floor / fall_detected / no_motion in its advisory flags) it logs ``[brain]`` +
``[escalation] TRIGGERED`` and fires one WhatsApp alert per cooldown window.

Requires OPENAI_API_KEY (vision). WhatsApp is optional: set WHATSAPP_TOKEN /
WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_TO (+ optional WHATSAPP_TEMPLATE) to enable the alert.
"""

import asyncio
import functools
import logging
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# Make `memaide` importable without an editable install (src/ layout).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from memaide import config
from memaide.agent.brain import AgentBrain
from memaide.audio.tts import StubTextToSpeech
from memaide.io.openai_client import OpenAIClient
from memaide.schemas import EscalationDecision, VisionContext
from memaide.server.frame_preview import FramePreviewWriter, write_index_html
from memaide.server.recorder import FileSessionRecorder
from memaide.server.vision_observer import VisionObserver
from memaide.server.ws import ServerDeps, serve
from memaide.vision.describer import VisionDescriber

_log = logging.getLogger("memaide.bridge")


class _AudioProbeSTT:
    """Drains inbound mic audio and logs receipt, so we can confirm the phone->server audio
    path works without wiring real transcription. Yields no transcripts (async generator)."""

    async def transcribe(self, audio):
        chunks = 0
        total = 0
        async for chunk in audio:
            chunks += 1
            total += len(chunk)
            if chunks == 1 or chunks % 25 == 0:
                _log.info("[audio] received %d chunks, %d bytes from the phone mic", chunks, total)
        _log.info("[audio] stream ended: %d chunks, %d bytes total", chunks, total)
        if False:  # make this an async generator (yields nothing)
            yield


def _promote_critical_advisory(ctx: VisionContext) -> list[str]:
    """Demo bridge: let the LLM describer's critical advisory flags drive escalation.

    Real deployments inject a CV ``VisionCheck`` that populates ``ctx.flags``; until then the
    only per-frame signal is the describer's advisory flags, so map the critical ones across.
    """
    return sorted(set(ctx.advisory_flags) & config.CRITICAL_VISION_FLAGS)


def _build_notify():
    """Return a ``notify(decision, ctx)`` that sends a WhatsApp template, or None if unset."""
    if not (config.WHATSAPP_TOKEN and config.WHATSAPP_PHONE_NUMBER_ID and config.WHATSAPP_TO):
        _log.info("WhatsApp not configured (WHATSAPP_TOKEN/PHONE_NUMBER_ID/TO) - alerts disabled.")
        return None

    from memaide.notify.whatsapp import WhatsAppSender

    sender = WhatsAppSender(config.WHATSAPP_TOKEN, config.WHATSAPP_PHONE_NUMBER_ID)
    template, lang, to = config.WHATSAPP_TEMPLATE, config.WHATSAPP_LANG, config.WHATSAPP_TO

    def notify(decision: EscalationDecision, ctx: VisionContext) -> None:
        # hello_world (the pre-approval fallback) takes no variables. When fall_alert is
        # approved, set WHATSAPP_TEMPLATE=fall_alert and pass {{1}}/{{2}}/{{3}} here.
        _log.warning("[notify] sending WhatsApp template %r to %s (%s)", template, to, decision.reason)
        sender.send_template(to, template, lang)

    return notify


def _start_preview_server(directory: Path, port: int) -> None:
    write_index_html(directory)
    handler = functools.partial(SimpleHTTPRequestHandler, directory=str(directory))
    httpd = ThreadingHTTPServer(("0.0.0.0", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    _log.info("preview: http://localhost:%d  (dir=%s)", port, directory)


async def _main() -> None:
    if not config.OPENAI_API_KEY:
        _log.error("OPENAI_API_KEY is not set (needed for the vision describer). Check your .env.")
        raise SystemExit(1)

    client = OpenAIClient()
    preview_dir = Path(config.PREVIEW_DIR)
    _start_preview_server(preview_dir, config.PREVIEW_PORT)

    observer = VisionObserver(
        notify=_build_notify(),
        preview=FramePreviewWriter(preview_dir),
        flag_source=_promote_critical_advisory,
    )
    deps = ServerDeps(
        describer=VisionDescriber(client),
        stt=_AudioProbeSTT(),              # logs any mic audio the phone sends (transport probe)
        tts=StubTextToSpeech(audio=b""),   # idle
        make_brain=lambda patient: AgentBrain(client, patient),
        make_recorder=lambda sid: FileSessionRecorder(sid, config.RECORDINGS_DIR),
        observer=observer,
    )

    await serve(deps, host=config.WS_HOST, port=config.WS_PORT)
    _log.info("WS server: ws://%s:%d  (point the phone here; use the laptop LAN IP)",
              config.WS_HOST, config.WS_PORT)
    _log.info("Recordings -> %s/<session_id>/  |  Ctrl-C to stop.", config.RECORDINGS_DIR)
    await asyncio.Future()  # run forever


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    try:
        asyncio.run(_main())
    except KeyboardInterrupt:
        pass
