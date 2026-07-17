import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiClientError } from '@/services/apiClient'
import {
  FRAME_STALE_AFTER_MS,
  STREAM_FRAME_POLL_INTERVAL_MS,
  useLatestStreamFrame,
} from './useLatestStreamFrame'
import type { LatestStreamFrameData } from '@/types/domain'

vi.mock('@/services/apiClient', async () => {
  const actual = await vi.importActual<typeof import('@/services/apiClient')>('@/services/apiClient')
  return { ...actual, api: { ...actual.api, getLatestStreamFrame: vi.fn() } }
})

const getLatestStreamFrame = vi.mocked(api.getLatestStreamFrame)

function availableFrame(
  seq = 1,
  overrides: Partial<Extract<LatestStreamFrameData, { available: true }>> = {},
): Extract<LatestStreamFrameData, { available: true }> {
  return {
    available: true,
    streamSessionId: 'stream-1',
    aiSessionId: 'ai-1',
    seq,
    capturedAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    image: { mime: 'image/jpeg', b64: `frame-${seq}` },
    vision: {
      description: 'Do not display this',
      label: 'kitchen',
      flags: ['person_seated'],
      advisoryFlags: ['no_motion'],
    },
    ...overrides,
  }
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

async function tick(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  getLatestStreamFrame.mockReset()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-07-15T10:32:02.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useLatestStreamFrame', () => {
  it('starts immediately and polls every two seconds for an active stream', async () => {
    getLatestStreamFrame.mockResolvedValue(availableFrame())
    renderHook(() => useLatestStreamFrame({ patientId: 'patient-1', streamSessionId: 'stream-1' }))
    await tick()
    expect(getLatestStreamFrame).toHaveBeenCalledTimes(1)
    expect(getLatestStreamFrame).toHaveBeenLastCalledWith('stream-1', { signal: expect.any(AbortSignal) })

    await tick(STREAM_FRAME_POLL_INTERVAL_MS)
    expect(getLatestStreamFrame).toHaveBeenCalledTimes(2)
  })

  it('does not poll without an active stream session', async () => {
    renderHook(() => useLatestStreamFrame({ patientId: 'patient-1', streamSessionId: null }))
    await tick(5000)
    expect(getLatestStreamFrame).not.toHaveBeenCalled()
  })

  it('renders only JPEG data URLs with generic patient-perspective data', async () => {
    getLatestStreamFrame.mockResolvedValue(availableFrame(4))
    const { result } = renderHook(() =>
      useLatestStreamFrame({ patientId: 'patient-1', streamSessionId: 'stream-1' }),
    )
    await tick()

    expect(result.current.frame).toMatchObject({
      seq: 4,
      imageSrc: 'data:image/jpeg;base64,frame-4',
    })
    expect(result.current.state).toBe('live')
  })

  it('does not replace the displayed frame for a repeated sequence', async () => {
    getLatestStreamFrame
      .mockResolvedValueOnce(availableFrame(4))
      .mockResolvedValueOnce(availableFrame(4, { image: { mime: 'image/jpeg', b64: 'different' } }))
    const { result } = renderHook(() =>
      useLatestStreamFrame({ patientId: 'patient-1', streamSessionId: 'stream-1' }),
    )
    await tick()
    const firstFrame = result.current.frame

    await tick(STREAM_FRAME_POLL_INTERVAL_MS)
    expect(result.current.frame).toBe(firstFrame)
    expect(result.current.frame?.imageSrc).toBe('data:image/jpeg;base64,frame-4')
  })

  it('updates for a higher sequence and preserves a JPEG through a vision-only update', async () => {
    getLatestStreamFrame
      .mockResolvedValueOnce(availableFrame(1))
      .mockResolvedValueOnce(availableFrame(2, { image: null }))
      .mockResolvedValueOnce(availableFrame(3))
    const { result } = renderHook(() =>
      useLatestStreamFrame({ patientId: 'patient-1', streamSessionId: 'stream-1' }),
    )
    await tick()
    await tick(STREAM_FRAME_POLL_INTERVAL_MS)
    expect(result.current.frame).toMatchObject({
      seq: 2,
      imageSeq: 1,
      imageSrc: 'data:image/jpeg;base64,frame-1',
    })

    await tick(STREAM_FRAME_POLL_INTERVAL_MS)
    expect(result.current.frame?.imageSrc).toBe('data:image/jpeg;base64,frame-3')
  })

  it('shows waiting for unavailable data and never writes a frame to browser storage', async () => {
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem')
    getLatestStreamFrame.mockResolvedValue({
      available: false,
      streamSessionId: 'stream-1',
      aiSessionId: 'ai-1',
      frameStatus: 'waiting',
    })
    const { result } = renderHook(() =>
      useLatestStreamFrame({ patientId: 'patient-1', streamSessionId: 'stream-1' }),
    )
    await tick()

    expect(result.current.frame).toBeNull()
    expect(result.current.state).toBe('waiting')
    expect(storageSpy).not.toHaveBeenCalled()
    storageSpy.mockRestore()
  })

  it('marks an old frame stale but keeps it visible until a newer frame arrives', async () => {
    getLatestStreamFrame.mockResolvedValue(
      availableFrame(1, { receivedAt: new Date(Date.now() - FRAME_STALE_AFTER_MS - 1).toISOString() }),
    )
    const { result } = renderHook(() =>
      useLatestStreamFrame({ patientId: 'patient-1', streamSessionId: 'stream-1' }),
    )
    await tick()
    expect(result.current.state).toBe('stale')
    expect(result.current.frame?.imageSrc).toBe('data:image/jpeg;base64,frame-1')

    getLatestStreamFrame.mockResolvedValueOnce(availableFrame(2))
    await tick(STREAM_FRAME_POLL_INTERVAL_MS)
    expect(result.current.state).toBe('live')
  })

  it('keeps the prior image and shows reconnecting after a temporary request error', async () => {
    getLatestStreamFrame
      .mockResolvedValueOnce(availableFrame())
      .mockRejectedValueOnce(new ApiClientError(500, 'SERVER', 'backend failed'))
    const { result } = renderHook(() =>
      useLatestStreamFrame({ patientId: 'patient-1', streamSessionId: 'stream-1' }),
    )
    await tick()
    await tick(STREAM_FRAME_POLL_INTERVAL_MS)
    expect(result.current.state).toBe('reconnecting')
    expect(result.current.frame?.imageSrc).toBe('data:image/jpeg;base64,frame-1')
  })

  it('aborts and clears an old session immediately when a new session becomes active', async () => {
    const old = deferred<LatestStreamFrameData>()
    getLatestStreamFrame.mockReturnValueOnce(old.promise).mockResolvedValueOnce(availableFrame(1, {
      streamSessionId: 'stream-2',
    }))
    const { result, rerender } = renderHook(
      ({ streamSessionId }) => useLatestStreamFrame({ patientId: 'patient-1', streamSessionId }),
      { initialProps: { streamSessionId: 'stream-1' } },
    )
    await tick()
    const oldSignal = getLatestStreamFrame.mock.calls[0]?.[1]?.signal

    rerender({ streamSessionId: 'stream-2' })
    expect(result.current.frame).toBeNull()
    expect(oldSignal?.aborted).toBe(true)
    await tick()

    await act(async () => old.resolve(availableFrame(99)))
    await tick()
    expect(result.current.frame?.streamSessionId).toBe('stream-2')
    expect(result.current.frame?.seq).toBe(1)
  })

  it('clears imagery and stops frame polling when status no longer supplies an active session', async () => {
    getLatestStreamFrame.mockResolvedValue(availableFrame())
    const { result, rerender } = renderHook(
      ({ streamSessionId }) => useLatestStreamFrame({ patientId: 'patient-1', streamSessionId }),
      { initialProps: { streamSessionId: 'stream-1' as string | null } },
    )
    await tick()
    expect(result.current.frame?.imageSrc).toBe('data:image/jpeg;base64,frame-1')

    rerender({ streamSessionId: null })
    expect(result.current.frame).toBeNull()
    expect(result.current.state).toBe('idle')
    await tick(STREAM_FRAME_POLL_INTERVAL_MS * 2)
    expect(getLatestStreamFrame).toHaveBeenCalledTimes(1)
  })

  it('stops polling and clears the sensitive frame on unmount', async () => {
    getLatestStreamFrame.mockResolvedValue(availableFrame())
    const { result, unmount } = renderHook(() =>
      useLatestStreamFrame({ patientId: 'patient-1', streamSessionId: 'stream-1' }),
    )
    await tick()
    expect(result.current.frame).not.toBeNull()

    unmount()
    await tick(6000)
    expect(getLatestStreamFrame).toHaveBeenCalledTimes(1)
  })
})
