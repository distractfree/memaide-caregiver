import { NextFunction, Request, Response, Router } from "express";
import * as aiSessionController from "./ai-session.controller";
import { authMiddleware } from "../../middleware/auth.middleware";

function aiCallbackApiKeyMiddleware(req: Request, res: Response, next: NextFunction) {
  const expectedApiKey = process.env.AI_CALLBACK_API_KEY;
  const providedApiKey = req.get("X-Api-Key");

  if (!expectedApiKey || providedApiKey !== expectedApiKey) {
    res.status(401).json({
      status: "error",
      message: "Invalid AI callback API key",
      code: "INVALID_AI_CALLBACK_API_KEY",
    });
    return;
  }

  next();
}

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
