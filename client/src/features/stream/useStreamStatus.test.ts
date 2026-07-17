import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/services/apiClient'
import { STREAM_STATUS_POLL_INTERVAL_MS, useStreamStatus } from './useStreamStatus'
import type { StreamSession, StreamStatusSummary } from '@/types/domain'

vi.mock('@/services/apiClient', async () => {
  const actual = await vi.importActual<typeof import('@/services/apiClient')>('@/services/apiClient')
  return {
    ...actual,
    api: {
      ...actual.api,
      getStreamStatus: vi.fn(),
      listStreamSessions: vi.fn(),
    },
  }
})

const getStreamStatus = vi.mocked(api.getStreamStatus)
const listStreamSessions = vi.mocked(api.listStreamSessions)

function summary(overrides: Partial<StreamStatusSummary> = {}): StreamStatusSummary {
  return {
    hasActiveStream: false,
    displayStatus: 'unavailable',
    viewerAvailable: false,
    caregiverMessage: 'No patient perspective stream is available for this session.',
    activeSession: null,
    latestSession: null,
    ...overrides,
  }
}

function session(id = 'history-1'): StreamSession {
  return {
    id,
    patientId: 'patient-1',
    helpEventId: null,
    startedAt: '2026-07-15T10:30:00.000Z',
    endedAt: null,
    source: 'glasses',
    status: 'active',
    viewerUrl: null,
    metadata: null,
    createdAt: '2026-07-15T10:30:00.000Z',
    updatedAt: '2026-07-15T10:30:00.000Z',
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

async function tick(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  getStreamStatus.mockReset()
  listStreamSessions.mockReset()
  getStreamStatus.mockResolvedValue(summary())
  listStreamSessions.mockResolvedValue([session()])
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useStreamStatus', () => {
  it('loads status and history immediately, then polls only status every three seconds', async () => {
    const { result } = renderHook(() => useStreamStatus({ patientId: 'patient-1' }))
    await tick()
    expect(getStreamStatus).toHaveBeenCalledTimes(1)
    expect(listStreamSessions).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('ready')

    await tick(STREAM_STATUS_POLL_INTERVAL_MS)
    expect(getStreamStatus).toHaveBeenCalledTimes(2)
    expect(listStreamSessions).toHaveBeenCalledTimes(1)
  })

  it('forwards history filters and refreshes history when they change', async () => {
    const { rerender } = renderHook(
      ({ source }) => useStreamStatus({ patientId: 'patient-1', historyQuery: { source } }),
      { initialProps: { source: undefined as 'glasses' | undefined } },
    )
    await tick()
    rerender({ source: 'glasses' })
    await tick()

    expect(listStreamSessions).toHaveBeenLastCalledWith(
      'patient-1',
      { source: 'glasses' },
      { signal: expect.any(AbortSignal) },
    )
  })

  it('loads history once when paused filters become valid again', async () => {
    const { rerender } = renderHook(
      ({ historyEnabled }) => useStreamStatus({ patientId: 'patient-1', historyEnabled }),
      { initialProps: { historyEnabled: false } },
    )
    await tick()
    expect(listStreamSessions).not.toHaveBeenCalled()

    rerender({ historyEnabled: true })
    await tick()
    expect(listStreamSessions).toHaveBeenCalledTimes(1)
  })

  it('does not overlap an in-flight status request', async () => {
    const pending = deferred<StreamStatusSummary>()
    getStreamStatus.mockReturnValueOnce(pending.promise)
    const { result } = renderHook(() => useStreamStatus({ patientId: 'patient-1' }))
    await tick()
    act(() => result.current.refresh())
    await tick(STREAM_STATUS_POLL_INTERVAL_MS)
    expect(getStreamStatus).toHaveBeenCalledTimes(1)

    await act(async () => pending.resolve(summary()))
    await tick()
    await tick(STREAM_STATUS_POLL_INTERVAL_MS)
    expect(getStreamStatus).toHaveBeenCalledTimes(2)
  })

  it('refreshes on window focus and when the document becomes visible', async () => {
    renderHook(() => useStreamStatus({ patientId: 'patient-1' }))
    await tick()
    await act(async () => window.dispatchEvent(new Event('focus')))
    await tick()
    expect(getStreamStatus).toHaveBeenCalledTimes(2)

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    await tick()
    expect(getStreamStatus).toHaveBeenCalledTimes(3)
  })

  it('ignores a late prior-patient response and clears old content on patient switch', async () => {
    const first = deferred<StreamStatusSummary>()
    const second = deferred<StreamStatusSummary>()
    getStreamStatus.mockReset().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    listStreamSessions.mockResolvedValue([])
    const { result, rerender } = renderHook(
      ({ patientId }) => useStreamStatus({ patientId }),
      { initialProps: { patientId: 'patient-1' }, },
    )
    await tick()
    rerender({ patientId: 'patient-2' })
    expect(result.current.summary).toBeNull()
    await tick()

    await act(async () => second.resolve(summary({ caregiverMessage: 'Patient two' })))
    await tick()
    await act(async () => first.resolve(summary({ caregiverMessage: 'Patient one' })))
    await tick()
    expect(result.current.summary?.caregiverMessage).toBe('Patient two')
  })

  it('reloads history when the active stream identity changes', async () => {
    const inactive = summary()
    const active = summary({
      hasActiveStream: true,
      displayStatus: 'active',
      caregiverMessage: 'Patient perspective stream is active.',
      activeSession: {
        id: 'stream-new',
        status: 'active',
        source: 'glasses',
        viewerUrl: null,
        startedAt: '2026-07-15T10:30:00.000Z',
      },
    })
    getStreamStatus.mockResolvedValueOnce(inactive).mockResolvedValueOnce(active)
    renderHook(() => useStreamStatus({ patientId: 'patient-1' }))
    await tick()
    expect(listStreamSessions).toHaveBeenCalledTimes(1)
    await tick(STREAM_STATUS_POLL_INTERVAL_MS)
    await tick()
    expect(listStreamSessions).toHaveBeenCalledTimes(2)
  })

  it('stops polling and aborts current work on unmount', async () => {
    const { unmount } = renderHook(() => useStreamStatus({ patientId: 'patient-1' }))
    await tick()
    const signal = getStreamStatus.mock.calls[0]?.[1]?.signal
    unmount()
    expect(signal?.aborted).toBe(true)
    await tick(STREAM_STATUS_POLL_INTERVAL_MS * 3)
    expect(getStreamStatus).toHaveBeenCalledTimes(1)
  })
})
