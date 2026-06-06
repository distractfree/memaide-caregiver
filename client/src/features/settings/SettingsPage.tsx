import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Activity,
  BarChart3,
  Bell,
  CheckCircle2,
  ExternalLink,
  HeartPulse,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Mail,
  Radar,
  Radio,
  RefreshCw,
  Settings,
  ShieldCheck,
  User2,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useAuth } from '@/features/auth/AuthContext'
import { usePatients } from '@/features/patients/PatientContext'
import { api, ApiClientError } from '@/services/apiClient'
import type { HealthStatus } from '@/types/domain'
import { cn } from '@/utils/cn'
import { formatDate, formatDateTime, formatPhone, initialsFromName } from '@/utils/formatting'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '')
const FRONTEND_ORIGIN = window.location.origin

type HealthState =
  | { status: 'checking'; lastChecked: Date | null; data: HealthStatus | null; error: string | null }
  | { status: 'online'; lastChecked: Date; data: HealthStatus; error: null }
  | { status: 'offline'; lastChecked: Date; data: HealthStatus | null; error: string }

interface ModuleItem {
  label: string
  route: string
  icon: LucideIcon
}

const MODULES: ModuleItem[] = [
  { label: 'Overview', route: '/', icon: LayoutDashboard },
  { label: 'Patients', route: '/patients', icon: Users },
  { label: 'Reminders', route: '/reminders', icon: Bell },
  { label: 'Reminder Reports', route: '/reports/reminders', icon: BarChart3 },
  { label: 'Help', route: '/help', icon: LifeBuoy },
  { label: 'Beacons', route: '/beacons', icon: Radio },
  { label: 'Beacon Reports', route: '/reports/beacons', icon: Radar },
  { label: 'Wellness Trends', route: '/reports/vitals', icon: HeartPulse },
  { label: 'Stream Status', route: '/stream', icon: Video },
  { label: 'Settings', route: '/settings', icon: Settings },
]

const SAFETY_NOTES = [
  'Wellness data is best-effort and not diagnosis.',
  'BLE proximity is approximate.',
  'Stream status depends on device, app, and network.',
  'Reminder reports show acknowledgment context, not medical compliance.',
]

export function SettingsPage() {
  const { caregiver, status: authStatus, logout } = useAuth()
  const { selectedPatient, patients, status: patientStatus, error: patientError } = usePatients()
  const [health, setHealth] = useState<HealthState>({
    status: 'checking',
    lastChecked: null,
    data: null,
    error: null,
  })

  const checkHealth = useCallback(async () => {
    setHealth((current) => ({
      status: 'checking',
      lastChecked: current.lastChecked,
      data: current.data,
      error: null,
    }))

    try {
      const data = await api.health()
      setHealth({ status: 'online', lastChecked: new Date(), data, error: null })
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : 'Unable to reach the MemAide server. Check that the backend is running.'
      setHealth((current) => ({
        status: 'offline',
        lastChecked: new Date(),
        data: current.data,
        error: message,
      }))
    }
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => void checkHealth(), 0)
    return () => window.clearTimeout(id)
  }, [checkHealth])

  const patientSummary = useMemo(() => {
    if (patientStatus === 'loading') return 'Loading patient context'
    if (patientStatus === 'error') return patientError ?? 'Unable to load patient context'
    if (selectedPatient) return selectedPatient.name
    return 'No patient selected'
  }, [patientError, patientStatus, selectedPatient])

  return (
    <motion.div
      className="flex flex-col gap-6"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <PageHeader />

      <div className="grid gap-gutter lg:grid-cols-2">
        <AccountCard
          caregiver={caregiver}
          authStatus={authStatus}
          onLogout={logout}
        />
        <SelectedPatientCard
          selectedPatient={selectedPatient}
          patientCount={patients.length}
          patientSummary={patientSummary}
          patientStatus={patientStatus}
        />
      </div>

      <div className="grid gap-gutter xl:grid-cols-5">
        <div className="xl:col-span-2">
          <SystemStatusCard health={health} onCheck={checkHealth} />
        </div>
        <div className="xl:col-span-3">
          <ModuleStatusCard />
        </div>
      </div>

      <ProductSafetyCard />
    </motion.div>
  )
}

