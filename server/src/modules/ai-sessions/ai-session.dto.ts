// Canonical, public-facing DTOs for AI sessions. The frontend must never
// receive raw Prisma rows: the DB stores `senderType`/`message`, while every
// client (caregiver, mobile, admin) consumes `role`/`content`. Mapping in one
// place keeps that contract consistent and prevents blank transcript bubbles.

export type ApiMessageRole = "system" | "user" | "assistant" | "caregiver";

export interface ApiSessionMessage {
  id: string;
  aiSessionId: string;
  role: ApiMessageRole;
  content: string;
  metadata: unknown;
  createdAt: string;
}

// Shape of a stored message row we need for mapping (Prisma AiSessionMessage).
export interface StoredMessage {
  id: string;
  aiSessionId: string;
  senderType: string;
  message: string;
  metadata?: unknown;
  createdAt: Date | string;
}

// senderType (DB) -> role (API). `event` collapses to `system` so lifecycle
// events (caregiver joined, resolved, escalation) render as visible system
// notices rather than disappearing.
export function mapSenderTypeToRole(senderType: string): ApiMessageRole {
  switch (senderType) {
    case "patient":
      return "user";
    case "ai":
      return "assistant";
    case "caregiver":
      return "caregiver";
    case "system":
    case "event":
      return "system";
    default:
      return "system";
  }
}

export function toApiMessage(row: StoredMessage): ApiSessionMessage {
  return {
    id: row.id,
    aiSessionId: row.aiSessionId,
    role: mapSenderTypeToRole(row.senderType),
    content: row.message,
    metadata: row.metadata ?? null,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

export function toApiMessages(rows: StoredMessage[] | undefined | null): ApiSessionMessage[] {
  return (rows ?? []).map(toApiMessage);
}

export type RegistrationStatus = "registered" | "failed" | "unknown";

// Safe, non-secret evidence of whether Anthony acknowledged the session start.
// This is registration evidence only; it is NOT a live-connection signal.
export function deriveRegistrationStatus(
  status: string,
  metadata: unknown
): RegistrationStatus {
  const record =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};

  if (record.aiAgentRegisteredAt) return "registered";
  if (status === "start_failed" || record.registrationFailed) return "failed";
  return "unknown";
}
