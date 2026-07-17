import type { AiSession, AiSessionDisplayStatus, AiSessionStatus } from '@/types/domain'

// Single source of truth for how an AI session is presented and acted upon,
// shared by the Help page and the Stream Status page so the two never drift.

// Terminal statuses can never become joinable again and always carry an endedAt.
export const TERMINAL_AI_STATUSES: AiSessionStatus[] = [
  'resolved',
  'cancelled',
  'error',
  'start_failed',
]

// The backend is authoritative for how a session should be presented. This only
// provides a safe fallback for older records that predate `displayStatus`, so
// the UI never has to guess Active/Ended purely from a raw status string.
export function resolveDisplayStatus(session: AiSession): AiSessionDisplayStatus {
  if (session.displayStatus) return session.displayStatus

  switch (session.status) {
    case 'resolved':
      return 'Resolved'
    case 'error':
    case 'start_failed':
      return 'Failed'
    case 'cancelled':
      return 'Ended'
    case 'caregiver_joined':
      return session.endedAt ? 'Ended' : 'Caregiver joined'
    default:
      return session.endedAt ? 'Ended' : 'Active'
  }
}

// Join is shown strictly from the backend-authoritative flag. When the field is
// absent (older payloads) we default to non-joinable rather than guessing.
export function canJoinSession(session: AiSession): boolean {
  return session.isJoinable === true
}

// "Current" = a genuinely live session (joinable, or an in-progress caregiver
// hand-off). Everything else — resolved, failed, ended, superseded, stale — is
// history. Used to keep the live session visually separate from the log.
export function isCurrentSession(session: AiSession): boolean {
  const display = resolveDisplayStatus(session)
  return session.isJoinable === true || display === 'Caregiver joined'
}

// A session is terminal (read-only) once its status is terminal or it has ended.
// Terminal sessions never poll and never expose Join/Resolve actions.
export function isTerminalAiSession(
  session: Pick<AiSession, 'status' | 'endedAt'> | null | undefined,
): boolean {
  if (!session) return false
  if (TERMINAL_AI_STATUSES.includes(session.status)) return true
  return Boolean(session.endedAt)
}

export type StreamSessionActionKind = 'join' | 'open' | 'view' | 'none'

export interface StreamSessionAction {
  kind: StreamSessionActionKind
  label: string | null
}

/**
 * Resolves the Stream Status viewer-header action for the AI session linked to
 * the *exact* active glasses stream. It is driven only by the exact linked
 * `aiSessionId` and the backend-authoritative session detail — never by a
 * "newest patient session" guess and never by stream state alone.
 *
 * - No linked id            → no action.
 * - Terminal linked session → View summary.
 * - Authoritatively joinable → Join session.
 * - Any other linked state  → Open session (read-only), including while the
 *   detail snapshot is still loading (`session` is null) so we never present
 *   Join before the backend confirms joinability.
 */
export function resolveStreamSessionAction(
  aiSessionId: string | null | undefined,
  session: AiSession | null,
): StreamSessionAction {
  if (!aiSessionId) return { kind: 'none', label: null }
  if (session && isTerminalAiSession(session)) return { kind: 'view', label: 'View summary' }
  if (session?.isJoinable === true) return { kind: 'join', label: 'Join session' }
  return { kind: 'open', label: 'Open session' }
}