function PageHeader() {
  return (
    <div className="flex flex-col gap-2">
      <Badge tone="muted" leftIcon={<Settings className="h-3 w-3" />}>
        Portal settings
      </Badge>
      <h1 className="text-3xl font-semibold tracking-tight text-on-surface">Settings</h1>
      <p className="text-sm text-on-surface-variant max-w-2xl">
        Review caregiver portal account, connection, and project status.
      </p>
    </div>
  )
}

function AccountCard({
  caregiver,
  authStatus,
  onLogout,
}: {
  caregiver: ReturnType<typeof useAuth>['caregiver']
  authStatus: ReturnType<typeof useAuth>['status']
  onLogout: () => void
}) {
  return (
    <Card className="flex h-full flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Badge tone="accent" leftIcon={<User2 className="h-3 w-3" />}>
            Caregiver account
          </Badge>
          <h2 className="mt-3 text-lg font-semibold text-on-surface">Account summary</h2>
        </div>
        <Badge tone="success" dot>
          {authStatus === 'authenticated' ? 'Signed in' : authStatus}
        </Badge>
      </div>

      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-on-primary">
          {caregiver ? initialsFromName(caregiver.name) : '?'}
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-base font-semibold text-on-surface">
            {caregiver?.name ?? 'Caregiver'}
          </p>
          <p className="inline-flex items-center gap-1.5 text-xs text-text-muted">
            <Mail className="h-3 w-3" />
            <span className="truncate">{caregiver?.email ?? 'No email available'}</span>
          </p>
        </div>
      </div>

      <dl className="grid gap-3 rounded-2xl bg-surface-section p-4 text-sm sm:grid-cols-2">
        <DetailItem label="Account ID" value={caregiver?.id ?? 'Unavailable'} mono />
        <DetailItem label="Member since" value={formatDate(caregiver?.createdAt)} />
      </dl>

      <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-text-muted">
          Profile changes are not available in this prototype because the backend exposes no
          caregiver settings update endpoint.
        </p>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<LogOut className="h-4 w-4" />}
          onClick={onLogout}
          className="shrink-0"
        >
          Sign out
        </Button>
      </div>
    </Card>
  )
}

function SelectedPatientCard({
  selectedPatient,
  patientCount,
  patientSummary,
  patientStatus,
}: {
  selectedPatient: ReturnType<typeof usePatients>['selectedPatient']
  patientCount: number
  patientSummary: string
  patientStatus: ReturnType<typeof usePatients>['status']
}) {
  return (
    <Card className="flex h-full flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Badge tone="accent" leftIcon={<Users className="h-3 w-3" />}>
            Patient context
          </Badge>
          <h2 className="mt-3 text-lg font-semibold text-on-surface">{patientSummary}</h2>
        </div>
        <span className="rounded-full border border-outline-variant/40 px-2.5 py-1 text-[11px] font-semibold text-text-muted">
          {patientCount} {patientCount === 1 ? 'patient' : 'patients'}
        </span>
      </div>

      {selectedPatient ? (
        <>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent-dark">
              {initialsFromName(selectedPatient.name)}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-base font-semibold text-on-surface">
                {selectedPatient.name}
              </p>
              <p className="text-xs text-text-muted">{formatPhone(selectedPatient.phoneNumber)}</p>
            </div>
          </div>

          <dl className="grid gap-3 rounded-2xl bg-surface-section p-4 text-sm sm:grid-cols-2">
            <DetailItem
              label="Phone"
              value={formatPhone(selectedPatient.phoneNumber)}
            />
            <DetailItem
              label="Device ID"
              value={selectedPatient.deviceId ?? 'Not paired'}
              mono={Boolean(selectedPatient.deviceId)}
            />
          </dl>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-outline-variant/60 bg-surface-section p-5">
          <p className="text-sm font-semibold text-on-surface">
            {patientStatus === 'loading' ? 'Loading patient context' : 'No patient selected'}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
            Open Patients to add or choose a patient for portal modules.
          </p>
        </div>
      )}

      <div className="mt-auto">
        <Link to="/patients">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Users className="h-4 w-4" />}
            rightIcon={<ExternalLink className="h-3.5 w-3.5" />}
          >
            Open patients
          </Button>
        </Link>
      </div>
    </Card>
  )
}

