import { describe, expect, it } from 'vitest'
import {
  isTerminalAiSession,
  resolveStreamSessionAction,
} from './aiSessionUi'
import type { AiSession } from '@/types/domain'

function makeSession(overrides: Partial<AiSession> = {}): AiSession {
  return {
    id: 'ai-1',
    patientId: 'patient-1',
    helpEventId: null,
    status: 'active',
    startedAt: '2026-07-13T04:00:00.000Z',
    endedAt: null,
    caregiverJoinedAt: null,
    emergencySuggestedAt: null,
    summary: null,
    createdAt: '2026-07-13T04:00:00.000Z',
    updatedAt: '2026-07-13T04:00:00.000Z',
    ...overrides,
  }
}

describe('isTerminalAiSession', () => {
  it('treats terminal statuses and ended sessions as terminal', () => {
    expect(isTerminalAiSession(makeSession({ status: 'resolved' }))).toBe(true)
    expect(isTerminalAiSession(makeSession({ status: 'cancelled' }))).toBe(true)
    expect(isTerminalAiSession(makeSession({ status: 'error' }))).toBe(true)
    expect(isTerminalAiSession(makeSession({ status: 'start_failed' }))).toBe(true)
    expect(
      isTerminalAiSession(makeSession({ status: 'active', endedAt: '2026-07-13T05:00:00.000Z' })),
    ).toBe(true)
  })

  it('treats live statuses as non-terminal', () => {
    expect(isTerminalAiSession(makeSession({ status: 'active' }))).toBe(false)
    expect(isTerminalAiSession(makeSession({ status: 'caregiver_joined' }))).toBe(false)
    expect(isTerminalAiSession(null)).toBe(false)
  })
})

describe('resolveStreamSessionAction', () => {
  it('returns no action when there is no linked AI session id', () => {
    expect(resolveStreamSessionAction(null, makeSession({ isJoinable: true }))).toEqual({
      kind: 'none',
      label: null,
    })
    expect(resolveStreamSessionAction(undefined, null)).toEqual({ kind: 'none', label: null })
  })

  it('offers Open (never Join) before the authoritative snapshot has loaded', () => {
    expect(resolveStreamSessionAction('ai-1', null)).toEqual({ kind: 'open', label: 'Open session' })
  })

  it('offers Join only when the backend reports the session is joinable', () => {
    expect(resolveStreamSessionAction('ai-1', makeSession({ isJoinable: true }))).toEqual({
      kind: 'join',
      label: 'Join session',
    })
  })

  it('offers Open for a linked, non-terminal, non-joinable session (e.g. already joined)', () => {
    expect(
      resolveStreamSessionAction('ai-1', makeSession({ status: 'caregiver_joined', isJoinable: false })),
    ).toEqual({ kind: 'open', label: 'Open session' })
  })

  it('offers View summary for a terminal linked session', () => {
    expect(
      resolveStreamSessionAction('ai-1', makeSession({ status: 'resolved', endedAt: '2026-07-13T05:00:00.000Z' })),
    ).toEqual({ kind: 'view', label: 'View summary' })
  })
})
