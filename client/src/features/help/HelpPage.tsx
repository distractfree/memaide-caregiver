import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { MessageCircle, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { usePatients } from '@/features/patients/PatientContext'
import { HelpStatusStrip } from '@/features/help/components/HelpStatusStrip'
import { HelpContactForm } from '@/features/help/components/HelpContactForm'
import { HelpEventsSection } from '@/features/help/components/HelpEventsSection'
import { AiSessionsSection } from '@/features/help/components/AiSessionsSection'
import type { HelpEventsFiltersValue } from '@/features/help/components/HelpEventsFilters'
import { api, ApiClientError } from '@/services/apiClient'
import type { AiSession, HelpContact, HelpEvent } from '@/types/domain'

type SectionStatus = 'idle' | 'loading' | 'ready' | 'error'

const INITIAL_FILTERS: HelpEventsFiltersValue = {}

export function HelpPage() {
  const { selectedPatientId } = usePatients()

  const [contact, setContact] = useState<HelpContact | null>(null)
  const [contactStatus, setContactStatus] = useState<SectionStatus>('idle')
  const [contactError, setContactError] = useState<string | null>(null)
  const [isContactOpen, setIsContactOpen] = useState(false)

  const [events, setEvents] = useState<HelpEvent[]>([])
  const [eventsStatus, setEventsStatus] = useState<SectionStatus>('idle')
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [filters, setFilters] = useState<HelpEventsFiltersValue>(INITIAL_FILTERS)

  // Fed from AiSessionsSection (which owns its own fetch) so the status strip
  // can show session counts without issuing a second request.
  const [sessions, setSessions] = useState<AiSession[]>([])
  const [sessionsStatus, setSessionsStatus] = useState<SectionStatus>('idle')

  const prevPatientIdRef = useRef<string | null>(null)
  const contactRequestIdRef = useRef(0)
  const eventsRequestIdRef = useRef(0)
  const eventsAbortRef = useRef<AbortController | null>(null)

  const validationError = useMemo<string | null>(() => {
    if (filters.from && filters.to && filters.from > filters.to) {
      return 'Start date must be on or before end date.'
    }
    return null
  }, [filters.from, filters.to])

  const handleSessionsChange = useCallback(
    (next: AiSession[], status: SectionStatus) => {
      setSessions(next)
      setSessionsStatus(status)
    },
    [],
  )

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
      // Cancel any in-flight events request so a superseded patient/filter fetch
      // cannot resolve after this one. The request-id guard below is retained as
      // a second line of defense for responses that already left the network.
      eventsAbortRef.current?.abort()
      const controller = new AbortController()
      eventsAbortRef.current = controller
      setEventsStatus('loading')
      setEventsError(null)
      try {
        // Send the full UTC day so the selected end date is included.
        const from = range.from
          ? new Date(`${range.from}T00:00:00.000Z`).toISOString()
          : undefined
        const to = range.to
          ? new Date(`${range.to}T23:59:59.999Z`).toISOString()
          : undefined

        const data = await api.listHelpEvents(
          patientId,
          {
            sourceDevice: range.sourceDevice,
            status: range.status,
            from,
            to,
          },
          { signal: controller.signal },
        )
        if (requestId !== eventsRequestIdRef.current) return
        setEvents(data)
        setEventsStatus('ready')
      } catch (err) {
        // A cancelled request is expected during patient/filter changes; leave
        // the newer request to own the state instead of showing an error.
        if (err instanceof DOMException && err.name === 'AbortError') return
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
      eventsAbortRef.current?.abort()
      setContact(null)
      setContactStatus('idle')
      setContactError(null)
      setIsContactOpen(false)
      setEvents([])
      setEventsStatus('idle')
      setEventsError(null)
      setFilters(INITIAL_FILTERS)
      return
    }

    if (prev && prev !== selectedPatientId) {
      // Patient changed, so clear old data and reload with default filters.
      // Use a fresh object (not the stable INITIAL_FILTERS reference) so the
      // filters state always changes identity — otherwise, when filters were
      // already default, React bails out of the update, this effect never
      // re-runs, and the new patient's contact/events are never fetched.
      contactRequestIdRef.current++
      eventsRequestIdRef.current++
      eventsAbortRef.current?.abort()
      setContact(null)
      setIsContactOpen(false)
      setEvents([])
      setFilters({ ...INITIAL_FILTERS })
      return
    }

    if (validationError) {
      // Do not call the backend with an invalid date range.
      return
    }

    void loadContact(selectedPatientId)
    void loadEvents(selectedPatientId, filters)
  }, [selectedPatientId, filters, validationError, loadContact, loadEvents])

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

      <HelpStatusStrip
        contact={contact}
        contactStatus={contactStatus}
        events={events}
        eventsStatus={eventsStatus}
        sessions={sessions}
        sessionsStatus={sessionsStatus}
        isContactOpen={isContactOpen}
        onToggleContact={() => setIsContactOpen(!isContactOpen)}
      />

      <AnimatePresence initial={false}>
        {isContactOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <Card className="flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent-dark">
                  <MessageCircle className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-on-surface">Configure Caregiver Help Contact</h2>
                  <p className="text-xs text-text-muted">
                    The WhatsApp number the patient app opens when the help button is pressed.
                  </p>
                </div>
              </div>
              {contactStatus === 'error' && (
                <div className="rounded-xl border border-error/30 bg-error-container/60 px-3 py-2.5 text-sm text-error font-medium flex items-center justify-between gap-3">
                  <span>{contactError ?? 'Unable to load existing contact.'}</span>
                  <Button size="sm" variant="outline" onClick={() => void loadContact(selectedPatientId)}>Retry</Button>
                </div>
              )}
              <HelpContactForm
                patientId={selectedPatientId}
                existing={contact}
                onSaved={(saved) => {
                  setContact(saved)
                  setIsContactOpen(false)
                }}
                onCancel={() => setIsContactOpen(false)}
              />
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <HelpEventsSection
        events={events}
        status={eventsStatus}
        error={eventsError}
        filters={filters}
        validationError={validationError}
        onFiltersChange={setFilters}
        onRetry={() => void loadEvents(selectedPatientId, filters)}
        resetKey={`${selectedPatientId}::${filters.sourceDevice ?? ''}::${filters.status ?? ''}::${filters.from ?? ''}::${filters.to ?? ''}`}
      />

      <AiSessionsSection
        patientId={selectedPatientId}
        onSessionsChange={handleSessionsChange}
      />
    </motion.div>
  )
}

function PageHeader() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl font-semibold tracking-tight text-on-surface">Help</h1>
    </div>
  )
}
