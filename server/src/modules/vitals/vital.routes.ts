import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import * as vitalController from "./vital.controller";

export const patientVitalsRouter = Router({ mergeParams: true });
patientVitalsRouter.use(authMiddleware);
patientVitalsRouter.get("/", vitalController.list);

export const patientVitalsReportRouter = Router({ mergeParams: true });
patientVitalsReportRouter.use(authMiddleware);
patientVitalsReportRouter.get("/", vitalController.getReport);
