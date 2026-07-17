import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiClientError } from '@/services/apiClient'
import type { AiSession } from '@/types/domain'
import { isTerminalAiSession } from '@/features/ai-sessions/aiSessionUi'

// Bounded automatic refresh cadence for an open session panel. This is polling,
// not real-time delivery: it surfaces status changes and the concluded
// transcript soon after Anthony's conclude callback, nothing more.
export const AI_SESSION_DETAIL_POLL_INTERVAL_MS = 5000

export type AiSessionDetailStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface UseAiSessionDetailOptions {
  sessionId: string | null
  // Scopes every response to the current patient so a late response for a
  // previous patient can never render after a patient switch.
  patientId?: string | null
  // Whether to fetch at all (e.g. the panel is open, or a linked session exists).
  enabled?: boolean
  // Whether to run the bounded 5s refresh loop. Kept separate from `enabled` so
  // the Stream page can fetch a single snapshot for the header label without
  // polling until the panel is actually open.
  poll?: boolean
  pollIntervalMs?: number
}

export interface UseAiSessionDetailResult {
  session: AiSession | null
  status: AiSessionDetailStatus
  error: string | null
  isRefreshing: boolean
  lastUpdatedAt: number | null
  joining: boolean
  resolving: boolean
  actionError: string | null
  refresh: () => void
  join: () => Promise<void>
  resolve: (summary: string) => Promise<boolean>
  clearActionError: () => void
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function useAiSessionDetail({
  sessionId,
  patientId = null,
  enabled = true,
  poll = true,
  pollIntervalMs = AI_SESSION_DETAIL_POLL_INTERVAL_MS,
}: UseAiSessionDetailOptions): UseAiSessionDetailResult {
  const [session, setSession] = useState<AiSession | null>(null)
  const [status, setStatus] = useState<AiSessionDetailStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const [joining, setJoining] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const sessionRef = useRef<AiSession | null>(null)
  const requestIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const contextRef = useRef('')
  const contextKey = enabled && sessionId ? `${patientId ?? ''}:${sessionId}` : ''

  useEffect(() => {
    contextRef.current = contextKey
  }, [contextKey])

  const load = useCallback(async () => {
    if (!sessionId || !enabled) return

    const requestId = ++requestIdRef.current
    const requestContext = `${patientId ?? ''}:${sessionId}`
    // Supersede any in-flight request so join/resolve always refetch the newest
    // authoritative state and a slow poll can never overwrite a newer response.
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setIsRefreshing(true)
    if (!sessionRef.current) setStatus('loading')

    try {
      const data = await api.getAiSessionById(sessionId, { signal: controller.signal })
      if (requestId !== requestIdRef.current || requestContext !== contextRef.current) return
      sessionRef.current = data
      setSession(data)
      setStatus('ready')
      setError(null)
      setLastUpdatedAt(Date.now())
    } catch (err) {
      if (isAbortError(err) || requestId !== requestIdRef.current || requestContext !== contextRef.current) {
        return
      }
      setError(
        err instanceof ApiClientError ? err.message : 'Unable to load session details.',
      )
      // Preserve the last successful data during a transient refresh failure;
      // only show the fatal error state when we have nothing to display.
      if (!sessionRef.current) setStatus('error')
    } finally {
      if (requestId === requestIdRef.current) setIsRefreshing(false)
    }
  }, [enabled, patientId, sessionId])

  // Every context boundary (session change, patient change, disable) clears the
  // previous session's data synchronously before any new response can render.
  useEffect(() => {
    requestIdRef.current += 1
    abortRef.current?.abort()
    sessionRef.current = null
    setSession(null)
    setError(null)
    setActionError(null)
    setIsRefreshing(false)
    setLastUpdatedAt(null)
    setStatus(enabled && sessionId ? 'loading' : 'idle')
  }, [contextKey, enabled, sessionId])

  useEffect(() => {
    if (!sessionId || !enabled) return

    void load()
    if (!poll) return

    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      // Stop refreshing a terminal session — its data can no longer change.
      if (sessionRef.current && isTerminalAiSession(sessionRef.current)) return
      void load()
    }, pollIntervalMs)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const handleFocus = () => void load()
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleFocus)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
      requestIdRef.current += 1
      abortRef.current?.abort()
    }
  }, [enabled, load, poll, pollIntervalMs, sessionId])

  const refresh = useCallback(() => {
    void load()
  }, [load])

  const join = useCallback(async () => {
    if (!sessionId || joining) return
    setActionError(null)
    setJoining(true)
    try {
      await api.caregiverJoinAiSession(sessionId)
      await load()
    } catch (err) {
      // A 409 means the authoritative state moved underneath us (already joined,
      // stale, or no longer joinable). Refresh rather than surfacing a raw error.
      if (err instanceof ApiClientError && err.status === 409) {
        await load()
        return
      }
      setActionError(err instanceof ApiClientError ? err.message : 'Failed to join session.')
    } finally {
      setJoining(false)
    }
  }, [joining, load, sessionId])

  const resolve = useCallback(
    async (summary: string): Promise<boolean> => {
      if (!sessionId || resolving) return false
      setActionError(null)
      setResolving(true)
      try {
        await api.resolveAiSession(sessionId, summary)
        await load()
        return true
      } catch (err) {
        setActionError(
          err instanceof ApiClientError ? err.message : 'Failed to resolve session.',
        )
        return false
      } finally {
        setResolving(false)
      }
    },
    [load, resolving, sessionId],
  )

  const clearActionError = useCallback(() => setActionError(null), [])

  return {
    session,
    status,
    error,
    isRefreshing,
    lastUpdatedAt,
    joining,
    resolving,
    actionError,
    refresh,
    join,
    resolve,
    clearActionError,
  }
}
