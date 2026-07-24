import { Router } from "express";
import {
  mobileAuthMiddleware,
  requireCaregiverActor,
} from "../../middleware/mobile-auth.middleware";
import * as mobileController from "./mobile.controller";
import * as aiSessionController from "../ai-sessions/ai-session.controller";

const router = Router();

// Unauthenticated: this is how a patient-operated app obtains its token.
// Must stay declared before the authenticated mobile middleware below.
router.post("/patient-login", mobileController.patientLogin);

// Everything below accepts either a caregiver token or a patient token.
router.use(mobileAuthMiddleware);

// Caregiver-only: returns a caregiver's patient list. A patient token must
// never be able to see or select another patient.
router.get("/patients", requireCaregiverActor, mobileController.getPatients);

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
