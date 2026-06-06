import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import * as reminderEventController from "./reminder-event.controller";

// GET /api/patients/:patientId/reminder-events
export const patientReminderEventRouter = Router({ mergeParams: true });
patientReminderEventRouter.use(authMiddleware);
patientReminderEventRouter.get("/", reminderEventController.list);

// GET /api/patients/:patientId/reports/reminders
export const patientReportRouter = Router({ mergeParams: true });
patientReportRouter.use(authMiddleware);
patientReportRouter.get("/reminders", reminderEventController.getReport);
