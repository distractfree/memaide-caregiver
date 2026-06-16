import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowUpRight,
  BarChart3,
  Bell,
  HeartPulse,
  LifeBuoy,
  Phone,
  Radar,
  Radio,
  RefreshCw,
  Smartphone,
  type LucideIcon,
  Users,
  Video,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/features/auth/AuthContext'
import { usePatients } from '@/features/patients/PatientContext'
import { formatDate, formatPhone, initialsFromName } from '@/utils/formatting'

interface AvailableModule {
  title: string
  description: string
  icon: LucideIcon
  to: string
}

const AVAILABLE_MODULES: AvailableModule[] = [
  {
    title: 'Patients',
    description: 'Manage patient profiles, phone numbers, and paired device IDs.',
    icon: Users,
    to: '/patients',
  },
  {
    title: 'Reminder Support',
    description: 'Schedule and ping medication, hydration, and care reminders.',
    icon: Bell,
    to: '/reminders',
  },
  {
    title: 'Reminder Reports',
    description: 'Review acknowledgment context and missed reminder events.',
    icon: BarChart3,
    to: '/reports/reminders',
  },
  {
    title: 'Help Flow',
    description: 'WhatsApp help contact and help-event coordination.',
    icon: LifeBuoy,
    to: '/help',
  },
  {
    title: 'Beacons',
    description: 'Configure room beacons for approximate proximity context.',
    icon: Radio,
    to: '/beacons',
  },
  {
    title: 'Beacon Reports',
    description: 'Best-effort beacon proximity for activity context.',
    icon: Radar,
    to: '/reports/beacons',
  },
  {
    title: 'Wellness Trends',
    description: 'Best-effort wellness signals for caregiver coordination.',
    icon: HeartPulse,
    to: '/reports/vitals',
  },
  {
    title: 'Patient Perspective Stream',
    description: 'Stream session status. Does not replace WhatsApp camera.',
    icon: Video,
    to: '/stream',
  },
]

export function DashboardOverviewPage() {
  const { caregiver, logout } = useAuth()
  const { selectedPatient, patients, status: patientStatus, refresh: refreshPatients } = usePatients()

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
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
          <Button variant="outline" size="sm" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => void refreshPatients()}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Top row: caregiver + patient */}
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
                <p className="text-base font-semibold text-on-surface">{caregiver?.name ?? '—'}</p>
                <p className="text-xs text-text-muted">{caregiver?.email ?? ''}</p>
              </div>
            </div>
            <div className="mt-auto text-[11px] text-text-muted">
              Member since {caregiver?.createdAt ? formatDate(caregiver.createdAt) : '—'}
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
                  ? 'Loading patients…'
                  : 'No patients available yet. Add a patient from the Patients page.'}
              </p>
            )}
          </Card>
        </motion.div>
      </div>

      {/* Available module bento */}
      <div className="mt-2">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-on-surface">Available modules</h2>
            <p className="text-xs text-text-muted">
              Open any completed caregiver portal section for the selected patient.
            </p>
          </div>
        </div>
        <div className="grid gap-gutter sm:grid-cols-2 lg:grid-cols-3">
          {AVAILABLE_MODULES.map((item, idx) => {
            const Icon = item.icon
            return (
              <motion.div
                key={item.to}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.05 + idx * 0.04 }}
              >
                <Link to={item.to} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-2xl">
                  <Card interactive className="h-full flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-container-high text-on-surface">
                        <Icon className="h-4 w-4" />
                      </span>
                      <Badge tone="success">Available</Badge>
                    </div>
                    <div>
                      <p className="text-base font-semibold text-on-surface">{item.title}</p>
                      <p className="mt-1 text-sm text-on-surface-variant">{item.description}</p>
                    </div>
                    <div className="mt-auto flex items-center justify-between text-xs text-text-muted">
                      <span>Open module</span>
                      <ArrowUpRight className="h-4 w-4" />
                    </div>
                  </Card>
                </Link>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
