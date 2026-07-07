import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { usePatients } from '@/features/patients/PatientContext'
import { HeartRateChart } from '@/features/reports/vitals/components/HeartRateChart'
import { MotionStateChart } from '@/features/reports/vitals/components/MotionStateChart'
import { StepCountChart } from '@/features/reports/vitals/components/StepCountChart'
import { VitalSamplesTable } from '@/features/reports/vitals/components/VitalSamplesTable'
import {
  WellnessFilters,
  type DateRange,
} from '@/features/reports/vitals/components/WellnessFilters'
import { WellnessKpis } from '@/features/reports/vitals/components/WellnessKpis'
import { api, ApiClientError } from '@/services/apiClient'
import type { VitalReport } from '@/types/domain'

type PageStatus = 'idle' | 'loading' | 'ready' | 'error'

const INITIAL_FILTERS: DateRange = { from: null, to: null }

export function WellnessTrendsPage() {
  const { selectedPatientId } = usePatients()

  const [filters, setFilters] = useState<DateRange>(INITIAL_FILTERS)
  const [report, setReport] = useState<VitalReport | null>(null)
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

  const loadReport = useCallback(async (patientId: string, range: DateRange) => {
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

      const data = await api.getVitalsReport(patientId, { from, to })

      if (requestId !== requestIdRef.current) return
      setReport(data)
      setStatus('ready')
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      if (err instanceof ApiClientError) {
        setError(err.message)
      } else {
        setError('Unable to load wellness report.')
      }
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    const prev = prevPatientIdRef.current
    prevPatientIdRef.current = selectedPatientId

    if (!selectedPatientId) {
      requestIdRef.current++
      setReport(null)
      setStatus('idle')
      setError(null)
      setFilters(INITIAL_FILTERS)
      return
    }

    if (prev && prev !== selectedPatientId) {
      // Patient changed, so clear old data and reload with empty filters.
      requestIdRef.current++
      setReport(null)
      setFilters({ from: null, to: null })
      return
    }

    if (validationError) {
      // Do not call the backend with an invalid date range.
      return
    }

    void loadReport(selectedPatientId, filters)
  }, [selectedPatientId, filters, validationError, loadReport])

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
          title="Select a patient to view wellness trends"
          message="Wellness reports are scoped per patient. Choose a patient from the top bar, or open the Patients page to add one."
          action={
            <Link to="/patients">
              <Button leftIcon={<UserPlus className="h-4 w-4" />}>Go to patients</Button>
            </Link>
          }
        />
      </motion.div>
    )
  }

  const showInitialLoader = status === 'loading' && report === null
  const showFatalError = status === 'error' && report === null
  const hasActiveFilter = filters.from !== null || filters.to !== null

  return (
    <motion.div
      className="flex flex-col gap-6"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <PageHeader />

      <WellnessFilters
        filters={filters}
        onChange={setFilters}
        validationError={validationError}
      />

      {showInitialLoader ? (
        <LoadingState label="Loading wellness report…" />
      ) : showFatalError ? (
        <ErrorState
          title="Unable to load wellness report"
          message={error ?? 'Something went wrong. Please try again.'}
          onRetry={() => void loadReport(selectedPatientId, filters)}
        />
      ) : report ? (
        <>
          {status === 'error' && error && (
            <div
              role="alert"
              className="rounded-xl border border-error/30 bg-error-container/60 px-3 py-2.5 text-sm text-error font-medium"
            >
              {error}
            </div>
          )}

          <WellnessKpis summary={report.summary} />

          <HeartRateChart points={report.heartRateTrend} />

          <div className="grid gap-gutter lg:grid-cols-2">
            <StepCountChart points={report.stepTrend} />
            <MotionStateChart counts={report.summary.countsByMotionState} />
          </div>

          <VitalSamplesTable
            events={report.events}
            hasActiveFilter={hasActiveFilter}
            onClearFilters={handleClearFilters}
          />
        </>
      ) : null}
    </motion.div>
  )
}

function PageHeader() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl font-semibold tracking-tight text-on-surface">Wellness Trends</h1>
    </div>
  )
}


