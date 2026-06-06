import { z } from "zod";

export const BEACON_SOURCE_DEVICES = ["phone", "system"] as const;

const beaconUuidSchema = z
  .string()
  .trim()
  .uuid("beaconUuid must be a valid UUID");

const roomNameSchema = z.string().trim().min(1, "roomName is required").max(100);

const beaconConfigFields = {
  roomName: roomNameSchema,
  beaconUuid: beaconUuidSchema,
  major: z.number().int().nonnegative().optional(),
  minor: z.number().int().nonnegative().optional(),
  thresholdDistanceM: z.number().positive().optional(),
  dwellSeconds: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
};

export const createBeaconSchema = z.object(beaconConfigFields);

export const updateBeaconSchema = z
  .object(beaconConfigFields)
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const listBeaconsQuerySchema = z.object({
  active: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const listBeaconEventsQuerySchema = z.object({
  beaconId: z.string().trim().min(1).optional(),
  roomName: z.string().trim().min(1).optional(),
  sourceDevice: z.enum(BEACON_SOURCE_DEVICES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const beaconReportQuerySchema = z
  .object({
    beaconId: z.string().trim().min(1).optional(),
    roomName: z.string().trim().min(1).optional(),
    sourceDevice: z.enum(BEACON_SOURCE_DEVICES).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: "from must be before or equal to to",
    path: ["from"],
  });

export const mobileBeaconsQuerySchema = z.object({
  deviceId: z.string().trim().min(1, "deviceId is required"),
});

export const createBeaconEventMobileSchema = z.object({
  deviceId: z.string().trim().min(1, "deviceId is required"),
  beaconId: z.string().trim().min(1, "beaconId is required"),
  detectedAt: z.coerce.date(),
  roomName: z.string().trim().min(1).optional(),
  exitedAt: z.coerce.date().optional(),
  dwellSeconds: z.number().int().nonnegative().optional(),
  estimatedDistanceM: z.number().nonnegative().optional(),
  sourceDevice: z.enum(BEACON_SOURCE_DEVICES).default("phone"),
});

export type CreateBeaconInput = z.infer<typeof createBeaconSchema>;
export type UpdateBeaconInput = z.infer<typeof updateBeaconSchema>;
export type ListBeaconsQuery = z.infer<typeof listBeaconsQuerySchema>;
export type ListBeaconEventsQuery = z.infer<typeof listBeaconEventsQuerySchema>;
export type BeaconReportQuery = z.infer<typeof beaconReportQuerySchema>;
export type MobileBeaconsQuery = z.infer<typeof mobileBeaconsQuerySchema>;
export type CreateBeaconEventMobileInput = z.infer<
  typeof createBeaconEventMobileSchema
>;
