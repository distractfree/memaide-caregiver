import { z } from "zod";

export const STREAM_SOURCES = ["glasses", "phone", "mock", "unknown"] as const;
export const STREAM_STATUSES = [
  "unavailable",
  "starting",
  "active",
  "ended",
  "failed",
] as const;

const metadataSchema = z.record(z.unknown());

export const startStreamSessionSchema = z.object({
  deviceId: z.string().trim().min(1, "deviceId is required"),
  helpEventId: z.string().trim().min(1).optional(),
  source: z.enum(STREAM_SOURCES),
  startedAt: z.coerce.date().optional(),
  status: z.enum(["starting", "active", "unavailable", "failed"]).default("starting"),
  viewerUrl: z.string().trim().url().optional(),
  metadata: metadataSchema.optional(),
});

export const stopStreamSessionSchema = z.object({
  deviceId: z.string().trim().min(1, "deviceId is required"),
  streamSessionId: z.string().trim().min(1, "streamSessionId is required"),
  endedAt: z.coerce.date().optional(),
  status: z.enum(["ended", "failed", "unavailable"]).default("ended"),
});

export const updateStreamStatusSchema = z.object({
  deviceId: z.string().trim().min(1, "deviceId is required"),
  streamSessionId: z.string().trim().min(1, "streamSessionId is required"),
  status: z.enum(STREAM_STATUSES),
  viewerUrl: z.string().trim().url().optional(),
  metadata: metadataSchema.optional(),
});

export const listStreamSessionsQuerySchema = z
  .object({
    status: z.enum(STREAM_STATUSES).optional(),
    source: z.enum(STREAM_SOURCES).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: "from must be before or equal to to",
    path: ["from"],
  });

export type StartStreamSessionInput = z.infer<typeof startStreamSessionSchema>;
export type StopStreamSessionInput = z.infer<typeof stopStreamSessionSchema>;
export type UpdateStreamStatusInput = z.infer<typeof updateStreamStatusSchema>;
export type ListStreamSessionsQuery = z.infer<typeof listStreamSessionsQuerySchema>;
