import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import * as helpController from "./help.controller";

export const patientHelpRouter = Router({ mergeParams: true });
patientHelpRouter.use(authMiddleware);
patientHelpRouter.get("/help-contact", helpController.getHelpContact);
patientHelpRouter.post("/help-contact", helpController.upsertHelpContact);
patientHelpRouter.get("/help-events", helpController.listHelpEvents);
