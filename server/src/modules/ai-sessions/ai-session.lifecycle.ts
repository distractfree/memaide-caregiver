import type { AiSessionStatus } from "./ai-session.state-machine";

// Terminal statuses can never become joinable again and always carry an endedAt.
export const TERMINAL_STATUSES: AiSessionStatus[] = [
  "resolved",
  "cancelled",
  "error",
  "start_failed",
];

// Non-terminal ("live") statuses represent a session that has not been closed.
export const NON_TERMINAL_STATUSES: AiSessionStatus[] = [
  "starting",
  "active",
  "caregiver_joined",
  "backup_suggested",
  "backup_notified",
  "emergency_suggested",
];

// Statuses from which a caregiver may still join a genuinely live conversation.
// `starting` is not yet registered with Anthony, and `caregiver_joined` means
// the caregiver already joined, so both are intentionally excluded here.
export const JOINABLE_STATUSES: AiSessionStatus[] = [
  "active",
  "backup_suggested",
  "backup_notified",
  "emergency_suggested",
];

export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.includes(status as AiSessionStatus);
}

// Configurable staleness window. A single source of truth so the value is never
// hardcoded in multiple files. Defaults to 15 minutes.
export function getStaleMinutes(): number {
  const parsed = Number(process.env.AI_SESSION_STALE_MINUTES ?? "15");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
}

export type JoinabilityReason =
  | "live"
  | "ended"
  | "terminal_status"
  | "stale"
  | "superseded"
  | "registration_failed"
  | "not_live";

export type DisplayStatus =
  | "Active"
  | "Caregiver joined"
  | "Resolved"
  | "Ended"
  | "Failed"
  | "Stale";

export interface JoinabilityInput {
  status: string;
  startedAt?: Date | string | null;
  endedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  caregiverJoinedAt?: Date | string | null;
  emergencySuggestedAt?: Date | string | null;
  metadata?: unknown;
  // Timestamp of the most recent AiSessionMessage, when known.
  lastMessageAt?: Date | string | null;
}

export interface JoinabilityResult {
  isJoinable: boolean;
  joinabilityReason: JoinabilityReason;
  displayStatus: DisplayStatus;
  lastActivityAt: string | null;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function isSuperseded(metadata: unknown): boolean {
  const record = asRecord(metadata);
  return Boolean(
    record.supersededBy || record.supersededAt || record.supersededReason
  );
}

// Recent activity is the most recent of: the latest message, the last row
// update (updatedAt advances on every status change), caregiver-join and
// escalation timestamps, and finally the session start time as a floor.
export function computeLastActivityAt(input: JoinabilityInput): Date | null {
  const candidates = [
    input.lastMessageAt,
    input.updatedAt,
    input.caregiverJoinedAt,
    input.emergencySuggestedAt,
    input.startedAt,
  ]
    .map(toDate)
    .filter((d): d is Date => d !== null);

  if (candidates.length === 0) return null;
  return new Date(Math.max(...candidates.map((d) => d.getTime())));
}

// Backend-authoritative joinability. The frontend must not re-derive this from
// timestamps or raw status strings.
export function computeJoinability(input: JoinabilityInput): JoinabilityResult {
  const status = input.status;
  const endedAt = toDate(input.endedAt);
  const superseded = isSuperseded(input.metadata);
  const lastActivity = computeLastActivityAt(input);

  let isJoinable = false;
  let joinabilityReason: JoinabilityReason;

  if (status === "start_failed") {
    joinabilityReason = "registration_failed";
  } else if (status === "error") {
    joinabilityReason = "terminal_status";
  } else if (status === "resolved") {
    joinabilityReason = "terminal_status";
  } else if (status === "cancelled") {
    joinabilityReason = superseded ? "superseded" : "terminal_status";
  } else if (superseded) {
    joinabilityReason = "superseded";
  } else if (endedAt) {
    joinabilityReason = "ended";
  } else {
    // Any remaining status is non-terminal (starting, active, caregiver_joined,
    // backup_*, emergency_suggested). Staleness applies to ALL of them and is
    // evaluated before "not_live", so an old caregiver_joined/starting session
    // is reported as stale rather than lingering as Active/In progress forever.
    const staleMs = getStaleMinutes() * 60_000;
    const isStale =
      lastActivity !== null && Date.now() - lastActivity.getTime() > staleMs;

    if (isStale) {
      joinabilityReason = "stale";
    } else if (!JOINABLE_STATUSES.includes(status as AiSessionStatus)) {
      // Recent but not joinable (starting, caregiver_joined).
      joinabilityReason = "not_live";
    } else {
      joinabilityReason = "live";
      isJoinable = true;
    }
  }

  let displayStatus: DisplayStatus;
  if (status === "start_failed" || status === "error") {
    displayStatus = "Failed";
  } else if (status === "resolved") {
    displayStatus = "Resolved";
  } else if (status === "cancelled" || superseded || endedAt) {
    displayStatus = "Ended";
  } else if (joinabilityReason === "stale") {
    displayStatus = "Stale";
  } else if (status === "caregiver_joined") {
    // Recent, caregiver is engaged: a clear in-progress state, not "Active".
    displayStatus = "Caregiver joined";
  } else {
    displayStatus = "Active";
  }

  return {
    isJoinable,
    joinabilityReason,
    displayStatus,
    lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
  };
}
