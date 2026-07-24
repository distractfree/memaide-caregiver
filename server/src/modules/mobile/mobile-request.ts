import type { Request } from "express";
import type { z } from "zod";
import { AppError } from "../../middleware/error.middleware";
import type { MobileActor } from "./mobile-auth.service";

/**
 * Reads the actor established by `mobileAuthMiddleware`.
 *
 * Every authenticated mobile route runs behind that middleware, so a missing
 * actor means the route was mounted without it. Failing closed with a 401 is
 * the only safe response.
 */
export function mobileActorFor(req: Request): MobileActor {
  const actor = req.mobileActor;
  if (!actor) {
    throw new AppError(401, "Missing authorization token", "MISSING_TOKEN");
  }
  return actor;
}

/**
 * Picks the request schema matching the authenticated actor.
 *
 * Caregiver requests keep the original strict schema, so a caregiver call that
 * omits `deviceId` still fails validation with 400 before any patient lookup.
 * Patient requests use a variant where `deviceId` is optional, because a
 * patient-operated app carries its identity in its token instead.
 */
export function schemaForActor<
  C extends z.ZodTypeAny,
  P extends z.ZodTypeAny
>(actor: MobileActor, caregiverSchema: C, patientSchema: P): C | P {
  return actor.actorType === "patient" ? patientSchema : caregiverSchema;
}
