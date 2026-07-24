import { z } from "zod";

export const VITAL_MOTION_STATES = ["idle", "walking", "active", "unknown"] as const;
export const VITAL_SOURCE_DEVICES = ["watch", "phone", "system"] as const;

const vitalEventMobileBaseSchema = z.object({
  deviceId: z.string().trim().min(1, "deviceId is required"),
  timestamp: z.coerce.date(),
  heartRate: z.number().int().min(30).max(220).optional(),
  motionState: z.enum(VITAL_MOTION_STATES).optional(),
  stepCount: z.number().int().nonnegative().optional(),
  sourceDevice: z.enum(VITAL_SOURCE_DEVICES),
});

const hasAtLeastOneSample = (data: {
  heartRate?: number;
  motionState?: string;
  stepCount?: number;
}) =>
  data.heartRate !== undefined ||
  data.motionState !== undefined ||
  data.stepCount !== undefined;

const atLeastOneSampleOptions = () => ({
  message: "At least one sample field must be provided",
  path: ["heartRate"],
});

export const createVitalEventMobileSchema = vitalEventMobileBaseSchema.refine(
  hasAtLeastOneSample,
  atLeastOneSampleOptions()
);

/**
 * Patient-token variant. Identical validation except that `deviceId` is
 * optional, because a patient-operated app identifies itself with its JWT.
 * Shared with the mobile module; caregiver routes keep the strict schema above.
 */
export const createVitalEventPatientSchema = vitalEventMobileBaseSchema
  .partial({ deviceId: true })
  .refine(hasAtLeastOneSample, atLeastOneSampleOptions());

export const listVitalsQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    sourceDevice: z.enum(VITAL_SOURCE_DEVICES).optional(),
    motionState: z.enum(VITAL_MOTION_STATES).optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  })
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: "from must be before or equal to to",
    path: ["from"],
  });

export const vitalsReportQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    sourceDevice: z.enum(VITAL_SOURCE_DEVICES).optional(),
    motionState: z.enum(VITAL_MOTION_STATES).optional(),
  })
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: "from must be before or equal to to",
    path: ["from"],
  });

export type CreateVitalEventMobileInput = z.infer<
  typeof createVitalEventMobileSchema
>;
export type CreateVitalEventPatientInput = z.infer<
  typeof createVitalEventPatientSchema
>;
export type ListVitalsQuery = z.infer<typeof listVitalsQuerySchema>;
export type VitalsReportQuery = z.infer<typeof vitalsReportQuerySchema>;
