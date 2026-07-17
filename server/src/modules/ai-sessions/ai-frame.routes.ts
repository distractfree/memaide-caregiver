import express, { Router } from "express";
import { env } from "../../config/env";
import { aiCallbackApiKeyMiddleware } from "../../middleware/ai-callback-auth.middleware";
import * as aiSessionController from "./ai-session.controller";

/**
 * This router is mounted before the application's 10 KB JSON parser. No other
 * AI callback receives this larger parser. Authenticate from the header first
 * so an invalid caller cannot make the JSON parser allocate the frame body.
 */
export const aiFrameCallbackRouter = Router();
aiFrameCallbackRouter.post(
  "/:sessionId/frames",
  aiCallbackApiKeyMiddleware,
  express.json({ limit: env.AI_FRAME_JSON_LIMIT ?? "1mb" }),
  aiSessionController.handleFrameCallback
);
