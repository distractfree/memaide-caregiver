import { Router, Request, Response } from "express";
import { env } from "../config/env";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    service: "memaide-api",
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

export default router;
