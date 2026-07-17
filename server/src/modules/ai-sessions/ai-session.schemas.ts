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

// Maximum length for a caregiver-entered resolution summary. Chosen explicitly
// and documented in docs/API_REFERENCE.md. The caregiver portal soft-caps its
// textarea below this; the server is the authoritative hard cap.
export const CAREGIVER_RESOLVE_SUMMARY_MAX_LENGTH = 2000;

// Caregiver-provided resolution summary. Trimmed, required, and length-bounded.
// The previous behavior silently discarded this and persisted a hardcoded
// string; the summary is now validated here and persisted verbatim.
export const caregiverResolveAiSessionSchema = z.object({
  summary: z
    .string()
    .trim()
    .min(1, "summary is required")
    .max(
      CAREGIVER_RESOLVE_SUMMARY_MAX_LENGTH,
      `summary must be at most ${CAREGIVER_RESOLVE_SUMMARY_MAX_LENGTH} characters`
    ),
});
export type CaregiverResolveAiSessionInput = z.infer<
  typeof caregiverResolveAiSessionSchema
>;

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

const MAX_VISION_DESCRIPTION_LENGTH = 2000;
const MAX_VISION_LABEL_LENGTH = 100;
const MAX_VISION_FLAGS = 50;
const MAX_VISION_FLAG_LENGTH = 100;

function getFrameMaxDecodedBytes() {
  const value = Number(process.env.AI_FRAME_MAX_DECODED_BYTES ?? "786432");
  return Number.isSafeInteger(value) && value > 0 ? value : 786432;
}

/**
 * Strict raw base64 validation without decoding an image in the request path.
 * JPEG callbacks are standard base64; unpadded canonical base64 is also
 * accepted. Any whitespace, data URL prefix, URL-safe alphabet, malformed
 * padding, or invalid encoded length is rejected.
 */
function getStrictBase64DecodedByteLength(value: string): number | null {
  if (!value || value.startsWith("data:")) return null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return null;

  const firstPadding = value.indexOf("=");
  const contentLength = firstPadding === -1 ? value.length : firstPadding;
  const paddingLength = firstPadding === -1 ? 0 : value.length - firstPadding;
  const remainder = contentLength % 4;

  if (remainder === 1) return null;
  if (paddingLength > 0) {
    if (value.length % 4 !== 0) return null;
    if ((paddingLength === 1 && remainder !== 3) || (paddingLength === 2 && remainder !== 2)) {
      return null;
    }
  }

  return Math.floor((contentLength * 3) / 4);
}

const frameTimestampSchema = z
  .string()
  .datetime({ offset: true })
  .refine((value) => Number.isFinite(Date.parse(value)), "Invalid timestamp")
  .transform((value) => new Date(value).toISOString());

const optionalVisionText = (maxLength: number) =>
  z.string().trim().max(maxLength).nullable().optional();

const visionFlagSchema = z.string().trim().min(1).max(MAX_VISION_FLAG_LENGTH);

const aiFrameVisionSchema = z
  .object({
    description: optionalVisionText(MAX_VISION_DESCRIPTION_LENGTH),
    label: optionalVisionText(MAX_VISION_LABEL_LENGTH),
    flags: z.array(visionFlagSchema).max(MAX_VISION_FLAGS).optional().default([]),
    advisory_flags: z
      .array(visionFlagSchema)
      .max(MAX_VISION_FLAGS)
      .optional()
      .default([]),
  })
  .strict();

const aiFrameImageSchema = z
  .object({
    mime: z.literal("image/jpeg"),
    b64: z.string().min(1),
  })
  .strict()
  .superRefine((image, ctx) => {
    const decodedBytes = getStrictBase64DecodedByteLength(image.b64);
    if (decodedBytes === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["b64"],
        message: "image.b64 must be raw, valid base64 without a data URL prefix",
      });
      return;
    }
    if (decodedBytes > getFrameMaxDecodedBytes()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["b64"],
        message: "Decoded image exceeds the configured maximum size",
      });
    }
  });

export const aiSessionFrameCallbackSchema = z
  .object({
    seq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    ts: frameTimestampSchema,
    vision: aiFrameVisionSchema.optional(),
    image: aiFrameImageSchema.optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    const vision = input.vision;
    const hasVisionContent = Boolean(
      vision &&
        (Boolean(vision.description) ||
          Boolean(vision.label) ||
          vision.flags.length > 0 ||
          vision.advisory_flags.length > 0)
    );
    if (!input.image && !hasVisionContent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A frame callback requires an image or meaningful vision data",
      });
    }
  });

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
export type AiSessionFrameCallbackInput = z.infer<
  typeof aiSessionFrameCallbackSchema
>;
