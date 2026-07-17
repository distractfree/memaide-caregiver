import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import * as streamController from "./stream.controller";

export const patientStreamSessionRouter = Router({ mergeParams: true });
patientStreamSessionRouter.use(authMiddleware);
patientStreamSessionRouter.get("/", streamController.list);

export const patientStreamStatusRouter = Router({ mergeParams: true });
patientStreamStatusRouter.use(authMiddleware);
patientStreamStatusRouter.get("/", streamController.getStatus);

export const streamSessionByIdRouter = Router();
streamSessionByIdRouter.use(authMiddleware);
streamSessionByIdRouter.get("/:id/frame/latest", streamController.getLatestFrame);
streamSessionByIdRouter.get("/:id", streamController.getById);
