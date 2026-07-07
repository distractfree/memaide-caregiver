import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { usePatients } from '@/features/patients/PatientContext'
import { StreamCurrentStatusCard } from '@/features/stream/components/StreamCurrentStatusCard'
import { StreamSessionHistory, type StreamFilterState } from '@/features/stream/components/StreamSessionHistory'
import { api, ApiClientError } from '@/services/apiClient'
import type { StreamSession, StreamStatusSummary } from '@/types/domain'

type PageStatus = 'idle' | 'loading' | 'ready' | 'error'

const INITIAL_FILTERS: StreamFilterState = {
  status: '',
  source: '',
  from: null,
  to: null,
}

export function StreamStatusPage() {
  const { selectedPatientId } = usePatients()

  const [filters, setFilters] = useState<StreamFilterState>(INITIAL_FILTERS)
  const [summary, setSummary] = useState<StreamStatusSummary | null>(null)
  const [sessions, setSessions] = useState<StreamSession[] | null>(null)
  const [status, setStatus] = useState<PageStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const prevPatientIdRef = useRef<string | null>(null)
  const requestIdRef = useRef(0)

  const validationError = useMemo<string | null>(() => {
    if (filters.from && filters.to && filters.from > filters.to) {
      return 'Start date must be on or before end date.'
    }
    return null
  }, [filters.from, filters.to])

  const loadData = useCallback(async (patientId: string, range: StreamFilterState) => {
    const requestId = ++requestIdRef.current
    setStatus('loading')
    setError(null)
    try {
      // Send the full UTC day so the selected end date is included.
      const from = range.from
        ? new Date(`${range.from}T00:00:00.000Z`).toISOString()
        : undefined
      const to = range.to
        ? new Date(`${range.to}T23:59:59.999Z`).toISOString()
        : undefined

      const [summaryData, sessionsData] = await Promise.all([
        api.getStreamStatus(patientId),
        api.listStreamSessions(patientId, {
          status: range.status || undefined,
          source: range.source || undefined,
          from,
          to,
        }),
      ])

      if (requestId !== requestIdRef.current) return
      setSummary(summaryData)
      setSessions(sessionsData)
      setStatus('ready')
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      if (err instanceof ApiClientError) {
        setError(err.message)
      } else {
        setError('Unable to load stream status.')
      }
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    const prev = prevPatientIdRef.current
    prevPatientIdRef.current = selectedPatientId

    if (!selectedPatientId) {
      requestIdRef.current++
      setSummary(null)
      setSessions(null)
      setStatus('idle')
      setError(null)
      setFilters(INITIAL_FILTERS)
      return
    }

    if (prev && prev !== selectedPatientId) {
      // Patient changed, so clear old data and reload with default filters.
      // Use a fresh object (not the stable INITIAL_FILTERS reference) so the
      // filters state always changes identity — otherwise, when filters were
      // already default, React bails out of the update, this effect never
      // re-runs, and the new patient's summary/sessions are never fetched.
      requestIdRef.current++
      setSummary(null)
      setSessions(null)
      setFilters({ ...INITIAL_FILTERS })
      return
    }

    if (validationError) {
      // Do not call the backend with an invalid date range.
      return
    }

    void loadData(selectedPatientId, filters)
  }, [selectedPatientId, filters, validationError, loadData])

  function handleClearFilters() {
    setFilters(INITIAL_FILTERS)
  }

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
          title="Select a patient to view stream status"
          message="Stream status is scoped per patient. Choose a patient from the top bar, or open the Patients page to add one."
          action={
            <Link to="/patients">
              <Button leftIcon={<UserPlus className="h-4 w-4" />}>Go to patients</Button>
            </Link>
          }
        />
      </motion.div>
    )
  }

  const showInitialLoader = status === 'loading' && summary === null && sessions === null
  const showFatalError = status === 'error' && summary === null && sessions === null
  const hasActiveFilter =
    filters.status !== '' || filters.source !== '' || filters.from !== null || filters.to !== null

  return (
    <motion.div
      className="flex flex-col gap-6"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <PageHeader />

      {showInitialLoader ? (
        <LoadingState label="Loading stream status…" />
      ) : showFatalError ? (
        <ErrorState
          title="Unable to load stream status"
          message={error ?? 'Something went wrong. Please try again.'}
          onRetry={() => void loadData(selectedPatientId, filters)}
        />
      ) : (
        <>
          {status === 'error' && error && (
            <div
              role="alert"
              className="rounded-xl border border-error/30 bg-error-container/60 px-3 py-2.5 text-sm text-error font-medium"
            >
              {error}
            </div>
          )}

          {summary && <StreamCurrentStatusCard summary={summary} />}

          {sessions && (
            <StreamSessionHistory
              sessions={sessions}
              hasActiveFilter={hasActiveFilter}
              onClearFilters={handleClearFilters}
              filters={filters}
              onFiltersChange={setFilters}
              validationError={validationError}
            />
          )}
        </>
      )}
    </motion.div>
  )
}

function PageHeader() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl font-semibold tracking-tight text-on-surface">Stream Status</h1>
    </div>
  )
}
