import { getAdminToken } from './adminTokenStorage'
import type { AdminLoginResponse, AdminCaregiver, AdminCaregiverDetail, AdminUser } from './types'
import type { AiSession, AiSessionsQuery } from '@/types/domain'
import { ApiClientError } from '@/services/apiClient' // Reuse error class

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '')

let adminUnauthorizedHandler: (() => void) | null = null

export function setAdminUnauthorizedHandler(handler: (() => void) | null): void {
  adminUnauthorizedHandler = handler
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  auth?: boolean
}

async function rawAdminRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  if (auth) {
    const token = getAdminToken()
    if (!token) {
      throw new ApiClientError(401, 'NO_TOKEN', 'You are not signed in as an admin.')
    }
    headers['Authorization'] = `Bearer ${token}`
  }

  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiClientError(0, 'NETWORK', 'Unable to connect to MemAide. Please check your connection and try again.')
  }

  let parsed: unknown = null
  const text = await response.text()
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = null
    }
  }

  if (!response.ok) {
    if (response.status === 401 && auth && adminUnauthorizedHandler) {
      adminUnauthorizedHandler()
    }
    const errBody = (parsed ?? {}) as any
    throw new ApiClientError(
      response.status,
      errBody.code ?? `HTTP_${response.status}`,
      errBody.message ?? response.statusText ?? 'Request failed',
      errBody.details,
    )
  }

  return parsed as T
}

export const adminApi = {
  login: (password: string): Promise<AdminLoginResponse> =>
    rawAdminRequest<AdminLoginResponse>('/api/admin/login', { method: 'POST', auth: false, body: { password } }),

  me: (): Promise<AdminUser> =>
    rawAdminRequest<{ admin: AdminUser }>('/api/admin/me').then((d) => d.admin),

  getCaregivers: (): Promise<AdminCaregiver[]> =>
    rawAdminRequest<{ caregivers: AdminCaregiver[] }>('/api/admin/caregivers').then((d) => d.caregivers),

  getCaregiver: (id: string): Promise<AdminCaregiverDetail> =>
    rawAdminRequest<{ caregiver: AdminCaregiverDetail }>(`/api/admin/caregivers/${id}`).then((d) => d.caregiver),

  getAiSessions: (query?: AiSessionsQuery): Promise<AiSession[]> => {
    const searchParams = new URLSearchParams()
    if (query?.status) searchParams.set('status', query.status)
    if (query?.from) searchParams.set('from', query.from instanceof Date ? query.from.toISOString() : query.from)
    if (query?.to) searchParams.set('to', query.to instanceof Date ? query.to.toISOString() : query.to)
    
    const qs = searchParams.toString()
    const url = `/api/admin/ai-sessions${qs ? `?${qs}` : ''}`
    return rawAdminRequest<{ success: boolean; data: AiSession[] }>(url).then((d) => d.data)
  },

  getAiSessionById: (id: string): Promise<AiSession> =>
    rawAdminRequest<{ success: boolean; data: AiSession }>(`/api/admin/ai-sessions/${id}`).then((d) => d.data),
}
