import { timingSafeEqual } from "crypto";
import { NextFunction, Request, Response } from "express";

/**
 * Authentication shared by server-to-server callbacks from the AI service.
 * It deliberately reads the environment at request time so deployment secret
 * rotation does not require a module reload.
 */
export function aiCallbackApiKeyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const expectedApiKey = process.env.AI_CALLBACK_API_KEY;
  const providedApiKey = req.get("X-Api-Key");

  const isValid = Boolean(
    expectedApiKey &&
      providedApiKey &&
      Buffer.byteLength(expectedApiKey) === Buffer.byteLength(providedApiKey) &&
      timingSafeEqual(Buffer.from(expectedApiKey), Buffer.from(providedApiKey))
  );

  if (!isValid) {
    res.status(401).json({
      status: "error",
      message: "Invalid AI callback API key",
      code: "INVALID_AI_CALLBACK_API_KEY",
    });
    return;
  }

  next();
}
