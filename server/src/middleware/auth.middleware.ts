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
    // Patient-scoped mobile tokens carry a patient id in `sub`. They are signed
    // with the same secret, so this route must reject them explicitly rather
    // than let a patient id be read as a caregiver id. Legacy caregiver tokens
    // carry no `typ` claim at all and remain accepted.
    if ((decoded as { typ?: unknown }).typ === "patient") {
      throw new Error("Patient tokens are not valid for caregiver routes");
    }
    req.caregiverId = decoded.sub as string;
    next();
  } catch {
    next(new AppError(401, "Invalid or expired token", "INVALID_TOKEN"));
  }
}
