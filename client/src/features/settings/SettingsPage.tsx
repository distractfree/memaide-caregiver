import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ExternalLink,
  LogOut,
  Mail,
  User2,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useAuth } from '@/features/auth/AuthContext'
import { usePatients } from '@/features/patients/PatientContext'
import { cn } from '@/utils/cn'
import { formatDate, formatPhone, initialsFromName } from '@/utils/formatting'





export function SettingsPage() {
  const { caregiver, status: authStatus, logout } = useAuth()
  const { selectedPatient, patients, status: patientStatus, error: patientError } = usePatients()

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

    </motion.div>
  )
}

function PageHeader() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl font-semibold tracking-tight text-on-surface">Settings</h1>
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
          Profile changes are not available in this version.
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
