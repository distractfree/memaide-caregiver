import { z } from "zod";
import { createReminderEventSchema } from "../reminder-events/reminder-event.schemas";
import {
  createHelpEventMobileSchema,
  mobileHelpContactQuerySchema,
} from "../help/help.schemas";
import {
  createBeaconEventMobileSchema,
  mobileBeaconsQuerySchema,
} from "../beacons/beacon.schemas";
import { createVitalEventPatientSchema } from "../vitals/vital.schemas";
import {
  startStreamSessionSchema,
  stopStreamSessionSchema,
  updateStreamStatusSchema,
} from "../streams/stream.schemas";
import {
  addAiSessionMessageSchema,
  emergencySuggestionAckSchema,
  resolveAiSessionSchema,
  startAiSessionSchema,
} from "../ai-sessions/ai-session.schemas";

export const mobileRemindersQuerySchema = z.object({
  deviceId: z.string().trim().min(1, "deviceId is required"),
});

export type MobileRemindersQuery = z.infer<typeof mobileRemindersQuerySchema>;

/**
 * Strict E.164-like phone format for patient login.
 *
 * Leading `+`, a country code that cannot start with `0`, digits only, and a
 * bounded total length. Deliberately strict: guessing a country code for a
 * local-format number could resolve to the wrong patient.
 */
export const PATIENT_LOGIN_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

export const patientLoginSchema = z.object({
  phoneNumber: z
    .string({ required_error: "A valid phone number is required." })
    .trim()
    .regex(PATIENT_LOGIN_PHONE_REGEX, "A valid phone number is required."),
});

export type PatientLoginInput = z.infer<typeof patientLoginSchema>;

/*
 * Patient-token request variants.
 *
 * A patient-operated app carries its identity in the JWT and never sends a
 * `deviceId`. Caregiver-operated requests still must send one, and must still
 * fail validation with 400 before any patient lookup happens — so the original
 * schemas are left untouched and only relaxed copies are used for patient
 * actors. `resolveMobilePatient` ignores `deviceId` entirely for patient
 * actors, so a `deviceId` that a patient app still sends is inert.
 */
const DEVICE_ID_OPTIONAL = { deviceId: true } as const;

export const patientRemindersQuerySchema =
  mobileRemindersQuerySchema.partial(DEVICE_ID_OPTIONAL);
export const patientHelpContactQuerySchema =
  mobileHelpContactQuerySchema.partial(DEVICE_ID_OPTIONAL);
export const patientBeaconsQuerySchema =
  mobileBeaconsQuerySchema.partial(DEVICE_ID_OPTIONAL);
export const patientReminderEventSchema =
  createReminderEventSchema.partial(DEVICE_ID_OPTIONAL);
export const patientHelpEventSchema =
  createHelpEventMobileSchema.partial(DEVICE_ID_OPTIONAL);
export const patientBeaconEventSchema =
  createBeaconEventMobileSchema.partial(DEVICE_ID_OPTIONAL);
export const patientStartStreamSchema =
  startStreamSessionSchema.partial(DEVICE_ID_OPTIONAL);
export const patientStopStreamSchema =
  stopStreamSessionSchema.partial(DEVICE_ID_OPTIONAL);
export const patientUpdateStreamStatusSchema =
  updateStreamStatusSchema.partial(DEVICE_ID_OPTIONAL);
export const patientStartAiSessionSchema =
  startAiSessionSchema.partial(DEVICE_ID_OPTIONAL);
export const patientAiSessionMessageSchema =
  addAiSessionMessageSchema.partial(DEVICE_ID_OPTIONAL);
export const patientResolveAiSessionSchema =
  resolveAiSessionSchema.partial(DEVICE_ID_OPTIONAL);
export const patientEmergencyAckSchema =
  emergencySuggestionAckSchema.partial(DEVICE_ID_OPTIONAL);

export { createVitalEventPatientSchema };

/**
 * Service-facing input types. `deviceId` is optional because the same service
 * function now serves both actors; caregiver inputs remain assignable.
 */
export type MobileRemindersInput = z.infer<typeof patientRemindersQuerySchema>;
export type MobileHelpContactInput = z.infer<
  typeof patientHelpContactQuerySchema
>;
export type MobileBeaconsInput = z.infer<typeof patientBeaconsQuerySchema>;
export type MobileReminderEventInput = z.infer<
  typeof patientReminderEventSchema
>;
export type MobileHelpEventInput = z.infer<typeof patientHelpEventSchema>;
export type MobileBeaconEventInput = z.infer<typeof patientBeaconEventSchema>;
export type MobileVitalEventInput = z.infer<
  typeof createVitalEventPatientSchema
>;
export type MobileStartStreamInput = z.infer<typeof patientStartStreamSchema>;
export type MobileStopStreamInput = z.infer<typeof patientStopStreamSchema>;
export type MobileUpdateStreamStatusInput = z.infer<
  typeof patientUpdateStreamStatusSchema
>;
export type MobileStartAiSessionInput = z.infer<
  typeof patientStartAiSessionSchema
>;
