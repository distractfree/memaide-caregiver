import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useVitalsReport, VITALS_POLL_INTERVAL_MS } from './useVitalsReport'
import { api, ApiClientError } from '@/services/apiClient'
import type { VitalEvent, VitalReport } from '@/types/domain'

vi.mock('@/services/apiClient', async () => {
  const actual =
    await vi.importActual<typeof import('@/services/apiClient')>('@/services/apiClient')
  return {
    ...actual,
    api: { getVitalsReport: vi.fn() },
  }
})

const getVitalsReport = vi.mocked(api.getVitalsReport)

let idSeq = 0
function makeEvent(overrides: Partial<VitalEvent> = {}): VitalEvent {
  idSeq += 1
  return {
    id: `event-${idSeq}`,
    patientId: 'patient-1',
    timestamp: '2026-07-13T04:03:07.603Z',
    heartRate: 72,
    motionState: 'idle',
    stepCount: 100,
    sourceDevice: 'watch',
    createdAt: '2026-07-13T04:03:07.603Z',
    updatedAt: '2026-07-13T04:03:07.603Z',
    ...overrides,
  }
}

function makeReport(events: VitalEvent[]): VitalReport {
  const latest = events[0] ?? null
  return {
    summary: {
      totalSamples: events.length,
      samplesWithHeartRate: events.filter((e) => e.heartRate !== null).length,
      samplesWithMotionState: events.filter((e) => e.motionState !== null).length,
      samplesWithStepCount: events.filter((e) => e.stepCount !== null).length,
      firstSampleAt: events[events.length - 1]?.timestamp ?? null,
      latestSampleAt: latest?.timestamp ?? null,
      latestHeartRate: latest?.heartRate ?? null,
      latestMotionState: latest?.motionState ?? null,
      latestStepCount: latest?.stepCount ?? null,
      totalStepsLatestValue: latest?.stepCount ?? null,
      averageHeartRate: null,
      minHeartRate: null,
      maxHeartRate: null,
      stepCountDelta: null,
      mostCommonMotionState: latest?.motionState ?? null,
      countsBySourceDevice: { watch: events.length, phone: 0, system: 0 },
      countsByMotionState: { idle: 0, walking: 0, active: 0, unknown: 0 },
    },
    heartRateTrend: [...events]
      .reverse()
      .filter((e) => e.heartRate !== null)
      .map((e) => ({
        timestamp: e.timestamp,
        heartRate: e.heartRate as number,
        sourceDevice: e.sourceDevice,
      })),
    stepTrend: [],
    motionTimeline: [],
    dailySummaries: [],
    events,
    notes: { positioning: '', availability: '' },
  }
}

