import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  HeartPulse,
  LifeBuoy,
  MapPin,
  Phone,
  Radio,
  RefreshCw,
  Smartphone,
  Video,
  type LucideIcon,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { api, ApiClientError } from '@/services/apiClient'
import { useAuth } from '@/features/auth/AuthContext'
import { usePatients } from '@/features/patients/PatientContext'
import type {
  PatientOverview,
  PatientOverviewAttentionSeverity,
  PatientOverviewCardStatus,
  PatientOverviewTimelineType,
} from '@/types/domain'
import { formatDate, formatDateTime, formatPhone, initialsFromName } from '@/utils/formatting'
import { cn } from '@/utils/cn'

type OverviewStatus = 'idle' | 'loading' | 'ready' | 'error'

const cardIcons: Record<PatientOverview['summaryCards'][number]['key'], LucideIcon> = {
  reminders: Bell,
  location: MapPin,
  wellness: HeartPulse,
  help: LifeBuoy,
}

const timelineIcons: Record<PatientOverviewTimelineType, LucideIcon> = {
  reminder: Bell,
  location: Radio,
  wellness: Activity,
  help: LifeBuoy,
  stream: Video,
}

const statusStyles: Record<PatientOverviewCardStatus, { icon: string; badge: string; label: string }> = {
  normal: {
    icon: 'bg-green-50 text-green-700',
    badge: 'border-green-200 bg-green-100 text-green-800',
    label: 'Normal',
  },
  attention: {
    icon: 'bg-amber-50 text-amber-700',
    badge: 'border-amber-200 bg-amber-100 text-amber-800',
    label: 'Needs attention',
  },
  urgent: {
    icon: 'bg-red-50 text-red-700',
    badge: 'border-red-200 bg-red-100 text-red-800',
    label: 'Urgent',
  },
  empty: {
    icon: 'bg-surface-container-high text-on-surface-variant',
    badge: 'border-outline-variant/40 bg-surface-container-high text-text-muted',
    label: 'No update',
  },
}

function statusBadge(status: PatientOverviewCardStatus) {
  const style = statusStyles[status]
  return (
    <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider', style.badge)}>
      {style.label}
    </span>
  )
}

function attentionIconClass(severity: PatientOverviewAttentionSeverity): string {
  if (severity === 'urgent') return 'bg-red-50 text-red-700'
  if (severity === 'warning') return 'bg-amber-50 text-amber-700'
  return 'bg-surface-container-high text-on-surface-variant'
}

