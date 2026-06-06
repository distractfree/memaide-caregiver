import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "./error.middleware";

export function authMiddleware(
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
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded === "string" || !decoded.sub) {
      throw new Error("Invalid token payload");
    }
    req.caregiverId = decoded.sub as string;
    next();
  } catch {
    next(new AppError(401, "Invalid or expired token", "INVALID_TOKEN"));
  }
}
