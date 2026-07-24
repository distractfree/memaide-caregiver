import { Request, Response, NextFunction } from "express";
import { AppError } from "./error.middleware";
import {
  verifyMobileToken,
  type MobileActor,
} from "../modules/mobile/mobile-auth.service";

/**
 * Authenticates `/api/mobile/*` requests for either mobile actor.
 *
 * This is deliberately separate from the caregiver portal's `authMiddleware`
 * so patient tokens are only ever accepted on mobile routes and the caregiver
 * web/API surface keeps its existing behavior.
 *
 * The raw bearer token is never logged.
 */
export function mobileAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    next(new AppError(401, "Missing authorization token", "MISSING_TOKEN"));
    return;
  }

  let actor: MobileActor;
  try {
    actor = verifyMobileToken(header.slice(7));
  } catch {
    next(new AppError(401, "Invalid or expired token", "INVALID_TOKEN"));
    return;
  }

  req.mobileActor = actor;

  // Backward compatibility: every existing mobile code path reads
  // `req.caregiverId`. It stays populated for caregiver actors and stays
  // undefined for patient actors, so caregiver-only handlers cannot silently
  // treat a patient id as a caregiver id.
  if (actor.actorType === "caregiver") {
    req.caregiverId = actor.caregiverId;
  }

  next();
}

/**
 * Restricts a mobile route to caregiver tokens.
 *
 * `GET /api/mobile/patients` returns a caregiver's patient list and must never
 * be reachable with a patient token — the patient app must not be able to see
 * or select any other patient.
 */
export function requireCaregiverActor(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (req.mobileActor?.actorType !== "caregiver") {
    next(
      new AppError(
        403,
        "This endpoint is not available for patient sessions",
        "CAREGIVER_ONLY"
      )
    );
    return;
  }

  next();
}
