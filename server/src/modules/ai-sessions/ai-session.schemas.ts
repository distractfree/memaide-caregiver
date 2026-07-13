import { z } from "zod";

export const AI_SESSION_STATUSES = [
  "starting",
  "active",
  "caregiver_joined",
  "backup_suggested",
  "backup_notified",
  "emergency_suggested",
  "resolved",
  "cancelled",
  "error",
  "start_failed",
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
  // Accept an omitted vitals field, an explicit null, or a valid vitals object.
  vitals: z
    .object({
      heart_rate: z.number().int().min(30).max(220).optional(),
      motion_state: z.enum(["idle", "walking", "active", "unknown"]).optional(),
      step_count: z.number().int().nonnegative().optional(),
      timestamp: z.string().datetime(),
    })
    .nullish(),
  beacons: z
    .array(
      z.object({
        room: z.string().trim().min(1, "room is required"),
        detected_at: z.string().datetime(),
        dwell_seconds: z.number().int().nonnegative().nullable().optional(),
        estimated_distance_m: z.number().nonnegative().nullable().optional(),
        exited_at: z.string().datetime().nullable().optional(),
      })
    )
    .optional()
    .default([]),
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
  // Bounded history: callers request a recent window instead of the full log.
  // Coerced because query params arrive as strings. Capped to keep responses small.
  limit: z.coerce.number().int().positive().max(200).optional(),
});

const callbackDateTimeSchema = z.string().datetime({ offset: true });

export const aiSessionEscalationCallbackSchema = z.object({
  reason: z.string().trim().min(1, "reason is required"),
  triggered_by: z.array(z.string().trim().min(1)).default([]),
});

export const aiSessionConcludeCallbackSchema = z.object({
  id: z.string().trim().min(1),
  patient_id: z.string().trim().min(1),
  related_caretaker_id: z.string().trim().min(1).nullable().optional(),
  started_at: callbackDateTimeSchema,
  ended_at: callbackDateTimeSchema,
  handoff_at: callbackDateTimeSchema.nullable().optional(),
  handoff_type: z.string().trim().min(1).nullable().optional(),
  transcript: z.array(
    z.object({
      role: z.string().trim().min(1),
      text: z.string(),
      ts: callbackDateTimeSchema,
      scene_label: z.string().nullable().optional(),
    })
  ),
  final_scene_label: z.string().nullable().optional(),
  escalated: z.boolean(),
  status: z.string().trim().min(1),
  outcome: z.string().trim().min(1),
});

export type StartAiSessionInput = z.infer<typeof startAiSessionSchema>;
export type AiSessionEscalationCallbackInput = z.infer<
  typeof aiSessionEscalationCallbackSchema
>;
export type AiSessionConcludeCallbackInput = z.infer<
  typeof aiSessionConcludeCallbackSchema
>;
