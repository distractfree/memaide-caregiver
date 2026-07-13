import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiClientError } from '@/services/apiClient'
import type { VitalEvent, VitalReport, VitalReportQuery } from '@/types/domain'

// Five-second polling is intentional: it keeps Wellness Trends near-real-time
// without a push channel (no WebSocket/SSE exists for vitals).
export const VITALS_POLL_INTERVAL_MS = 5000

export type VitalsReportStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface UseVitalsReportOptions {
  patientId: string | null
  query?: VitalReportQuery
  enabled?: boolean
  intervalMs?: number
}

export interface UseVitalsReportResult {
  report: VitalReport | null
  status: VitalsReportStatus
  error: string | null
  isRefreshing: boolean
  lastUpdatedAt: Date | null
  refresh: () => void
}

// The backend already returns rows newest-first. We only guard against
// accidental duplicate ids (e.g. an overlapping write) so a poll can never
// render two rows for the same event — order is preserved as received.
function dedupeEventsById(events: VitalEvent[]): VitalEvent[] {
  const seen = new Set<string>()
  const result: VitalEvent[] = []
  for (const event of events) {
    if (seen.has(event.id)) continue
    seen.add(event.id)
    result.push(event)
  }
  return result
}

function normalizeReport(report: VitalReport): VitalReport {
  return { ...report, events: dedupeEventsById(report.events) }
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

/**
 * Loads a patient's vitals report and keeps it fresh with polling.
 *
 * Behaviour:
 *  - fetches immediately when a patient is selected
 *  - polls every `intervalMs` (default 5s)
 *  - refetches when the browser tab becomes visible or the window regains focus
 *  - stops polling and aborts in-flight work on unmount
 *  - never runs two requests at once (overlap guard)
 *  - keeps the last successful data visible during background refreshes and errors
 *  - on patient change, cancels the previous request and clears stale data so the
 *    previous patient's rows are never shown as the new patient's
 */
export function useVitalsReport({
  patientId,
  query,
  enabled = true,
  intervalMs = VITALS_POLL_INTERVAL_MS,
}: UseVitalsReportOptions): UseVitalsReportResult {
  const [report, setReport] = useState<VitalReport | null>(null)
  const [status, setStatus] = useState<VitalsReportStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)

  // requestId invalidates responses that arrive after a newer request started.
  const requestIdRef = useRef(0)
  // inFlight prevents overlapping poll/refresh requests.
  const inFlightRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  // Tracks whether we already have data, so polls don't flip back to a skeleton.
  const hasDataRef = useRef(false)
  // Keep the latest query in a ref so the polling effect isn't torn down on
  // every filter keystroke.
  const queryRef = useRef(query)
  useEffect(() => {
    queryRef.current = query
  })

  const load = useCallback(async () => {
    if (!patientId || !enabled) return
    if (inFlightRef.current) return // overlap guard

    inFlightRef.current = true
    const requestId = ++requestIdRef.current
    const controller = new AbortController()
    abortRef.current = controller

    setIsRefreshing(true)
    // Only show the full skeleton before the very first successful load.
    if (!hasDataRef.current) setStatus('loading')

    try {
      const data = await api.getVitalsReport(patientId, queryRef.current, controller.signal)
      if (requestId !== requestIdRef.current) return // superseded
      setReport(normalizeReport(data))
      hasDataRef.current = true
      setStatus('ready')
      setError(null)
      setLastUpdatedAt(new Date())
    } catch (err) {
      if (isAbortError(err)) return
      if (requestId !== requestIdRef.current) return
      const message =
        err instanceof ApiClientError ? err.message : 'Unable to load wellness report.'
      setError(message)
      // Keep the last good data visible; only go fatal when we have nothing.
      setStatus(hasDataRef.current ? 'ready' : 'error')
    } finally {
      // Only the current request clears the shared flags; a superseded request
      // must not reset state the newer request now owns.
      if (requestId === requestIdRef.current) {
        inFlightRef.current = false
        setIsRefreshing(false)
      }
    }
  }, [patientId, enabled])

  // Hard reset only when the patient changes (or is cleared): drop stale data
  // so the previous patient's vitals are never shown under the new patient.
  // Note: this deliberately does NOT depend on `enabled`, so a transient
  // invalid filter range pauses polling without wiping the visible data.
  useEffect(() => {
    requestIdRef.current++
    abortRef.current?.abort()
    inFlightRef.current = false
    hasDataRef.current = false
    setReport(null)
    setError(null)
    setLastUpdatedAt(null)
    setIsRefreshing(false)
    setStatus(patientId ? 'loading' : 'idle')
  }, [patientId])

  // Fetch immediately, then poll and refresh on focus / tab visibility.
  // Tearing this down and rebuilding it is cheap and keeps a single interval.
  useEffect(() => {
    if (!patientId || !enabled) return

    void load()

    const interval = window.setInterval(() => {
      void load()
    }, intervalMs)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const handleFocus = () => {
      void load()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleFocus)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
      // Stop caring about any response still in flight. These refs hold
      // request bookkeeping (a counter and an AbortController), not DOM nodes,
      // so reading the live value in cleanup is intentional.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      requestIdRef.current++
      abortRef.current?.abort()
      inFlightRef.current = false
    }
  }, [patientId, enabled, intervalMs, load])

  // Refetch when filters change, without tearing down polling or clearing data.
  const queryKey = JSON.stringify(query ?? {})
  const skipNextQueryEffect = useRef(true)
  useEffect(() => {
    if (skipNextQueryEffect.current) {
      // The lifecycle effect already fetched for the initial query.
      skipNextQueryEffect.current = false
      return
    }
    if (!patientId || !enabled) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey])

  return { report, status, error, isRefreshing, lastUpdatedAt, refresh: load }
}
