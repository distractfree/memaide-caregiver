import type { ApiErrorBody, ApiSuccess, Pagination } from '@/types/api'
import type {
  AiSession,
  AiSessionsQuery,
  Beacon,
  BeaconEvent,
  BeaconEventsQuery,
  BeaconListQuery,
  BeaconReport,
  BeaconReportQuery,
  Caregiver,
  CreateBeaconInput,
  CreatePatientInput,
  CreateReminderInput,
  HealthStatus,
  HelpContact,
  HelpEvent,
  HelpEventsQuery,
  LoginResponse,
  Patient,
  PatientOverview,
  RegisterInput,
  Reminder,
  ReminderEvent,
  ReminderEventsQuery,
  ReminderReport,
  ReminderReportQuery,
  SaveHelpContactInput,
  StreamSession,
  StreamSessionsQuery,
  StreamStatusSummary,
  UpdateBeaconInput,
  UpdatePatientInput,
  UpdateReminderInput,
  VitalEvent,
  VitalEventsQuery,
  VitalReport,
  VitalReportQuery,
} from '@/types/domain'
import { getToken } from '@/services/tokenStorage'
import { buildApiUrl } from '@/services/apiBaseUrl'

export class ApiClientError extends Error {
  status: number
  code: string
  details?: Record<string, unknown>

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
    this.details = details
  }
}

let unauthorizedHandler: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  auth?: boolean
  raw?: boolean
  query?: Record<string, string | number | boolean | undefined>
  // Opt out of the browser HTTP cache for endpoints that must always be fresh.
  cache?: RequestCache
  // Allow a caller to cancel an in-flight request (e.g. when the patient changes).
  signal?: AbortSignal
}

interface EnvelopeResult<T> {
  data: T
  pagination?: Pagination
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  return buildApiUrl(path, query)
}

async function rawRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, query, cache, signal } = options

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  if (auth) {
    const token = getToken()
    if (!token) {
      throw new ApiClientError(401, 'NO_TOKEN', 'You are not signed in.')
    }
    headers['Authorization'] = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...(cache ? { cache } : {}),
      ...(signal ? { signal } : {}),
    })
  } catch (err) {
    // Re-throw aborts unchanged so callers can distinguish a cancel from a real failure.
    if (err instanceof DOMException && err.name === 'AbortError') throw err
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
    if (response.status === 401 && auth && unauthorizedHandler) {
      unauthorizedHandler()
    }
    const errBody = (parsed ?? {}) as Partial<ApiErrorBody>
    throw new ApiClientError(
      response.status,
      errBody.code ?? `HTTP_${response.status}`,
      errBody.message ?? response.statusText ?? 'Request failed',
      errBody.details,
    )
  }

  return parsed as T
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const result = await rawRequest<ApiSuccess<T>>(path, options)
  if (!result || result.success !== true) {
    throw new ApiClientError(500, 'BAD_ENVELOPE', 'Unexpected server response shape.')
  }
  return result.data
}

async function requestEnvelope<T>(path: string, options: RequestOptions = {}): Promise<EnvelopeResult<T>> {
  const result = await rawRequest<ApiSuccess<T>>(path, options)
  if (!result || result.success !== true) {
    throw new ApiClientError(500, 'BAD_ENVELOPE', 'Unexpected server response shape.')
  }
  return { data: result.data, pagination: result.pagination }
}

function toIsoDate(value: Date | string | undefined): string | undefined {
  if (value === undefined) return undefined
  if (value instanceof Date) return value.toISOString()
  return value
}

