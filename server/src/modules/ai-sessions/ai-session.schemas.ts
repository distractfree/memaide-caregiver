import { z } from "zod";

export const AI_SESSION_STATUSES = [
  "active",
  "caregiver_joined",
  "backup_suggested",
  "backup_notified",
  "emergency_suggested",
  "resolved",
  "cancelled",
  "error",
] as const;

export const AI_MESSAGE_SENDER_TYPES = [
  "system",
  "ai",
  "patient",
  "caregiver",
  "event",
] as const;

export const startAiSessionSchema = z.object({
  deviceId: z.string().min(1, "deviceId is required"),
  helpEventId: z.string().cuid("Invalid helpEventId format").optional(),
  sourceDevice: z.enum(["phone", "watch", "system"]).optional().default("phone"),
});

export const addAiSessionMessageSchema = z.object({
  deviceId: z.string().min(1, "deviceId is required"),
  message: z.string().min(1, "message cannot be empty"),
  senderType: z.enum(["patient"]), // Only mobile patient is allowed here
});

export const resolveAiSessionSchema = z.object({
  deviceId: z.string().min(1, "deviceId is required"),
});

export const emergencySuggestionAckSchema = z.object({
  deviceId: z.string().min(1, "deviceId is required"),
  action: z.enum(["call_initiated", "dismissed"]),
});

export const listCaregiverAiSessionsSchema = z.object({
  status: z.enum(AI_SESSION_STATUSES).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
