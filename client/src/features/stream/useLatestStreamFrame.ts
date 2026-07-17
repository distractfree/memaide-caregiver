import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiClientError } from '@/services/apiClient'
import type { LatestStreamFrameData } from '@/types/domain'

export const STREAM_FRAME_POLL_INTERVAL_MS = 2000
export const FRAME_STALE_AFTER_MS = 8000

export type FrameViewerState = 'idle' | 'waiting' | 'live' | 'stale' | 'reconnecting'

export interface RenderedLatestStreamFrame {
  streamSessionId: string
  patientId: string
  seq: number
  receivedAt: string
  imageSrc: string | null
  imageSeq: number | null
}

export interface UseLatestStreamFrameOptions {
  patientId: string | null
  streamSessionId: string | null
  enabled?: boolean
}

export interface UseLatestStreamFrameResult {
  frame: RenderedLatestStreamFrame | null
  state: FrameViewerState
  error: string | null
  isRefreshing: boolean
  refresh: () => void
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function isRecentTimestamp(value: string, now: number): boolean {
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) && now - timestamp <= FRAME_STALE_AFTER_MS
}

function toRenderedFrame(
  response: Extract<LatestStreamFrameData, { available: true }>,
  patientId: string,
  previous: RenderedLatestStreamFrame | null,
): RenderedLatestStreamFrame | null {
  if (previous && response.seq <= previous.seq) return previous

  if (response.image) {
    if (response.image.mime !== 'image/jpeg' || !response.image.b64) return null
    return {
      streamSessionId: response.streamSessionId,
      patientId,
      seq: response.seq,
      receivedAt: response.receivedAt,
      // Keep one sensitive image string in component state: the browser-only
      // data URL. The raw API base64 is not retained separately.
      imageSrc: `data:image/jpeg;base64,${response.image.b64}`,
      imageSeq: response.seq,
    }
  }

  // A newer vision-only event may have no image. Carry the same-session JPEG
  // forward while advancing the event sequence and freshness timestamp.
  return {
    streamSessionId: response.streamSessionId,
    patientId,
    seq: response.seq,
    receivedAt: response.receivedAt,
    imageSrc: previous?.imageSrc ?? null,
    imageSeq: previous?.imageSeq ?? null,
  }
}

/**
 * Polls exactly one authenticated latest-frame endpoint. It never stores a
 * frame outside React state, and a patient/session change masks old imagery
 * synchronously before the cleanup effect has a chance to run.
 */
export function useLatestStreamFrame({
  patientId,
  streamSessionId,
  enabled = true,
}: UseLatestStreamFrameOptions): UseLatestStreamFrameResult {
  const [storedFrame, setStoredFrame] = useState<RenderedLatestStreamFrame | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [clock, setClock] = useState(() => Date.now())

  const frameRef = useRef<RenderedLatestStreamFrame | null>(null)
  const requestIdRef = useRef(0)
  const inFlightRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const contextRef = useRef('')
  const contextKey = patientId && streamSessionId ? `${patientId}:${streamSessionId}` : ''

  useEffect(() => {
    contextRef.current = contextKey
  }, [contextKey])

  const load = useCallback(async () => {
    if (!patientId || !streamSessionId || !enabled || inFlightRef.current) return

    inFlightRef.current = true
    const requestId = ++requestIdRef.current
    const requestContext = `${patientId}:${streamSessionId}`
    const controller = new AbortController()
    abortRef.current = controller
    setIsRefreshing(true)

    try {
      const data = await api.getLatestStreamFrame(streamSessionId, { signal: controller.signal })
      if (requestId !== requestIdRef.current || requestContext !== contextRef.current) return

      if (!data.available) {
        // The cache has no current image for this active stream. Clear it rather
        // than presenting expired imagery as a live frame.
        frameRef.current = null
        setStoredFrame(null)
        setConnectionError(null)
        return
      }

      const next = toRenderedFrame(data, patientId, frameRef.current)
      if (!next) {
        // Wrong MIME or malformed image: retain a prior valid same-session
        // frame, but do not render the untrusted image response.
        setConnectionError('Connection interrupted. Retrying…')
        return
      }

      if (next !== frameRef.current) {
        frameRef.current = next
        setStoredFrame(next)
      }
      setConnectionError(null)
    } catch (error) {
      if (isAbortError(error) || requestId !== requestIdRef.current) return
      if (error instanceof ApiClientError && error.status === 404) {
        // An active status can briefly outlive its cache mapping; treat a 404 as
        // a waiting frame, not a fatal page error or uncontrolled retry loop.
        frameRef.current = null
        setStoredFrame(null)
        setConnectionError(null)
        return
      }
      setConnectionError('Connection interrupted. Retrying…')
    } finally {
      if (requestId === requestIdRef.current) {
        inFlightRef.current = false
        setIsRefreshing(false)
      }
    }
  }, [enabled, patientId, streamSessionId])

  // Clear sensitive state on every privacy/lifecycle boundary.
  useEffect(() => {
    requestIdRef.current += 1
    abortRef.current?.abort()
    inFlightRef.current = false
    frameRef.current = null
    setStoredFrame(null)
    setConnectionError(null)
    setIsRefreshing(false)
  }, [contextKey, enabled])

  useEffect(() => {
    if (!contextKey || !enabled) return

    void load()
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, STREAM_FRAME_POLL_INTERVAL_MS)
    // This small clock is deliberately independent of network responses so a
    // retained frame becomes stale after eight seconds even when no request
    // result changes.
    const stalenessClock = window.setInterval(() => setClock(Date.now()), 1000)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setClock(Date.now())
        void load()
      }
    }
    const handleFocus = () => void load()
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleFocus)

    return () => {
      window.clearInterval(poll)
      window.clearInterval(stalenessClock)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
      requestIdRef.current += 1
      abortRef.current?.abort()
      inFlightRef.current = false
      frameRef.current = null
    }
  }, [contextKey, enabled, load])

  // Do not expose an old image for even one render while a new patient/session
  // is becoming active.
  const frame =
    storedFrame &&
    storedFrame.patientId === patientId &&
    storedFrame.streamSessionId === streamSessionId &&
    enabled
      ? storedFrame
      : null

  const state = useMemo<FrameViewerState>(() => {
    if (!contextKey || !enabled) return 'idle'
    if (connectionError) return 'reconnecting'
    if (!frame?.imageSrc) return 'waiting'
    return isRecentTimestamp(frame.receivedAt, clock) ? 'live' : 'stale'
  }, [clock, connectionError, contextKey, enabled, frame])

  return { frame, state, error: connectionError, isRefreshing, refresh: load }
}
