import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import * as patientController from "./patient.controller";

const router = Router();

router.use(authMiddleware);

router.get("/", patientController.list);
router.post("/", patientController.create);
router.get("/:patientId/overview", patientController.overview);
router.get("/:id", patientController.getOne);
router.put("/:id", patientController.update);
router.delete("/:id", patientController.remove);

export default router;
