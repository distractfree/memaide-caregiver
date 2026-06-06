import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "./error.middleware";

export function adminAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    next(new AppError(401, "Missing authorization token", "MISSING_TOKEN"));
    return;
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, env.ADMIN_JWT_SECRET);
    if (
      typeof decoded === "string" ||
      !decoded.type ||
      decoded.type !== "admin" ||
      !decoded.role ||
      decoded.role !== "admin"
    ) {
      throw new Error("Invalid token payload");
    }
    next();
  } catch {
    next(new AppError(401, "Invalid or expired admin token", "INVALID_TOKEN"));
  }
}
