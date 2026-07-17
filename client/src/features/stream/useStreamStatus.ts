import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiClientError } from '@/services/apiClient'
import type { StreamSession, StreamSessionsQuery, StreamStatusSummary } from '@/types/domain'

export const STREAM_STATUS_POLL_INTERVAL_MS = 3000

export type StreamStatusLoadState = 'idle' | 'loading' | 'ready' | 'error'

export interface UseStreamStatusOptions {
  patientId: string | null
  historyQuery?: StreamSessionsQuery
  historyEnabled?: boolean
}

export interface UseStreamStatusResult {
  summary: StreamStatusSummary | null
  sessions: StreamSession[] | null
  status: StreamStatusLoadState
  error: string | null
  isRefreshing: boolean
  refresh: () => void
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function activeSessionKey(summary: StreamStatusSummary | null): string {
  if (!summary) return ''
  return `${summary.activeSession?.id ?? ''}:${summary.activeSession?.status ?? ''}:${summary.displayStatus}`
}

/**
 * Maintains the lightweight Stream Status control plane. Status polls every
 * three seconds; history only reloads initially, for filter/manual refreshes,
 * or when the active stream identity/lifecycle changes.
 */
export function useStreamStatus({
  patientId,
  historyQuery,
  historyEnabled = true,
}: UseStreamStatusOptions): UseStreamStatusResult {
  const [summary, setSummary] = useState<StreamStatusSummary | null>(null)
  const [sessions, setSessions] = useState<StreamSession[] | null>(null)
  const [status, setStatus] = useState<StreamStatusLoadState>('idle')
  const [statusError, setStatusError] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [isStatusRefreshing, setIsStatusRefreshing] = useState(false)
  const [isHistoryRefreshing, setIsHistoryRefreshing] = useState(false)
  const [historyReloadToken, setHistoryReloadToken] = useState(0)

  const summaryRef = useRef<StreamStatusSummary | null>(null)
  const sessionsRef = useRef<StreamSession[] | null>(null)
  const statusRequestIdRef = useRef(0)
  const historyRequestIdRef = useRef(0)
  const historyVersionRef = useRef(0)
  const statusInFlightRef = useRef(false)
  const historyInFlightRef = useRef(false)
  const historyPendingRef = useRef(false)
  const historyFiltersInitializedRef = useRef(false)
  const statusAbortRef = useRef<AbortController | null>(null)
  const historyAbortRef = useRef<AbortController | null>(null)
  const historyQueryRef = useRef(historyQuery)

  useEffect(() => {
    historyQueryRef.current = historyQuery
  }, [historyQuery])

  const queueHistoryLoad = useCallback(() => {
    if (!patientId || !historyEnabled) return
    if (historyInFlightRef.current) {
      historyPendingRef.current = true
      return
    }
    setHistoryReloadToken((token) => token + 1)
  }, [historyEnabled, patientId])

  const loadStatus = useCallback(async () => {
    if (!patientId || statusInFlightRef.current) return

    statusInFlightRef.current = true
    const requestId = ++statusRequestIdRef.current
    const controller = new AbortController()
    statusAbortRef.current = controller
    setIsStatusRefreshing(true)
    if (!summaryRef.current && !sessionsRef.current) setStatus('loading')

    try {
      const data = await api.getStreamStatus(patientId, { signal: controller.signal })
      if (requestId !== statusRequestIdRef.current) return

      const shouldRefreshHistory =
        summaryRef.current !== null && activeSessionKey(summaryRef.current) !== activeSessionKey(data)
      summaryRef.current = data
      setSummary(data)
      setStatus('ready')
      setStatusError(null)
      if (shouldRefreshHistory) queueHistoryLoad()
    } catch (error) {
      if (isAbortError(error) || requestId !== statusRequestIdRef.current) return
      setStatusError(
        error instanceof ApiClientError ? error.message : 'Unable to load stream status.',
      )
      if (!summaryRef.current && !sessionsRef.current) setStatus('error')
    } finally {
      if (requestId === statusRequestIdRef.current) {
        statusInFlightRef.current = false
        setIsStatusRefreshing(false)
      }
    }
  }, [patientId, queueHistoryLoad])

  // A patient switch is a privacy boundary: abort and clear every prior value
  // before requests for the new patient are allowed to render.
  useEffect(() => {
    statusRequestIdRef.current += 1
    historyRequestIdRef.current += 1
    historyVersionRef.current += 1
    statusAbortRef.current?.abort()
    historyAbortRef.current?.abort()
    statusInFlightRef.current = false
    historyInFlightRef.current = false
    historyPendingRef.current = false
    historyFiltersInitializedRef.current = false
    summaryRef.current = null
    sessionsRef.current = null
    setSummary(null)
    setSessions(null)
    setStatusError(null)
    setHistoryError(null)
    setIsStatusRefreshing(false)
    setIsHistoryRefreshing(false)
    setStatus(patientId ? 'loading' : 'idle')
  }, [patientId])

  const historyKey = JSON.stringify(historyQuery ?? {})
  useEffect(() => {
    if (!patientId || !historyEnabled) {
      historyFiltersInitializedRef.current = false
      return
    }
    // The version prevents a late request using a previous filter from
    // replacing the current filtered history.
    historyVersionRef.current += 1
    if (!historyFiltersInitializedRef.current) {
      historyFiltersInitializedRef.current = true
      return
    }
    queueHistoryLoad()
  }, [historyEnabled, historyKey, patientId, queueHistoryLoad])

  useEffect(() => {
    if (!patientId || !historyEnabled) return
    if (historyInFlightRef.current) {
      historyPendingRef.current = true
      return
    }

    historyInFlightRef.current = true
    const requestId = ++historyRequestIdRef.current
    const historyVersion = historyVersionRef.current
    const controller = new AbortController()
    historyAbortRef.current = controller
    setIsHistoryRefreshing(true)

    const loadHistory = async () => {
      try {
        const data = await api.listStreamSessions(patientId, historyQueryRef.current, {
          signal: controller.signal,
        })
        if (
          requestId !== historyRequestIdRef.current ||
          historyVersion !== historyVersionRef.current
        ) {
          return
        }
        sessionsRef.current = data
        setSessions(data)
        setHistoryError(null)
        setStatus('ready')
      } catch (error) {
        if (isAbortError(error)) return
        if (
          requestId !== historyRequestIdRef.current ||
          historyVersion !== historyVersionRef.current
        ) {
          return
        }
        setHistoryError(
          error instanceof ApiClientError ? error.message : 'Unable to load stream history.',
        )
        if (!summaryRef.current && !sessionsRef.current) setStatus('error')
      } finally {
        if (requestId === historyRequestIdRef.current) {
          historyInFlightRef.current = false
          setIsHistoryRefreshing(false)
          if (historyPendingRef.current) {
            historyPendingRef.current = false
            setHistoryReloadToken((token) => token + 1)
          }
        }
      }
    }

    void loadHistory()
  }, [historyEnabled, historyReloadToken, patientId])

  useEffect(() => {
    if (!patientId) return

    void loadStatus()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadStatus()
    }, STREAM_STATUS_POLL_INTERVAL_MS)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void loadStatus()
    }
    const handleFocus = () => void loadStatus()
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleFocus)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
      statusRequestIdRef.current += 1
      statusAbortRef.current?.abort()
      statusInFlightRef.current = false
    }
  }, [loadStatus, patientId])

  const refresh = useCallback(() => {
    void loadStatus()
    queueHistoryLoad()
  }, [loadStatus, queueHistoryLoad])

  return {
    summary,
    sessions,
    status,
    error: statusError ?? historyError,
    isRefreshing: isStatusRefreshing || isHistoryRefreshing,
    refresh,
  }
}
