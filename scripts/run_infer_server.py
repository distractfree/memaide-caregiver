"""Run the MemAide /infer HTTP service (Slice 1: koko backend bridge).

Serves POST /infer (and GET /health) with the real AgentBrain. koko calls this per
patient message instead of its scripted placeholder. Stateless: one brain turn per call.

    python scripts/run_infer_server.py
    #   service : http://0.0.0.0:8080   (koko points AI_AGENT_URL here)

Requires OPENAI_API_KEY (the brain). Set AI_AGENT_API_KEY to require the X-Api-Key header;
if it is unset, auth is DISABLED (local dev only).
"""

import logging
import sys
from pathlib import Path

# Make `memaide` importable without an editable install (src/ layout).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from memaide import config
from memaide.agent.brain import AgentBrain
from memaide.io.openai_client import OpenAIClient
from memaide.service.app import ServiceDeps, create_app

_log = logging.getLogger("memaide.infer")


def build_app():
    if not config.OPENAI_API_KEY:
        _log.error("OPENAI_API_KEY is not set (needed for the brain). Check your .env.")
        raise SystemExit(1)
    client = OpenAIClient()
    deps = ServiceDeps(make_brain=lambda patient: AgentBrain(client, patient))
    return create_app(deps)


def main() -> None:
    import uvicorn

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    if not config.AI_AGENT_API_KEY:
        _log.warning("AI_AGENT_API_KEY not set; /infer auth is DISABLED (dev mode).")
    app = build_app()
    _log.info("infer service: http://%s:%d  (POST /infer, GET /health)",
              config.INFER_HOST, config.INFER_PORT)
    uvicorn.run(app, host=config.INFER_HOST, port=config.INFER_PORT)


if __name__ == "__main__":
    main()