function SystemStatusCard({
  health,
  onCheck,
}: {
  health: HealthState
  onCheck: () => Promise<void>
}) {
  const isChecking = health.status === 'checking'
  const isOnline = health.status === 'online'

  return (
    <Card className="flex h-full flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Badge tone={isOnline ? 'success' : health.status === 'offline' ? 'danger' : 'muted'} dot>
            Backend {isOnline ? 'online' : health.status === 'offline' ? 'offline' : 'checking'}
          </Badge>
          <h2 className="mt-3 text-lg font-semibold text-on-surface">System status</h2>
        </div>
        <span
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-2xl',
            isOnline ? 'bg-green-100 text-green-700' : 'bg-surface-container-high text-on-surface-variant',
          )}
        >
          <Activity className={cn('h-4 w-4', isChecking && 'animate-pulse')} />
        </span>
      </div>

      <dl className="grid gap-3 text-sm">
        <DetailItem label="API base URL" value={API_BASE_URL} mono />
        <DetailItem label="Frontend origin" value={FRONTEND_ORIGIN} mono />
        <DetailItem label="Service" value={health.data?.service ?? 'Not confirmed'} />
        <DetailItem label="Environment" value={health.data?.environment ?? 'Not confirmed'} />
        <DetailItem label="Server timestamp" value={formatDateTime(health.data?.timestamp)} />
        <DetailItem
          label="Last checked"
          value={health.lastChecked ? health.lastChecked.toLocaleTimeString() : 'Not checked yet'}
        />
      </dl>

      {health.status === 'offline' && (
        <div role="status" className="rounded-xl border border-error/30 bg-error-container/50 px-3 py-2 text-sm text-error">
          {health.error}
        </div>
      )}

      <div className="mt-auto">
        <Button
          variant="outline"
          size="sm"
          loading={isChecking}
          leftIcon={<RefreshCw className="h-4 w-4" />}
          onClick={() => void onCheck()}
        >
          Check again
        </Button>
      </div>
    </Card>
  )
}

function ModuleStatusCard() {
  return (
    <Card className="flex h-full flex-col gap-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Badge tone="accent" leftIcon={<CheckCircle2 className="h-3 w-3" />}>
            Portal modules
          </Badge>
          <h2 className="mt-3 text-lg font-semibold text-on-surface">Available sections</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Task 1-10 sidebar modules are wired to real portal pages.
          </p>
        </div>
        <Badge tone="success" dot>
          Complete
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {MODULES.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.route}
              to={item.route}
              className="group rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <div className="flex h-full items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-section px-3 py-3 transition-all duration-300 ease-bezier group-hover:border-accent/40 group-hover:bg-surface-container-lowest group-hover:shadow-card">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-on-surface">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-on-surface">{item.label}</p>
                  <p className="text-[11px] text-text-muted">{item.route}</p>
                </div>
                <Badge tone="success">Available</Badge>
              </div>
            </Link>
          )
        })}
      </div>
    </Card>
  )
}

function ProductSafetyCard() {
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent-dark">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <div>
          <Badge tone="muted">Product positioning</Badge>
          <h2 className="mt-3 text-lg font-semibold text-on-surface">Safety wording</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-on-surface-variant">
            MemAide / GuardiaNova is a caregiver coordination prototype for independent living
            support. It is not a medical device, emergency system, or replacement for WhatsApp
            camera feed.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {SAFETY_NOTES.map((note) => (
          <div
            key={note}
            className="flex gap-2 rounded-2xl border border-outline-variant/30 bg-surface-section px-3 py-3 text-sm text-on-surface-variant"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>{note}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function DetailItem({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="min-w-0 rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </dt>
      <dd
        className={cn(
          'mt-1 break-words text-sm font-semibold text-on-surface',
          mono && 'font-mono text-[12px]',
        )}
      >
        {value}
      </dd>
    </div>
  )
}
