import { Router } from "express";
import * as aiSessionController from "./ai-session.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { aiCallbackApiKeyMiddleware } from "../../middleware/ai-callback-auth.middleware";

// Mounted at /api/patients/:patientId/ai-sessions
export const patientAiSessionRouter = Router({ mergeParams: true });
patientAiSessionRouter.use(authMiddleware);
patientAiSessionRouter.get("/", aiSessionController.listCaregiverSessions);

// Mounted at /api/ai-sessions
export const aiSessionByIdRouter = Router();
aiSessionByIdRouter.post(
  "/:sessionId/escalation",
  aiCallbackApiKeyMiddleware,
  aiSessionController.handleEscalationCallback
);
aiSessionByIdRouter.post(
  "/:sessionId/conclude",
  aiCallbackApiKeyMiddleware,
  aiSessionController.handleConcludeCallback
);
aiSessionByIdRouter.use(authMiddleware);
aiSessionByIdRouter.get("/:id", aiSessionController.getCaregiverSession);
aiSessionByIdRouter.post("/:id/caregiver-joined", aiSessionController.caregiverJoinSession);
aiSessionByIdRouter.post("/:id/resolve", aiSessionController.caregiverResolveSession);
