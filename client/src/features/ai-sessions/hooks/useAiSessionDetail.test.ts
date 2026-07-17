import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAiSessionDetail } from './useAiSessionDetail'
import { api } from '@/services/apiClient'
import type { AiSession } from '@/types/domain'

vi.mock('@/services/apiClient', async () => {
  const actual =
    await vi.importActual<typeof import('@/services/apiClient')>('@/services/apiClient')
  return {
    ...actual,
    api: {
      getAiSessionById: vi.fn(),
      caregiverJoinAiSession: vi.fn(),
      resolveAiSession: vi.fn(),
    },
  }
})

const getAiSessionById = vi.mocked(api.getAiSessionById)

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
    isJoinable: true,
    displayStatus: 'Active',
    messages: [],
    ...overrides,
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('useAiSessionDetail', () => {
  it('fetches the session when enabled and exposes it', async () => {
    getAiSessionById.mockResolvedValue(makeSession())

    const { result } = renderHook(() =>
      useAiSessionDetail({ sessionId: 'ai-1', enabled: true, poll: false }),
    )

    await waitFor(() => expect(result.current.session?.id).toBe('ai-1'))
    expect(getAiSessionById).toHaveBeenCalledWith('ai-1', expect.objectContaining({ signal: expect.anything() }))
  })

  it('does not fetch when disabled', async () => {
    getAiSessionById.mockResolvedValue(makeSession())

    renderHook(() => useAiSessionDetail({ sessionId: 'ai-1', enabled: false, poll: false }))

    await delay(60)
    expect(getAiSessionById).not.toHaveBeenCalled()
  })

  it('does not poll when poll is false', async () => {
    getAiSessionById.mockResolvedValue(makeSession())

    renderHook(() =>
      useAiSessionDetail({ sessionId: 'ai-1', enabled: true, poll: false, pollIntervalMs: 30 }),
    )

    await waitFor(() => expect(getAiSessionById).toHaveBeenCalledTimes(1))
    await delay(120)
    expect(getAiSessionById).toHaveBeenCalledTimes(1)
  })

  it('polls on the interval while open and the session is non-terminal', async () => {
    getAiSessionById.mockResolvedValue(makeSession())

    renderHook(() =>
      useAiSessionDetail({ sessionId: 'ai-1', enabled: true, poll: true, pollIntervalMs: 30 }),
    )

    await waitFor(() => expect(getAiSessionById.mock.calls.length).toBeGreaterThanOrEqual(3))
  })

  it('stops polling once the session is terminal', async () => {
    getAiSessionById.mockResolvedValue(makeSession({ status: 'resolved', endedAt: '2026-07-13T04:05:00.000Z' }))

    renderHook(() =>
      useAiSessionDetail({ sessionId: 'ai-1', enabled: true, poll: true, pollIntervalMs: 30 }),
    )

    await waitFor(() => expect(getAiSessionById).toHaveBeenCalledTimes(1))
    await delay(120)
    // Terminal session: the initial fetch happened but the poll loop does not fire.
    expect(getAiSessionById).toHaveBeenCalledTimes(1)
  })

  it('clears the previous session and fetches the new one when the session id changes', async () => {
    getAiSessionById.mockImplementation((id) => Promise.resolve(makeSession({ id })))

    const { result, rerender } = renderHook(
      ({ sessionId }) => useAiSessionDetail({ sessionId, enabled: true, poll: false }),
      { initialProps: { sessionId: 'ai-1' } },
    )

    await waitFor(() => expect(result.current.session?.id).toBe('ai-1'))

    rerender({ sessionId: 'ai-2' })
    await waitFor(() => expect(result.current.session?.id).toBe('ai-2'))
    expect(getAiSessionById).toHaveBeenCalledWith('ai-2', expect.anything())
  })
})
