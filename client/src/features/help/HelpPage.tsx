import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { LifeBuoy, Smartphone, UserPlus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { usePatients } from '@/features/patients/PatientContext'
import { HelpContactCard } from '@/features/help/components/HelpContactCard'
import { HelpEventsSection } from '@/features/help/components/HelpEventsSection'
import { AiSessionsSection } from '@/features/help/components/AiSessionsSection'
import type { HelpEventsFiltersValue } from '@/features/help/components/HelpEventsFilters'
import { api, ApiClientError } from '@/services/apiClient'
import { initialsFromName } from '@/utils/formatting'
import type { HelpContact, HelpEvent } from '@/types/domain'

type SectionStatus = 'idle' | 'loading' | 'ready' | 'error'

const INITIAL_FILTERS: HelpEventsFiltersValue = {}

export function HelpPage() {
  const { selectedPatient, selectedPatientId } = usePatients()

  const [contact, setContact] = useState<HelpContact | null>(null)
  const [contactStatus, setContactStatus] = useState<SectionStatus>('idle')
  const [contactError, setContactError] = useState<string | null>(null)

  const [events, setEvents] = useState<HelpEvent[]>([])
  const [eventsStatus, setEventsStatus] = useState<SectionStatus>('idle')
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [filters, setFilters] = useState<HelpEventsFiltersValue>(INITIAL_FILTERS)

  const prevPatientIdRef = useRef<string | null>(null)
  const contactRequestIdRef = useRef(0)
  const eventsRequestIdRef = useRef(0)

  const loadContact = useCallback(async (patientId: string) => {
    const requestId = ++contactRequestIdRef.current
    setContactStatus('loading')
    setContactError(null)
    try {
      const data = await api.getHelpContact(patientId)
      if (requestId !== contactRequestIdRef.current) return
      setContact(data)
      setContactStatus('ready')
    } catch (err) {
      if (requestId !== contactRequestIdRef.current) return
      if (err instanceof ApiClientError) {
        setContactError(err.message)
      } else {
        setContactError('Unable to load help contact.')
      }
      setContactStatus('error')
    }
  }, [])

  const loadEvents = useCallback(
    async (patientId: string, range: HelpEventsFiltersValue) => {
      const requestId = ++eventsRequestIdRef.current
      setEventsStatus('loading')
      setEventsError(null)
      try {
        const data = await api.listHelpEvents(patientId, range)
        if (requestId !== eventsRequestIdRef.current) return
        setEvents(data)
        setEventsStatus('ready')
      } catch (err) {
        if (requestId !== eventsRequestIdRef.current) return
        if (err instanceof ApiClientError) {
          setEventsError(err.message)
        } else {
          setEventsError('Unable to load help events.')
        }
        setEventsStatus('error')
      }
    },
    [],
  )

  useEffect(() => {
    const prev = prevPatientIdRef.current
    prevPatientIdRef.current = selectedPatientId

    if (!selectedPatientId) {
      contactRequestIdRef.current++
      eventsRequestIdRef.current++
      setContact(null)
      setContactStatus('idle')
      setContactError(null)
      setEvents([])
      setEventsStatus('idle')
      setEventsError(null)
      setFilters(INITIAL_FILTERS)
      return
    }

    if (prev && prev !== selectedPatientId) {
      // Patient changed, so clear old data and reload with empty filters.
      contactRequestIdRef.current++
      eventsRequestIdRef.current++
      setContact(null)
      setEvents([])
      setFilters(INITIAL_FILTERS)
      return
    }

    void loadContact(selectedPatientId)
    void loadEvents(selectedPatientId, filters)
  }, [selectedPatientId, filters, loadContact, loadEvents])

  if (!selectedPatientId) {
    return (
      <motion.div
        className="flex flex-col gap-6"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <PageHeader />
        <EmptyState
          icon={UserPlus}
          title="Select a patient to configure help contact support"
          message="Help contact and help button events are managed per patient. Choose a patient from the top bar, or open the Patients page to add one."
          action={
            <Link to="/patients">
              <Button leftIcon={<UserPlus className="h-4 w-4" />}>Go to patients</Button>
            </Link>
          }
        />
      </motion.div>
    )
  }

  return (
    <motion.div
      className="flex flex-col gap-6"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <PageHeader />

      {selectedPatient && <SelectedPatientPill patient={selectedPatient} />}

      <div className="grid gap-gutter lg:grid-cols-5">
        <div className="lg:col-span-2">
          <HelpContactCard
            patientId={selectedPatientId}
            contact={contact}
            status={contactStatus}
            error={contactError}
            onRetry={() => void loadContact(selectedPatientId)}
            onSaved={(saved) => setContact(saved)}
          />
        </div>
        <div className="lg:col-span-3">
          <HelpEventsSection
            events={events}
            status={eventsStatus}
            error={eventsError}
            filters={filters}
            onFiltersChange={setFilters}
            onRetry={() => void loadEvents(selectedPatientId, filters)}
          />
          <AiSessionsSection patientId={selectedPatientId} />
        </div>
      </div>
    </motion.div>
  )
}

function PageHeader() {
  return (
    <div className="flex flex-col gap-2">
      <Badge tone="muted" leftIcon={<LifeBuoy className="h-3 w-3" />}>
        Help flow
      </Badge>
      <h1 className="text-3xl font-semibold tracking-tight text-on-surface">Help</h1>
      <p className="text-sm text-on-surface-variant max-w-2xl">
        Configure the WhatsApp contact the patient app uses for caregiver
        coordination, and review help button events from the patient device.
      </p>
    </div>
  )
}

function SelectedPatientPill({
  patient,
}: {
  patient: NonNullable<ReturnType<typeof usePatients>['selectedPatient']>
}) {
  return (
    <Card padded={false} className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent-dark text-sm font-semibold">
        {initialsFromName(patient.name)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-on-surface">{patient.name}</p>
        <p className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">
          <Smartphone className="h-3 w-3" />
          {patient.deviceId ? (
            <span className="truncate font-mono">{patient.deviceId}</span>
          ) : (
            <span>No device paired</span>
          )}
        </p>
      </div>
      <Badge tone="accent" dot className="ml-auto">
        Selected
      </Badge>
    </Card>
  )
}
