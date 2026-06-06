import { Router } from "express";
import * as adminController from "./admin.controller";
import { adminAuthMiddleware } from "../../middleware/adminAuth.middleware";

const router = Router();

router.post("/login", adminController.login);
router.get("/me", adminAuthMiddleware, adminController.me);
router.get("/caregivers", adminAuthMiddleware, adminController.getCaregivers);
router.get("/caregivers/:id", adminAuthMiddleware, adminController.getCaregiverById);
router.get("/ai-sessions", adminAuthMiddleware, adminController.getAiSessions);
router.get("/ai-sessions/:id", adminAuthMiddleware, adminController.getAiSessionById);

export default router;
