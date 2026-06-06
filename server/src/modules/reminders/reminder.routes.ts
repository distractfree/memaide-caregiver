import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import * as reminderController from "./reminder.controller";

// Patient-scoped routes — mergeParams exposes :patientId from the parent router
export const patientReminderRouter = Router({ mergeParams: true });
patientReminderRouter.use(authMiddleware);
patientReminderRouter.get("/", reminderController.list);
patientReminderRouter.post("/", reminderController.create);

// Routes that operate on a reminder by :id
export const reminderByIdRouter = Router();
reminderByIdRouter.use(authMiddleware);
reminderByIdRouter.put("/:id", reminderController.update);
reminderByIdRouter.delete("/:id", reminderController.remove);
