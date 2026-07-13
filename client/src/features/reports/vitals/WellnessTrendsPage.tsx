import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { AlertTriangle, Clock3, RefreshCw, UserPlus } from 'lucide-react'
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
import { useVitalsReport } from '@/features/reports/vitals/useVitalsReport'
import { formatDateTime } from '@/utils/formatting'
import type { VitalReportQuery } from '@/types/domain'

const INITIAL_FILTERS: DateRange = { from: null, to: null }

export function WellnessTrendsPage() {
  const { selectedPatientId } = usePatients()

  const [filters, setFilters] = useState<DateRange>(INITIAL_FILTERS)

  const validationError = useMemo<string | null>(() => {
    if (filters.from && filters.to && filters.from > filters.to) {
      return 'Start date must be on or before end date.'
    }
    return null
  }, [filters.from, filters.to])

  // Send the full UTC day so the selected end date is included. The date inputs
  // are plain YYYY-MM-DD, so we anchor them to UTC rather than shifting hours.
  const query = useMemo<VitalReportQuery>(() => {
    return {
      from: filters.from ? `${filters.from}T00:00:00.000Z` : undefined,
      to: filters.to ? `${filters.to}T23:59:59.999Z` : undefined,
    }
  }, [filters.from, filters.to])

  const { report, status, error, isRefreshing, lastUpdatedAt, refresh } = useVitalsReport({
    patientId: selectedPatientId,
    query,
    // Don't hit the backend with an invalid range; keep whatever we last had.
    enabled: !validationError,
  })

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
  const backgroundError = error && report !== null

  return (
    <motion.div
      className="flex flex-col gap-6"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <PageHeader
        lastUpdatedAt={lastUpdatedAt}
        isRefreshing={isRefreshing}
        onRefresh={refresh}
        refreshDisabled={Boolean(validationError)}
      />

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
          onRetry={refresh}
        />
      ) : report ? (
        <>
          {backgroundError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-error/30 bg-error-container/60 px-3 py-2.5 text-sm font-medium text-error"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error} Showing the last update — retrying automatically.</span>
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

interface PageHeaderProps {
  lastUpdatedAt?: Date | null
  isRefreshing?: boolean
  onRefresh?: () => void
  refreshDisabled?: boolean
}

function PageHeader({
  lastUpdatedAt,
  isRefreshing = false,
  onRefresh,
  refreshDisabled = false,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-on-surface">Wellness Trends</h1>
      </div>

      {onRefresh && (
        <div className="flex flex-col gap-2 sm:items-end">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />}
            loading={false}
            disabled={isRefreshing || refreshDisabled}
            onClick={onRefresh}
          >
            Refresh
          </Button>
          <p className="inline-flex items-center gap-1.5 text-xs text-text-muted" aria-live="polite">
            <Clock3 className="h-3.5 w-3.5" />
            {lastUpdatedAt
              ? `Last updated ${formatDateTime(lastUpdatedAt.toISOString())}`
              : 'Not updated yet'}
          </p>
        </div>
      )}
    </div>
  )
}
