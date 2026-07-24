import jwt from "jsonwebtoken";
import { env } from "../../config/env";

/**
 * Mobile actor model.
 *
 * The mobile API serves two different callers:
 *
 *  - the caregiver-operated flow, which authenticates with the caregiver JWT
 *    issued by `/api/auth/login` and identifies a patient with a `deviceId`;
 *  - the patient-operated Android app, which authenticates with a
 *    patient-scoped JWT issued by `POST /api/mobile/patient-login` and carries
 *    its identity in the token itself.
 *
 * The two are deliberately kept distinct so a patient token can never be
 * interpreted as a caregiver token (or vice versa) anywhere downstream.
 */
export type MobileActor =
  | {
      actorType: "caregiver";
      caregiverId: string;
      patientId?: never;
    }
  | {
      actorType: "patient";
      patientId: string;
      caregiverId?: never;
    };

/** Token type claim. Legacy caregiver tokens predate this claim entirely. */
export const CAREGIVER_TOKEN_TYPE = "caregiver";
export const PATIENT_TOKEN_TYPE = "patient";

/** Raised for any token this API refuses to map onto a mobile actor. */
export class MobileTokenError extends Error {
  constructor(message = "Invalid or expired token") {
    super(message);
    this.name = "MobileTokenError";
  }
}

/**
 * Issues a patient-scoped token.
 *
 * `sub` is the patient id — never a caregiver id — and `typ` marks the token so
 * middleware can tell the two actors apart. The token is signed with the same
 * secret and lifetime as caregiver tokens; introducing a separate patient
 * secret was deliberately left out of scope.
 */
export function signPatientToken(patientId: string): string {
  return jwt.sign(
    { sub: patientId, typ: PATIENT_TOKEN_TYPE },
    env.JWT_SECRET,
    // jsonwebtoken accepts values like "7d", but its TypeScript type is stricter.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { expiresIn: env.JWT_EXPIRES_IN as any }
  );
}

/**
 * Verifies a mobile bearer token and maps it onto a typed actor.
 *
 * Backward compatibility: caregiver tokens issued before the `typ` claim
 * existed have no `typ` at all and are still accepted as caregiver tokens.
 * Any other `typ` value is rejected rather than guessed at.
 *
 * The raw token is never logged or included in the thrown error.
 */
export function verifyMobileToken(token: string): MobileActor {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw new MobileTokenError();
  }

  if (typeof decoded !== "object" || decoded === null) {
    throw new MobileTokenError();
  }

  const { sub, typ } = decoded as { sub?: unknown; typ?: unknown };
  if (typeof sub !== "string" || sub.length === 0) {
    throw new MobileTokenError();
  }

  if (typ === PATIENT_TOKEN_TYPE) {
    return { actorType: "patient", patientId: sub };
  }

  if (typ === undefined || typ === CAREGIVER_TOKEN_TYPE) {
    return { actorType: "caregiver", caregiverId: sub };
  }

  throw new MobileTokenError();
}
