import type { AiSession, AiSessionDisplayStatus } from '@/types/domain'

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
