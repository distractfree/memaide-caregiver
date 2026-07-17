export interface Caregiver {
  id: string
  name: string
  email: string
  createdAt: string
}

export interface Patient {
  id: string
  caregiverId: string
  name: string
  phoneNumber: string | null
  deviceId: string | null
  createdAt: string
  updatedAt: string
}

export type PatientOverviewCardStatus = 'normal' | 'attention' | 'urgent' | 'empty'
export type PatientOverviewAttentionSeverity = 'info' | 'warning' | 'urgent'
export type PatientOverviewTimelineType = 'reminder' | 'location' | 'wellness' | 'help' | 'stream'

export interface PatientOverviewSummaryCard {
  key: 'reminders' | 'location' | 'wellness' | 'help'
  label: string
  value: string
  status: PatientOverviewCardStatus
  detail: string
}

export interface PatientOverviewAttentionItem {
  severity: PatientOverviewAttentionSeverity
  message: string
}

export interface PatientOverviewTimelineItem {
  id: string
  type: PatientOverviewTimelineType
  title: string
  detail: string
  timestamp: string
}

export interface PatientOverview {
  patientId: string
  patientName: string
  generatedAt: string
  summaryCards: PatientOverviewSummaryCard[]
  attentionItems: PatientOverviewAttentionItem[]
  timeline: PatientOverviewTimelineItem[]
}

export interface HealthStatus {
  status: string
  service: string
  timestamp: string
  environment: string
}

export interface LoginResponse {
  token: string
  caregiver: Caregiver
}

export interface RegisterInput {
  name: string
  email: string
  password: string
  confirmPassword: string
}

export interface CreatePatientInput {
  name: string
  phoneNumber?: string
  deviceId?: string
}

// Patient edits can send any fields. Blank optional fields are skipped for now.
export type UpdatePatientInput = Partial<CreatePatientInput>