export const api = {
  health: (): Promise<HealthStatus> =>
    rawRequest<HealthStatus>('/api/health', { auth: false, raw: true }),

  login: (email: string, password: string): Promise<LoginResponse> =>
    request<LoginResponse>('/api/auth/login', { method: 'POST', auth: false, body: { email, password } }),

  register: (input: RegisterInput): Promise<LoginResponse> =>
    request<LoginResponse>('/api/auth/register', { method: 'POST', auth: false, body: input }),

  me: (): Promise<Caregiver> =>
    request<{ caregiver: Caregiver }>('/api/auth/me').then((d) => d.caregiver),

  listPatients: (query?: { search?: string; page?: number; limit?: number }): Promise<EnvelopeResult<Patient[]>> =>
    requestEnvelope<Patient[]>('/api/patients', { query }),

  getPatient: (id: string): Promise<Patient> =>
    request<Patient>(`/api/patients/${encodeURIComponent(id)}`),

  getPatientOverview: (id: string): Promise<PatientOverview> =>
    request<PatientOverview>(`/api/patients/${encodeURIComponent(id)}/overview`),

  createPatient: (input: CreatePatientInput): Promise<Patient> =>
    request<Patient>('/api/patients', { method: 'POST', body: input }),

  updatePatient: (id: string, input: UpdatePatientInput): Promise<Patient> =>
    request<Patient>(`/api/patients/${encodeURIComponent(id)}`, { method: 'PUT', body: input }),

  deletePatient: (id: string): Promise<null> =>
    request<null>(`/api/patients/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  listReminders: (
    patientId: string,
    query?: { active?: boolean; type?: string },
  ): Promise<Reminder[]> =>
    request<Reminder[]>(
      `/api/patients/${encodeURIComponent(patientId)}/reminders`,
      { query },
    ),

  createReminder: (patientId: string, input: CreateReminderInput): Promise<Reminder> =>
    request<Reminder>(
      `/api/patients/${encodeURIComponent(patientId)}/reminders`,
      { method: 'POST', body: input },
    ),

  updateReminder: (id: string, input: UpdateReminderInput): Promise<Reminder> =>
    request<Reminder>(`/api/reminders/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: input,
    }),

  deleteReminder: (id: string): Promise<null> =>
    request<null>(`/api/reminders/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  listReminderEvents: (
    patientId: string,
    query?: ReminderEventsQuery,
  ): Promise<ReminderEvent[]> =>
    request<ReminderEvent[]>(
      `/api/patients/${encodeURIComponent(patientId)}/reminder-events`,
      {
        query: {
          status: query?.status,
          sourceDevice: query?.sourceDevice,
          reminderId: query?.reminderId,
          from: toIsoDate(query?.from),
          to: toIsoDate(query?.to),
        },
      },
    ),

  getReminderReport: (
    patientId: string,
    query?: ReminderReportQuery,
  ): Promise<ReminderReport> =>
    request<ReminderReport>(
      `/api/patients/${encodeURIComponent(patientId)}/reports/reminders`,
      {
        query: {
          from: toIsoDate(query?.from),
          to: toIsoDate(query?.to),
        },
      },
    ),

  // A missing help contact comes back as null. Only an unknown patient is a 404.
  getHelpContact: (patientId: string): Promise<HelpContact | null> =>
    request<HelpContact | null>(
      `/api/patients/${encodeURIComponent(patientId)}/help-contact`,
    ),

  // This endpoint creates or updates the contact. The backend checks the phone format.
  saveHelpContact: (
    patientId: string,
    input: SaveHelpContactInput,
  ): Promise<HelpContact> =>
    request<HelpContact>(
      `/api/patients/${encodeURIComponent(patientId)}/help-contact`,
      { method: 'POST', body: input },
    ),

  listHelpEvents: (
    patientId: string,
    query?: HelpEventsQuery,
  ): Promise<HelpEvent[]> =>
    request<HelpEvent[]>(
      `/api/patients/${encodeURIComponent(patientId)}/help-events`,
      {
        query: {
          sourceDevice: query?.sourceDevice,
          status: query?.status,
          from: toIsoDate(query?.from),
          to: toIsoDate(query?.to),
        },
      },
    ),

  listBeacons: (patientId: string, query?: BeaconListQuery): Promise<Beacon[]> =>
    request<Beacon[]>(
      `/api/patients/${encodeURIComponent(patientId)}/beacons`,
      { query: { active: query?.active } },
    ),

  createBeacon: (patientId: string, input: CreateBeaconInput): Promise<Beacon> =>
    request<Beacon>(
      `/api/patients/${encodeURIComponent(patientId)}/beacons`,
      { method: 'POST', body: input },
    ),

  updateBeacon: (id: string, input: UpdateBeaconInput): Promise<Beacon> =>
    request<Beacon>(`/api/beacons/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: input,
    }),

  deleteBeacon: (id: string): Promise<null> =>
    request<null>(`/api/beacons/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Raw beacon events. Reports use getBeaconReport for the grouped data.
  listBeaconEvents: (
    patientId: string,
    query?: BeaconEventsQuery,
  ): Promise<BeaconEvent[]> =>
    request<BeaconEvent[]>(
      `/api/patients/${encodeURIComponent(patientId)}/beacon-events`,
      {
        query: {
          beaconId: query?.beaconId,
          roomName: query?.roomName,
          sourceDevice: query?.sourceDevice,
          from: toIsoDate(query?.from),
          to: toIsoDate(query?.to),
        },
      },
    ),

  getBeaconReport: (
    patientId: string,
    query?: BeaconReportQuery,
  ): Promise<BeaconReport> =>
    request<BeaconReport>(
      `/api/patients/${encodeURIComponent(patientId)}/reports/beacons`,
      {
        query: {
          beaconId: query?.beaconId,
          roomName: query?.roomName,
          sourceDevice: query?.sourceDevice,
          from: toIsoDate(query?.from),
          to: toIsoDate(query?.to),
        },
      },
    ),

  // Raw wellness samples. Reports use getVitalsReport for the grouped data.
  listVitalEvents: (
    patientId: string,
    query?: VitalEventsQuery,
  ): Promise<VitalEvent[]> =>
    request<VitalEvent[]>(
      `/api/patients/${encodeURIComponent(patientId)}/vitals`,
      {
        query: {
          sourceDevice: query?.sourceDevice,
          motionState: query?.motionState,
          from: toIsoDate(query?.from),
          to: toIsoDate(query?.to),
          page: query?.page,
          limit: query?.limit,
        },
      },
    ),

  // Wellness Trends polls this often, so bypass the HTTP cache to always get
  // fresh rows, and accept a signal so a superseded patient request is aborted.
  getVitalsReport: (
    patientId: string,
    query?: VitalReportQuery,
    signal?: AbortSignal,
  ): Promise<VitalReport> =>
    request<VitalReport>(
      `/api/patients/${encodeURIComponent(patientId)}/reports/vitals`,
      {
        query: {
          sourceDevice: query?.sourceDevice,
          motionState: query?.motionState,
          from: toIsoDate(query?.from),
          to: toIsoDate(query?.to),
        },
        cache: 'no-store',
        signal,
      },
    ),

  // Stream status for this patient. The backend uses the signed-in caregiver.
  getStreamStatus: (patientId: string): Promise<StreamStatusSummary> =>
    request<StreamStatusSummary>(
      `/api/patients/${encodeURIComponent(patientId)}/stream-status`,
    ),

  // Stream session history. The backend returns newest sessions first.
  listStreamSessions: (
    patientId: string,
    query?: StreamSessionsQuery,
  ): Promise<StreamSession[]> =>
    request<StreamSession[]>(
      `/api/patients/${encodeURIComponent(patientId)}/stream-sessions`,
      {
        query: {
          status: query?.status,
          source: query?.source,
          from: toIsoDate(query?.from),
          to: toIsoDate(query?.to),
        },
      },
    ),

  listAiSessions: (
    patientId: string,
    query?: AiSessionsQuery,
  ): Promise<AiSession[]> =>
    request<AiSession[]>(
      `/api/patients/${encodeURIComponent(patientId)}/ai-sessions`,
      {
        query: {
          status: query?.status,
          from: toIsoDate(query?.from),
          to: toIsoDate(query?.to),
        },
      },
    ),

  getAiSessionById: (id: string): Promise<AiSession> =>
    request<AiSession>(`/api/ai-sessions/${encodeURIComponent(id)}`),

  caregiverJoinAiSession: (id: string): Promise<AiSession> =>
    request<AiSession>(`/api/ai-sessions/${encodeURIComponent(id)}/caregiver-joined`, {
      method: 'POST',
    }),

  resolveAiSession: (id: string, summary: string): Promise<AiSession> =>
    request<AiSession>(`/api/ai-sessions/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      body: { summary },
    }),
}