/** Flush pending timers + microtasks inside act(). */
async function tick(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  idSeq = 0
  getVitalsReport.mockReset()
  // Fake timers for the polling interval, but keep the real Date so
  // `lastUpdatedAt` and timestamp formatting stay realistic.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useVitalsReport', () => {
  it('fetches immediately when the page opens', async () => {
    getVitalsReport.mockResolvedValue(makeReport([makeEvent()]))

    const { result } = renderHook(() =>
      useVitalsReport({ patientId: 'patient-1', intervalMs: 5000 }),
    )
    await tick()

    expect(getVitalsReport).toHaveBeenCalledTimes(1)
    expect(getVitalsReport).toHaveBeenCalledWith('patient-1', undefined, expect.any(AbortSignal))
    expect(result.current.status).toBe('ready')
    expect(result.current.report?.events).toHaveLength(1)
    expect(result.current.lastUpdatedAt).toBeInstanceOf(Date)
  })

  it('uses a 5 second default poll interval', () => {
    expect(VITALS_POLL_INTERVAL_MS).toBe(5000)
  })

  it('automatically refetches every 5 seconds', async () => {
    getVitalsReport.mockResolvedValue(makeReport([makeEvent()]))

    renderHook(() => useVitalsReport({ patientId: 'patient-1', intervalMs: 5000 }))
    await tick()
    expect(getVitalsReport).toHaveBeenCalledTimes(1)

    await tick(5000)
    expect(getVitalsReport).toHaveBeenCalledTimes(2)

    await tick(5000)
    expect(getVitalsReport).toHaveBeenCalledTimes(3)
  })

  it('shows a newly received record after a poll without a reload', async () => {
    const first = makeReport([makeEvent({ id: 'e1', heartRate: 72 })])
    const second = makeReport([
      makeEvent({ id: 'e2', heartRate: 80, timestamp: '2026-07-13T04:05:33.993Z' }),
      makeEvent({ id: 'e1', heartRate: 72 }),
    ])
    getVitalsReport.mockResolvedValueOnce(first).mockResolvedValueOnce(second)

    const { result } = renderHook(() =>
      useVitalsReport({ patientId: 'patient-1', intervalMs: 5000 }),
    )
    await tick()
    expect(result.current.report?.events.map((e) => e.id)).toEqual(['e1'])

    await tick(5000)
    expect(result.current.report?.events.map((e) => e.id)).toEqual(['e2', 'e1'])
  })

  it('reflects a motion-state change from idle to active on the next poll', async () => {
    getVitalsReport
      .mockResolvedValueOnce(makeReport([makeEvent({ id: 'e1', motionState: 'idle' })]))
      .mockResolvedValueOnce(makeReport([makeEvent({ id: 'e1', motionState: 'active' })]))

    const { result } = renderHook(() =>
      useVitalsReport({ patientId: 'patient-1', intervalMs: 5000 }),
    )
    await tick()
    expect(result.current.report?.events[0]?.motionState).toBe('idle')

    await tick(5000)
    expect(result.current.report?.events[0]?.motionState).toBe('active')
  })

  it('preserves exact heart-rate values without normalizing or falling back to 82', async () => {
    const values = [72, 75, 76, 79, 80, 82]
    const events = values.map((hr, i) =>
      makeEvent({ id: `hr-${i}`, heartRate: hr }),
    )
    getVitalsReport.mockResolvedValue(makeReport(events))

    const { result } = renderHook(() =>
      useVitalsReport({ patientId: 'patient-1', intervalMs: 5000 }),
    )
    await tick()

    expect(result.current.report?.events.map((e) => e.heartRate)).toEqual(values)
  })

  it('keeps a null heart-rate null (no fabricated 82 fallback)', async () => {
    getVitalsReport.mockResolvedValue(
      makeReport([makeEvent({ id: 'e1', heartRate: null, motionState: 'active' })]),
    )

    const { result } = renderHook(() =>
      useVitalsReport({ patientId: 'patient-1', intervalMs: 5000 }),
    )
    await tick()

    expect(result.current.report?.events[0]?.heartRate).toBeNull()
  })

  it('keeps the newest event first', async () => {
    const events = [
      makeEvent({ id: 'newest', timestamp: '2026-07-13T04:07:34.020Z' }),
      makeEvent({ id: 'middle', timestamp: '2026-07-13T04:05:33.993Z' }),
      makeEvent({ id: 'oldest', timestamp: '2026-07-13T04:03:07.603Z' }),
    ]
    getVitalsReport.mockResolvedValue(makeReport(events))

    const { result } = renderHook(() =>
      useVitalsReport({ patientId: 'patient-1', intervalMs: 5000 }),
    )
    await tick()

    expect(result.current.report?.events.map((e) => e.id)).toEqual([
      'newest',
      'middle',
      'oldest',
    ])
  })

  it('deduplicates events by id after repeated polling', async () => {
    getVitalsReport.mockResolvedValue(
      makeReport([
        makeEvent({ id: 'dup' }),
        makeEvent({ id: 'dup' }),
        makeEvent({ id: 'unique' }),
      ]),
    )

    const { result } = renderHook(() =>
      useVitalsReport({ patientId: 'patient-1', intervalMs: 5000 }),
    )
    await tick()
    await tick(5000)

    expect(result.current.report?.events.map((e) => e.id)).toEqual(['dup', 'unique'])
  })

  it('fetches immediately when the selected patient changes', async () => {
    getVitalsReport.mockResolvedValue(makeReport([makeEvent()]))

    const { rerender } = renderHook(
      ({ patientId }) => useVitalsReport({ patientId, intervalMs: 5000 }),
      { initialProps: { patientId: 'patient-1' } },
    )
    await tick()
    expect(getVitalsReport).toHaveBeenCalledTimes(1)

    rerender({ patientId: 'patient-2' })
    await tick()

    expect(getVitalsReport).toHaveBeenCalledTimes(2)
    expect(getVitalsReport).toHaveBeenLastCalledWith(
      'patient-2',
      undefined,
      expect.any(AbortSignal),
    )
  })

  it('ignores a stale previous-patient response and never shows it as the new patient', async () => {
    const p1 = deferred<VitalReport>()
    const p2 = deferred<VitalReport>()
    getVitalsReport
      .mockReturnValueOnce(p1.promise)
      .mockReturnValueOnce(p2.promise)

    const { result, rerender } = renderHook(
      ({ patientId }) => useVitalsReport({ patientId, intervalMs: 5000 }),
      { initialProps: { patientId: 'patient-1' } },
    )
    await tick()

    // Switch before patient-1 responds.
    rerender({ patientId: 'patient-2' })
    await tick()

    // patient-2 resolves first.
    await act(async () => {
      p2.resolve(makeReport([makeEvent({ id: 'p2-event', patientId: 'patient-2' })]))
    })
    await tick()
    expect(result.current.report?.events[0]?.id).toBe('p2-event')

    // The late patient-1 response must be ignored.
    await act(async () => {
      p1.resolve(makeReport([makeEvent({ id: 'p1-event', patientId: 'patient-1' })]))
    })
    await tick()
    expect(result.current.report?.events[0]?.id).toBe('p2-event')
  })

  it('keeps previous data when a background refresh fails', async () => {
    getVitalsReport
      .mockResolvedValueOnce(makeReport([makeEvent({ id: 'good', heartRate: 76 })]))
      .mockRejectedValueOnce(new ApiClientError(500, 'SERVER', 'boom'))

    const { result } = renderHook(() =>
      useVitalsReport({ patientId: 'patient-1', intervalMs: 5000 }),
    )
    await tick()
    expect(result.current.report?.events[0]?.id).toBe('good')

    await tick(5000)
    expect(result.current.report?.events[0]?.id).toBe('good') // data preserved
    expect(result.current.status).toBe('ready') // not fatal
    expect(result.current.error).toBe('boom') // non-blocking error surfaced
  })

  it('stops polling after unmount', async () => {
    getVitalsReport.mockResolvedValue(makeReport([makeEvent()]))

    const { unmount } = renderHook(() =>
      useVitalsReport({ patientId: 'patient-1', intervalMs: 5000 }),
    )
    await tick()
    expect(getVitalsReport).toHaveBeenCalledTimes(1)

    unmount()
    await tick(15000)
    expect(getVitalsReport).toHaveBeenCalledTimes(1)
  })

  it('refetches when the window regains focus', async () => {
    getVitalsReport.mockResolvedValue(makeReport([makeEvent()]))

    renderHook(() => useVitalsReport({ patientId: 'patient-1', intervalMs: 5000 }))
    await tick()
    expect(getVitalsReport).toHaveBeenCalledTimes(1)

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    await tick()
    expect(getVitalsReport).toHaveBeenCalledTimes(2)
  })

  it('refetches when the tab becomes visible again', async () => {
    getVitalsReport.mockResolvedValue(makeReport([makeEvent()]))

    renderHook(() => useVitalsReport({ patientId: 'patient-1', intervalMs: 5000 }))
    await tick()
    expect(getVitalsReport).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await tick()
    expect(getVitalsReport).toHaveBeenCalledTimes(2)
  })

  it('supports a manual refresh', async () => {
    getVitalsReport.mockResolvedValue(makeReport([makeEvent()]))

    const { result } = renderHook(() =>
      useVitalsReport({ patientId: 'patient-1', intervalMs: 5000 }),
    )
    await tick()
    expect(getVitalsReport).toHaveBeenCalledTimes(1)

    await act(async () => {
      result.current.refresh()
    })
    await tick()
    expect(getVitalsReport).toHaveBeenCalledTimes(2)
  })

  it('does not start an overlapping request while one is in flight', async () => {
    const first = deferred<VitalReport>()
    getVitalsReport.mockReturnValueOnce(first.promise).mockResolvedValue(makeReport([makeEvent()]))

    const { result } = renderHook(() =>
      useVitalsReport({ patientId: 'patient-1', intervalMs: 5000 }),
    )
    await tick()
    // Initial request is still pending; a manual refresh must be a no-op.
    await act(async () => {
      result.current.refresh()
    })
    await tick(5000) // a poll tick also fires while in flight
    expect(getVitalsReport).toHaveBeenCalledTimes(1)

    await act(async () => {
      first.resolve(makeReport([makeEvent()]))
    })
    await tick()
    // Now a fresh poll may proceed.
    await tick(5000)
    expect(getVitalsReport).toHaveBeenCalledTimes(2)
  })
})
