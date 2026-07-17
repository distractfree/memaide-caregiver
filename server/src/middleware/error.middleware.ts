import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { env } from "../config/env";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status?: unknown }).status === 413
  ) {
    res.status(413).json({
      status: "error",
      message: "Request body too large",
      code: "PAYLOAD_TOO_LARGE",
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      status: "error",
      message: "Validation failed",
      code: "VALIDATION_ERROR",
      details: err.flatten().fieldErrors,
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: "error",
      message: err.message,
      code: err.code ?? "APP_ERROR",
    });
    return;
  }

  const isDev = env.NODE_ENV === "development";
  const message =
    err instanceof Error ? err.message : "An unexpected error occurred";

  res.status(500).json({
    status: "error",
    message: isDev ? message : "Internal server error",
    ...(isDev && err instanceof Error ? { stack: err.stack } : {}),
  });
}
