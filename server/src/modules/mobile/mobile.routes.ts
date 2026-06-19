import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import * as mobileController from "./mobile.controller";
import * as aiSessionController from "../ai-sessions/ai-session.controller";

const router = Router();

router.get("/patients", authMiddleware, mobileController.getPatients);
router.get("/reminders", mobileController.getReminders);
router.post("/reminder-events", mobileController.createReminderEvent);
router.get("/help-contact", mobileController.getMobileHelpContact);
router.post("/help-events", mobileController.createMobileHelpEvent);
router.get("/beacons", mobileController.getMobileBeacons);
router.post("/beacon-events", mobileController.createMobileBeaconEvent);
router.post("/vital-events", mobileController.createMobileVitalEvent);
router.post("/stream/start", mobileController.startMobileStreamSession);
router.post("/stream/stop", mobileController.stopMobileStreamSession);
router.post("/stream/status", mobileController.updateMobileStreamStatus);

router.post("/ai-sessions/start", aiSessionController.startMobileSession);
router.get("/ai-sessions/:id", aiSessionController.getMobileSession);
router.post("/ai-sessions/:id/messages", aiSessionController.handleMobileMessage);
router.post("/ai-sessions/:id/resolve", aiSessionController.resolveMobileSession);
router.post("/ai-sessions/:id/emergency-suggestion-ack", aiSessionController.emergencySuggestionAck);

export default router;