export function DashboardOverviewPage() {
  const { caregiver, logout } = useAuth()
  const { selectedPatient, patients, status: patientStatus, refresh: refreshPatients } = usePatients()
  const [overview, setOverview] = useState<PatientOverview | null>(null)
  const [overviewStatus, setOverviewStatus] = useState<OverviewStatus>('idle')
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const overviewRequestId = useRef(0)
  const selectedPatientId = selectedPatient?.id ?? null

  const loadOverview = useCallback(async (patientId: string, clearExisting = false) => {
    const requestId = overviewRequestId.current + 1
    overviewRequestId.current = requestId
    if (clearExisting) setOverview(null)
    setOverviewStatus('loading')
    setOverviewError(null)
    try {
      const data = await api.getPatientOverview(patientId)
      if (overviewRequestId.current !== requestId) return
      setOverview(data)
      setOverviewStatus('ready')
    } catch (err) {
      if (overviewRequestId.current !== requestId) return
      setOverview(null)
      setOverviewStatus('error')
      setOverviewError(err instanceof ApiClientError ? err.message : 'Unable to load patient care snapshot.')
    }
  }, [])

  useEffect(() => {
    if (!selectedPatientId) {
      overviewRequestId.current += 1
      setOverview(null)
      setOverviewStatus('idle')
      setOverviewError(null)
      return
    }
    void loadOverview(selectedPatientId, true)
  }, [loadOverview, selectedPatientId])

  const refreshPatientList = useCallback(async () => {
    await refreshPatients()
  }, [refreshPatients])

  const refreshSnapshot = useCallback(() => {
    if (!selectedPatientId) return
    void loadOverview(selectedPatientId, false)
  }, [loadOverview, selectedPatientId])

  const lastUpdated = overview?.generatedAt ? formatDateTime(overview.generatedAt) : 'Not updated yet'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Badge tone="muted">Overview</Badge>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-on-surface">
              Welcome back, {caregiver?.name?.split(' ')[0] ?? 'there'}.
            </h1>
            <p className="mt-1 text-sm text-on-surface-variant">
              {selectedPatient
                ? `Here's a snapshot for ${selectedPatient.name} today.`
                : 'Once a patient is added, their snapshot will appear here.'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw className="h-4 w-4" />}
            loading={patientStatus === 'loading'}
            onClick={() => void refreshPatientList()}
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-gutter lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <Card className="h-full flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <Badge tone="accent">Caregiver</Badge>
              <button
                type="button"
                onClick={logout}
                className="text-xs font-semibold text-text-muted hover:text-error transition-colors"
              >
                Sign out
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-on-primary text-sm font-semibold">
                {caregiver ? initialsFromName(caregiver.name) : '?'}
              </span>
              <div className="leading-tight">
                <p className="text-base font-semibold text-on-surface">{caregiver?.name ?? '-'}</p>
                <p className="text-xs text-text-muted">{caregiver?.email ?? ''}</p>
              </div>
            </div>
            <div className="mt-auto text-[11px] text-text-muted">
              Member since {caregiver?.createdAt ? formatDate(caregiver.createdAt) : '-'}
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.05 }}>
          <Card className="h-full flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <Badge tone="accent">Selected patient</Badge>
              <span className="text-[11px] text-text-muted">
                {patients.length} {patients.length === 1 ? 'patient' : 'patients'}
              </span>
            </div>
            {selectedPatient ? (
              <>
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent-dark text-sm font-semibold">
                    {initialsFromName(selectedPatient.name)}
                  </span>
                  <div className="leading-tight">
                    <p className="text-base font-semibold text-on-surface">{selectedPatient.name}</p>
                    <p className="inline-flex items-center gap-1 text-xs text-text-muted">
                      <Phone className="h-3 w-3" />
                      {formatPhone(selectedPatient.phoneNumber)}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl bg-surface-section px-3 py-2.5 text-xs">
                  <p className="uppercase tracking-wider text-text-muted">Device</p>
                  <p className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-[12px] text-on-surface">
                    <Smartphone className="h-3 w-3" />
                    {selectedPatient.deviceId ?? 'Not paired'}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-on-surface-variant">
                {patientStatus === 'loading'
                  ? 'Loading patients...'
                  : 'No patients available yet. Add a patient from the Patients page.'}
              </p>
            )}
          </Card>
        </motion.div>
      </div>

      <section className="mt-2">
        <Card className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-col gap-4 border-b border-outline-variant/30 pb-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-on-surface">Patient Care Snapshot</h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                Today's status, recent activity, and care coordination notes.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
              <p className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                <Clock3 className="h-3.5 w-3.5" />
                Last updated {lastUpdated}
              </p>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<RefreshCw className="h-4 w-4" />}
                loading={overviewStatus === 'loading'}
                disabled={!selectedPatient}
                onClick={refreshSnapshot}
              >
                Refresh snapshot
              </Button>
            </div>
          </div>

          {overviewStatus === 'loading' && overview && (
            <p className="inline-flex items-center gap-1.5 rounded-xl bg-surface-section px-3 py-2 text-xs text-text-muted" aria-live="polite">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Refreshing latest update
            </p>
          )}

          {!selectedPatient ? (
            <EmptyState
              title="No patient selected"
              message="Choose or add a patient to see today's care coordination snapshot."
              className="border-outline-variant/40 bg-surface-section"
            />
          ) : overviewStatus === 'loading' && !overview ? (
            <LoadingState label="Loading patient care snapshot..." />
          ) : overviewStatus === 'error' ? (
            <ErrorState
              title="Snapshot unavailable"
              message={overviewError ?? 'Unable to load patient care snapshot.'}
              onRetry={refreshSnapshot}
            />
          ) : overview ? (
            <div className="flex flex-col gap-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {overview.summaryCards.map((item, idx) => {
                  const Icon = cardIcons[item.key]
                  const style = statusStyles[item.status]
                  return (
                    <motion.div
                      key={item.key}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: idx * 0.03 }}
                      className="min-w-0 rounded-2xl border border-outline-variant/30 bg-surface-section p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', style.icon)}>
                          <Icon className="h-4 w-4" />
                        </span>
                        {statusBadge(item.status)}
                      </div>
                      <div className="mt-3 min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{item.label}</p>
                        <p className="mt-1 break-words text-base font-semibold leading-snug text-on-surface">{item.value}</p>
                        <p className="mt-1 break-words text-xs leading-5 text-on-surface-variant">{item.detail}</p>
                      </div>
                    </motion.div>
                  )
                })}
              </div>

              <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4">
                {overview.attentionItems.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                        <AlertTriangle className="h-4 w-4" />
                      </span>
                      <div>
                        <h3 className="text-base font-semibold text-on-surface">Needs attention</h3>
                        <p className="text-xs text-text-muted">Care coordination notes for today.</p>
                      </div>
                    </div>
                    <ul className="grid gap-2 md:grid-cols-2">
                      {overview.attentionItems.map((item, idx) => (
                        <li key={`${item.severity}-${idx}`} className="flex gap-3 rounded-xl bg-surface-section px-3 py-2.5">
                          <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', attentionIconClass(item.severity))}>
                            <AlertTriangle className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0 break-words text-sm leading-6 text-on-surface-variant">{item.message}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-700">
                      <CheckCircle2 className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-on-surface">Care notes</h3>
                      <p className="mt-1 text-sm leading-6 text-on-surface-variant">
                        No urgent issues right now. New patient activity will appear here as it is recorded.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-outline-variant/30 pt-5">
                <div className="mb-4">
                  <h3 className="text-base font-semibold text-on-surface">Recent Activity</h3>
                  <p className="text-xs text-text-muted">Latest update from patient activity events.</p>
                </div>

                {overview.timeline.length === 0 ? (
                  <p className="rounded-xl bg-surface-section px-3 py-4 text-sm text-on-surface-variant">
                    No new patient activity has been recorded today.
                  </p>
                ) : (
                  <ol className="relative space-y-4 before:absolute before:left-4 before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-outline-variant/40">
                    {overview.timeline.map((item) => {
                      const Icon = timelineIcons[item.type]
                      return (
                        <li key={`${item.type}-${item.id}`} className="relative flex gap-3">
                          <span className="z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-outline-variant/40 bg-surface-container-lowest text-on-surface-variant">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1 border-b border-outline-variant/30 pb-3 last:border-b-0 last:pb-0">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                              <p className="min-w-0 break-words text-sm font-semibold leading-6 text-on-surface">{item.title}</p>
                              <time className="shrink-0 text-xs text-text-muted">{formatDateTime(item.timestamp)}</time>
                            </div>
                            <p className="mt-1 min-w-0 break-words text-sm leading-6 text-on-surface-variant">{item.detail}</p>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </div>
            </div>
          ) : null}
        </Card>
      </section>
    </div>
  )
}
