import logging
from dataclasses import dataclass
from typing import Any, Callable

from fastapi import Depends, FastAPI, HTTPException

from memaide.safety.escalation import EscalationMonitor
from memaide.schemas import PatientContext
from memaide.service.auth import require_api_key
from memaide.service.infer import run_infer
from memaide.service.schemas import InferRequest, InferResponse

_log = logging.getLogger(__name__)


@dataclass
class ServiceDeps:
    """Injectable seams so the app is built from testable parts."""

    make_brain: Callable[[PatientContext], Any]
    monitor: EscalationMonitor | None = None


def create_app(deps: ServiceDeps) -> FastAPI:
    app = FastAPI(title="MemAide /infer service")
    monitor = deps.monitor or EscalationMonitor()

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok"}

    @app.post("/infer", response_model=InferResponse)
    async def infer(
        req: InferRequest, _: None = Depends(require_api_key)
    ) -> InferResponse:
        try:
            return await run_infer(req, deps.make_brain, monitor)
        except HTTPException:
            raise
        except Exception:  # noqa: BLE001 - any brain/upstream failure -> 502 for koko fallback
            _log.exception("infer failed")
            raise HTTPException(status_code=502, detail="inference failed")

    return app
