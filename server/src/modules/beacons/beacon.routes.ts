import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import * as beaconController from "./beacon.controller";

export const patientBeaconRouter = Router({ mergeParams: true });
patientBeaconRouter.use(authMiddleware);
patientBeaconRouter.get("/", beaconController.list);
patientBeaconRouter.post("/", beaconController.create);

export const beaconByIdRouter = Router();
beaconByIdRouter.use(authMiddleware);
beaconByIdRouter.put("/:id", beaconController.update);
beaconByIdRouter.delete("/:id", beaconController.remove);

export const patientBeaconEventRouter = Router({ mergeParams: true });
patientBeaconEventRouter.use(authMiddleware);
patientBeaconEventRouter.get("/", beaconController.listEvents);

export const patientBeaconReportRouter = Router({ mergeParams: true });
patientBeaconReportRouter.use(authMiddleware);
patientBeaconReportRouter.get("/", beaconController.getReport);
