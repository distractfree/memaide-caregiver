import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/services/apiClient'
import { clearToken, setToken } from '@/services/tokenStorage'

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('api.getLatestStreamFrame', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    setToken('caregiver-jwt')
  })

  afterEach(() => {
    clearToken()
    vi.unstubAllGlobals()
  })

  it('uses the authenticated latest-frame endpoint with no-store and AbortSignal', async () => {
    const controller = new AbortController()
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          available: true,
          streamSessionId: 'stream id',
          aiSessionId: 'ai-1',
          seq: 12,
          capturedAt: '2026-07-15T10:32:00.000Z',
          receivedAt: '2026-07-15T10:32:01.000Z',
          image: { mime: 'image/jpeg', b64: 'tiny-frame' },
          vision: { description: 'Never render this' },
        },
      }),
    )

    const data = await api.getLatestStreamFrame('stream id', { signal: controller.signal })

    expect(data).toMatchObject({ available: true, seq: 12 })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/stream-sessions/stream%20id/frame/latest'),
      expect.objectContaining({
        cache: 'no-store',
        signal: controller.signal,
        headers: expect.objectContaining({ Authorization: 'Bearer caregiver-jwt' }),
      }),
    )
  })

  it('maps an unavailable response without changing its transport shape', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          available: false,
          streamSessionId: 'stream-1',
          aiSessionId: 'ai-1',
          frameStatus: 'waiting',
        },
      }),
    )

    await expect(api.getLatestStreamFrame('stream-1')).resolves.toEqual({
      available: false,
      streamSessionId: 'stream-1',
      aiSessionId: 'ai-1',
      frameStatus: 'waiting',
    })
  })
})
