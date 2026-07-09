import { AppError } from "../../middleware/error.middleware";
import { AI_SESSION_STATUSES } from "./ai-session.schemas";

export type AiSessionStatus = typeof AI_SESSION_STATUSES[number];

// Record of valid transitions: Record<currentStatus, validNextStatuses[]>
const VALID_TRANSITIONS: Record<AiSessionStatus, AiSessionStatus[]> = {
  starting: ["active", "start_failed", "error"],
  active: [
    "caregiver_joined",
    "backup_suggested",
    "emergency_suggested",
    "resolved",
    "cancelled",
    "error",
  ],
  caregiver_joined: ["resolved", "error"],
  backup_suggested: ["backup_notified", "resolved", "error"],
  backup_notified: ["emergency_suggested", "resolved", "error"],
  emergency_suggested: ["resolved", "error"],
  resolved: [],
  cancelled: [],
  error: [],
  start_failed: [],
};

export function validateTransition(currentStatus: AiSessionStatus, nextStatus: AiSessionStatus): void {
  if (currentStatus === nextStatus) {
    return; // No-op
  }
  
  const allowedNext = VALID_TRANSITIONS[currentStatus];
  if (!allowedNext || !allowedNext.includes(nextStatus)) {
    throw new AppError(400, `Invalid AI session transition from ${currentStatus} to ${nextStatus}`);
  }
}