export interface Reminder {
  id: string
  patientId: string
  type: string
  description: string
  timeOfDay: string
  frequency: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateReminderInput {
  type: string
  description: string
  timeOfDay: string
  frequency: string
  active?: boolean
}

// Reminder edits can send any fields, but at least one field is required.
export type UpdateReminderInput = Partial<CreateReminderInput>

export type ReminderEventStatus = 'scheduled' | 'delivered' | 'acknowledged' | 'missed'
export type ReminderEventSourceDevice = 'phone' | 'watch' | 'system'

export interface ReminderEvent {
  id: string
  reminderId: string
  patientId: string
  scheduledAt: string
  deliveredAt: string | null
  acknowledgedAt: string | null
  status: ReminderEventStatus
  sourceDevice: ReminderEventSourceDevice
  createdAt: string
  updatedAt: string
  reminder: {
    id: string
    type: string
    description: string
    timeOfDay: string
    frequency: string
  }
}

export interface ReminderReportEvent {
  id: string
  reminderId: string
  reminderDescription: string
  reminderType: string
  scheduledAt: string
  deliveredAt: string | null
  acknowledgedAt: string | null
  status: ReminderEventStatus
  sourceDevice: ReminderEventSourceDevice
  timeToAcknowledgeSeconds: number | null
}

export interface ReminderReportSummary {
  totalScheduled: number
  totalDelivered: number
  totalAcknowledged: number
  totalMissed: number
  averageTimeToAcknowledgeSeconds: number | null
  acknowledgmentRate: number
  missedRate: number
  // Keep this open so a new backend key does not break the UI.
  countsBySourceDevice: Record<string, number>
  countsByStatus: Record<string, number>
}

export interface ReminderReport {
  summary: ReminderReportSummary
  events: ReminderReportEvent[]
}

export interface ReminderEventsQuery {
  status?: ReminderEventStatus
  sourceDevice?: ReminderEventSourceDevice
  reminderId?: string
  from?: Date | string
  to?: Date | string
}

export interface ReminderReportQuery {
  from?: Date | string
  to?: Date | string
}

export type HelpEventStatus = 'triggered' | 'whatsapp_opened' | 'failed' | 'cancelled'
export type HelpEventSourceDevice = 'phone' | 'watch' | 'system'

export interface HelpContact {
  id: string
  patientId: string
  whatsappNumber: string
  label: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface SaveHelpContactInput {
  whatsappNumber: string
  label?: string
  active?: boolean
}

// Keep this type matched to what the API returns.
export interface HelpEvent {
  id: string
  patientId: string
  triggeredAt: string
  sourceDevice: HelpEventSourceDevice
  whatsappNumber: string
  status: HelpEventStatus
  createdAt: string
  updatedAt: string
  aiSessions?: { id: string; status: string }[]
}

export interface HelpEventsQuery {
  sourceDevice?: HelpEventSourceDevice
  status?: HelpEventStatus
  from?: Date | string
  to?: Date | string
}

export interface Beacon {
  id: string
  patientId: string
  roomName: string
  beaconUuid: string
  major: number | null
  minor: number | null
  thresholdDistanceM: number
  dwellSeconds: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateBeaconInput {
  roomName: string
  beaconUuid: string
  major?: number
  minor?: number
  thresholdDistanceM?: number
  dwellSeconds?: number
  active?: boolean
}

// Beacon edits can send any fields, but at least one field is required.
export type UpdateBeaconInput = Partial<CreateBeaconInput>

export interface BeaconListQuery {
  active?: boolean
}

export type BeaconEventSourceDevice = 'phone' | 'system'

export interface BeaconEvent {
  id: string
  patientId: string
  beaconId: string
  roomName: string
  detectedAt: string
  exitedAt: string | null
  dwellSeconds: number | null
  estimatedDistanceM: number | null
  sourceDevice: BeaconEventSourceDevice
  createdAt: string
  updatedAt: string
  beacon: {
    id: string
    beaconUuid: string
    roomName: string
    thresholdDistanceM: number
    dwellSeconds: number
  }
}

export interface BeaconEventsQuery {
  beaconId?: string
  roomName?: string
  sourceDevice?: BeaconEventSourceDevice
  from?: Date | string
  to?: Date | string
}

export interface BeaconReportQuery {
  beaconId?: string
  roomName?: string
  sourceDevice?: BeaconEventSourceDevice
  from?: Date | string
  to?: Date | string
}

export interface BeaconReportSummary {
  totalEvents: number
  uniqueRoomsVisited: number
  totalDwellSeconds: number
  averageDwellSeconds: number
  latestDetectedAt: string | null
  latestKnownRoom: string | null
  mostVisitedRoom: string | null
  longestDwellRoom: string | null
  approximateDistanceAverageM: number | null
}

export interface BeaconLatestContext {
  roomName: string
  beaconId: string
  detectedAt: string
  exitedAt: string | null
  dwellSeconds: number | null
  estimatedDistanceM: number | null
  sourceDevice: BeaconEventSourceDevice
  contextLabel: string
  accuracyNote: string
}

export interface BeaconReportRoom {
  roomName: string
  eventCount: number
  totalDwellSeconds: number
  averageDwellSeconds: number
  lastDetectedAt: string
}

export interface BeaconReportEvent {
  id: string
  beaconId: string
  beaconUuid: string
  roomName: string
  detectedAt: string
  exitedAt: string | null
  dwellSeconds: number | null
  estimatedDistanceM: number | null
  sourceDevice: BeaconEventSourceDevice
  contextLabel: string
  approximateContextLabel: string
}

export interface BeaconReport {
  summary: BeaconReportSummary
  latestContext: BeaconLatestContext | null
  rooms: BeaconReportRoom[]
  countsBySourceDevice: { phone: number; system: number }
  events: BeaconReportEvent[]
  notes: { distanceAccuracy: string }
}

export type VitalEventSourceDevice = 'watch' | 'phone' | 'system'
export type VitalEventMotionState = 'idle' | 'walking' | 'active' | 'unknown'

export interface VitalEvent {
  id: string
  patientId: string
  timestamp: string
  heartRate: number | null
  motionState: VitalEventMotionState | null
  stepCount: number | null
  sourceDevice: VitalEventSourceDevice
  createdAt: string
  updatedAt: string
}

export interface VitalEventsQuery {
  from?: Date | string
  to?: Date | string
  sourceDevice?: VitalEventSourceDevice
  motionState?: VitalEventMotionState
  page?: number
  limit?: number
}

export interface VitalReportQuery {
  from?: Date | string
  to?: Date | string
  sourceDevice?: VitalEventSourceDevice
  motionState?: VitalEventMotionState
}

export interface VitalReportSummary {
  totalSamples: number
  samplesWithHeartRate: number
  samplesWithMotionState: number
  samplesWithStepCount: number
  firstSampleAt: string | null
  latestSampleAt: string | null
  latestHeartRate: number | null
  latestMotionState: VitalEventMotionState | null
  latestStepCount: number | null
  totalStepsLatestValue: number | null
  averageHeartRate: number | null
  minHeartRate: number | null
  maxHeartRate: number | null
  stepCountDelta: number | null
  mostCommonMotionState: VitalEventMotionState | null
  // Keep these open so new backend keys do not break the UI.
  countsBySourceDevice: Record<string, number>
  countsByMotionState: Record<string, number>
}

export interface VitalHeartRateTrendPoint {
  timestamp: string
  heartRate: number
  sourceDevice: VitalEventSourceDevice
}

export interface VitalStepTrendPoint {
  timestamp: string
  stepCount: number
  sourceDevice: VitalEventSourceDevice
}

export interface VitalMotionTimelinePoint {
  timestamp: string
  motionState: VitalEventMotionState
  sourceDevice: VitalEventSourceDevice
}

export interface VitalDailySummary {
  date: string
  sampleCount: number
  averageHeartRate: number | null
  minHeartRate: number | null
  maxHeartRate: number | null
  latestStepCount: number | null
  mostCommonMotionState: VitalEventMotionState | null
  countsByMotionState: Record<string, number>
}

export interface VitalReport {
  summary: VitalReportSummary
  heartRateTrend: VitalHeartRateTrendPoint[]
  stepTrend: VitalStepTrendPoint[]
  motionTimeline: VitalMotionTimelinePoint[]
  dailySummaries: VitalDailySummary[]
  events: VitalEvent[]
  notes: { positioning: string; availability: string }
}

export type StreamSessionStatus =
  | 'unavailable'
  | 'starting'
  | 'active'
  | 'ended'
  | 'failed'

// Stream sessions use `source` here because that is what the API returns.
export type StreamSessionSource = 'glasses' | 'phone' | 'mock' | 'unknown'

export interface StreamSession {
  id: string
  patientId: string
  helpEventId: string | null
  startedAt: string | null
  endedAt: string | null
  source: StreamSessionSource
  status: StreamSessionStatus
  viewerUrl: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface StreamActiveSessionSummary {
  id: string
  status: StreamSessionStatus
  source: StreamSessionSource
  viewerUrl: string | null
  startedAt: string | null
  // Lightweight frame availability only. The normal status response never
  // carries image data or advisory observations.
  aiSessionId?: string | null
  frameAvailable?: boolean
  lastFrameSeq?: number | null
  lastFrameAt?: string | null
  visionLabel?: string | null
  visionDescription?: string | null
}

export interface StreamLatestSessionSummary {
  id: string
  status: StreamSessionStatus
  source: StreamSessionSource
  startedAt: string | null
  endedAt: string | null
}

export interface StreamStatusSummary {
  hasActiveStream: boolean
  displayStatus: StreamSessionStatus
  viewerAvailable: boolean
  caregiverMessage: string
  activeSession: StreamActiveSessionSummary | null
  latestSession: StreamLatestSessionSummary | null
}

export interface StreamSessionsQuery {
  status?: StreamSessionStatus
  source?: StreamSessionSource
  from?: Date | string
  to?: Date | string
}

export interface LatestStreamFrameImage {
  mime: 'image/jpeg'
  b64: string
}

// Vision remains transport-compatible only. The caregiver UI deliberately
// does not interpret or render it until that metadata is clinically validated.
export type LatestStreamFrameData =
  | {
      available: true
      streamSessionId: string
      aiSessionId: string | null
      seq: number
      capturedAt: string
      receivedAt: string
      image: LatestStreamFrameImage | null
      vision?: unknown
    }
  | {
      available: false
      streamSessionId: string
      aiSessionId: string | null
      frameStatus: string
    }

// Raw backend lifecycle status. Kept as a broad union so the UI never crashes on
// a status it did not anticipate; presentation is driven by `displayStatus`.
export type AiSessionStatus =
  | 'starting'
  | 'active'
  | 'caregiver_joined'
  | 'backup_suggested'
  | 'backup_notified'
  | 'emergency_suggested'
  | 'resolved'
  | 'cancelled'
  | 'error'
  | 'start_failed'

// Backend-authoritative normalized status for display. The frontend must not
// re-derive Active/Ended/etc. from raw status or timestamps.
export type AiSessionDisplayStatus =
  | 'Active'
  | 'Caregiver joined'
  | 'Resolved'
  | 'Ended'
  | 'Failed'
  | 'Stale'

// Registration evidence only (did Anthony ack the start). NOT a live-connection
// signal — true presence would require a heartbeat from Anthony/Arian.
export type AiSessionRegistrationStatus = 'registered' | 'failed' | 'unknown'

export type AiSessionJoinabilityReason =
  | 'live'
  | 'ended'
  | 'terminal_status'
  | 'stale'
  | 'superseded'
  | 'registration_failed'
  | 'not_live'

// Matches the canonical API message DTO (server maps senderType->role and
// message->content). `caregiver` is a distinct role from `assistant`.
export interface AiSessionMessage {
  id: string
  aiSessionId: string
  role: 'system' | 'user' | 'assistant' | 'caregiver'
  content: string
  metadata?: unknown
  createdAt: string
}

export interface AiSession {
  id: string
  patientId: string
  helpEventId: string | null
  status: AiSessionStatus
  startedAt: string
  endedAt: string | null
  caregiverJoinedAt: string | null
  emergencySuggestedAt: string | null
  summary: string | null
  createdAt: string
  updatedAt: string
  messages?: AiSessionMessage[]
  messageCount?: number
  patientName?: string
  caregiverName?: string
  // Backend-authoritative joinability. Source of truth for the Join button.
  isJoinable?: boolean
  joinabilityReason?: AiSessionJoinabilityReason
  displayStatus?: AiSessionDisplayStatus
  lastActivityAt?: string | null
  // Registration evidence (detail responses only); not a live-connection state.
  registrationStatus?: AiSessionRegistrationStatus
}

export interface AiSessionsQuery {
  status?: AiSessionStatus
  from?: Date | string
  to?: Date | string
  limit?: number
}
