import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Radar, Smartphone, UserPlus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { usePatients } from '@/features/patients/PatientContext'
import { BeaconEventsTable } from '@/features/reports/beacons/components/BeaconEventsTable'
import {
  BeaconReportFilters,
  type DateRange,
} from '@/features/reports/beacons/components/BeaconReportFilters'
import { BeaconReportInfoCard } from '@/features/reports/beacons/components/BeaconReportInfoCard'
import { BeaconReportKpis } from '@/features/reports/beacons/components/BeaconReportKpis'
import { BeaconRoomChart } from '@/features/reports/beacons/components/BeaconRoomChart'
import { api, ApiClientError } from '@/services/apiClient'
import { initialsFromName } from '@/utils/formatting'
import type { BeaconReport } from '@/types/domain'

type PageStatus = 'idle' | 'loading' | 'ready' | 'error'

const INITIAL_FILTERS: DateRange = { from: null, to: null }

export function BeaconReportsPage() {
  const { selectedPatient, selectedPatientId } = usePatients()

  const [filters, setFilters] = useState<DateRange>(INITIAL_FILTERS)
  const [report, setReport] = useState<BeaconReport | null>(null)
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

      const data = await api.getBeaconReport(patientId, { from, to })

      if (requestId !== requestIdRef.current) return
      setReport(data)
      setStatus('ready')
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      if (err instanceof ApiClientError) {
        setError(err.message)
      } else {
        setError('Unable to load beacon report.')
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
          title="Select a patient to view approximate beacon proximity events"
          message="Reports are scoped per patient. Choose a patient from the top bar, or open the Patients page to add one."
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

      {selectedPatient && <SelectedPatientPill patient={selectedPatient} />}

      <BeaconReportInfoCard />

      <BeaconReportFilters
        filters={filters}
        onChange={setFilters}
        validationError={validationError}
      />

      {showInitialLoader ? (
        <LoadingState label="Loading beacon report…" />
      ) : showFatalError ? (
        <ErrorState
          title="Unable to load beacon report"
          message={error ?? 'Something went wrong while contacting the backend.'}
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

          <BeaconReportKpis summary={report.summary} latestContext={report.latestContext} />

          <div className="grid gap-gutter lg:grid-cols-5">
            <div className="lg:col-span-2">
              <BeaconRoomChart rooms={report.rooms} />
            </div>
            <div className="lg:col-span-3">
              <BeaconEventsTable
                events={report.events}
                hasActiveFilter={hasActiveFilter}
                onClearFilters={handleClearFilters}
                note={report.notes?.distanceAccuracy}
              />
            </div>
          </div>
        </>
      ) : null}
    </motion.div>
  )
}

function PageHeader() {
  return (
    <div className="flex flex-col gap-2">
      <Badge tone="muted" leftIcon={<Radar className="h-3 w-3" />}>
        Approximate BLE proximity
      </Badge>
      <h1 className="text-3xl font-semibold tracking-tight text-on-surface">Beacon Reports</h1>
      <p className="text-sm text-on-surface-variant max-w-2xl">
        Review approximate beacon proximity events for the selected patient. Best-effort caregiver
        coordination data, not exact indoor tracking or a medical device.
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
