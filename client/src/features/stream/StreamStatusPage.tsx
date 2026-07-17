import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, Clock3, FileText, MessageCircle, RefreshCw, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { usePatients } from '@/features/patients/PatientContext'
import { EgocentricViewer } from '@/features/stream/components/EgocentricViewer'
import { StreamSessionHistory, type StreamFilterState } from '@/features/stream/components/StreamSessionHistory'
import { useLatestStreamFrame, type FrameViewerState } from '@/features/stream/useLatestStreamFrame'
import { useStreamStatus } from '@/features/stream/useStreamStatus'
import { AiSessionPanel } from '@/features/ai-sessions/components/AiSessionPanel'
import { useAiSessionDetail } from '@/features/ai-sessions/hooks/useAiSessionDetail'
import { resolveStreamSessionAction } from '@/features/ai-sessions/aiSessionUi'
import { formatDateTime } from '@/utils/formatting'
import type { StreamSessionsQuery, StreamStatusSummary } from '@/types/domain'

const INITIAL_FILTERS: StreamFilterState = {
  status: '',
  source: '',
  from: null,
  to: null,
}

function viewerStateForSummary(
  summary: StreamStatusSummary | null,
  frameState: FrameViewerState,
): FrameViewerState | 'unavailable' | 'ended' | 'failed' {
  if (summary?.activeSession) return frameState
  if (summary?.displayStatus === 'failed') return 'failed'
  if (summary?.displayStatus === 'ended') return 'ended'
  return 'unavailable'
}

export function StreamStatusPage() {
  const { selectedPatientId } = usePatients()
  const [filters, setFilters] = useState<StreamFilterState>(INITIAL_FILTERS)
  const prefersReducedMotion = useReducedMotion()

  const validationError = useMemo<string | null>(() => {
    if (filters.from && filters.to && filters.from > filters.to) {
      return 'Start date must be on or before end date.'
    }
    return null
  }, [filters.from, filters.to])

  const historyQuery = useMemo<StreamSessionsQuery>(
    () => ({
      status: filters.status || undefined,
      source: filters.source || undefined,
      // Send whole UTC dates so the user-selected end date remains inclusive.
      from: filters.from ? `${filters.from}T00:00:00.000Z` : undefined,
      to: filters.to ? `${filters.to}T23:59:59.999Z` : undefined,
    }),
    [filters],
  )

  const {
    summary,
    sessions,
    status,
    error,
    isRefreshing: isStatusRefreshing,
    refresh: refreshStatus,
  } = useStreamStatus({
    patientId: selectedPatientId,
    historyQuery,
    // Invalid history filters pause only the history request; status remains
    // near-real-time and the existing data remains on screen.
    historyEnabled: !validationError,
  })

  const activeSession = summary?.activeSession ?? null
  const {
    frame,
    state: frameState,
    isRefreshing: isFrameRefreshing,
    refresh: refreshFrame,
  } = useLatestStreamFrame({
    patientId: selectedPatientId,
    streamSessionId: activeSession?.id ?? null,
    enabled: Boolean(activeSession),
  })

  const refresh = useCallback(() => {
    refreshStatus()
    refreshFrame()
  }, [refreshFrame, refreshStatus])

  // The exact AI session linked to the *active* glasses stream. Sourced only
  // from activeSession.aiSessionId — never a "newest patient session" guess.
  const linkedAiSessionId = activeSession?.aiSessionId ?? null
  const [isSessionPanelOpen, setIsSessionPanelOpen] = useState(false)

  const sessionDetail = useAiSessionDetail({
    sessionId: linkedAiSessionId,
    patientId: selectedPatientId,
    // Fetch a single authoritative snapshot whenever a linked session exists so
    // the header can label Join vs Open; only poll while the panel is open.
    enabled: Boolean(linkedAiSessionId),
    poll: isSessionPanelOpen,
  })
  const streamSessionAction = resolveStreamSessionAction(linkedAiSessionId, sessionDetail.session)

  // Close the panel the moment the linked session disappears or the patient
  // changes, so a previous session's data can never linger.
  useEffect(() => {
    if (!linkedAiSessionId) setIsSessionPanelOpen(false)
  }, [linkedAiSessionId])
  useEffect(() => {
    setIsSessionPanelOpen(false)
  }, [selectedPatientId])

  const handleSessionAction = useCallback(() => {
    setIsSessionPanelOpen(true)
    if (streamSessionAction.kind === 'join') {
      void sessionDetail.join().then(() => refresh())
    }
  }, [refresh, sessionDetail, streamSessionAction.kind])

  function handleClearFilters() {
    setFilters({ ...INITIAL_FILTERS })
  }

  if (!selectedPatientId) {
    return (
      <motion.div
        className="flex flex-col gap-6"
        initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
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
  const viewerState = viewerStateForSummary(summary, frameState)
  const isRefreshing = isStatusRefreshing || isFrameRefreshing

  const sessionHeaderAction =
    streamSessionAction.kind === 'none' || !activeSession ? null : (
      <Button
        size="sm"
        variant={streamSessionAction.kind === 'join' ? 'primary' : 'outline'}
        loading={streamSessionAction.kind === 'join' && sessionDetail.joining}
        leftIcon={
          streamSessionAction.kind === 'view' ? (
            <FileText className="h-3.5 w-3.5" />
          ) : (
            <MessageCircle className="h-3.5 w-3.5" />
          )
        }
        onClick={handleSessionAction}
      >
        {streamSessionAction.label}
      </Button>
    )

  return (
    <motion.div
      className="flex flex-col gap-6"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
    >
      <PageHeader
        isRefreshing={isRefreshing}
        onRefresh={refresh}
        lastFrameReceivedAt={frame?.receivedAt ?? null}
      />

      {showInitialLoader ? (
        <LoadingState label="Loading stream status…" />
      ) : showFatalError ? (
        <ErrorState
          title="Unable to load stream status"
          message={error ?? 'Something went wrong. Please try again.'}
          onRetry={refresh}
        />
      ) : (
        <>
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-error/30 bg-error-container/60 px-3 py-2.5 text-sm font-medium text-error"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error} Showing the last update — retrying automatically.</span>
            </div>
          )}

          {summary && (
            <EgocentricViewer
              state={viewerState}
              imageSrc={viewerState === 'ended' || viewerState === 'failed' ? null : frame?.imageSrc ?? null}
              startedAt={activeSession?.startedAt}
              receivedAt={frame?.receivedAt}
              headerAction={sessionHeaderAction}
            />
          )}

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

      <AiSessionPanel
        open={isSessionPanelOpen}
        onClose={() => setIsSessionPanelOpen(false)}
        detail={sessionDetail}
        onSessionUpdated={refresh}
      />
    </motion.div>
  )
}

interface PageHeaderProps {
  isRefreshing?: boolean
  lastFrameReceivedAt?: string | null
  onRefresh?: () => void
}

function PageHeader({ isRefreshing = false, lastFrameReceivedAt, onRefresh }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-on-surface">Stream Status</h1>
      </div>
      {onRefresh && (
        <div className="flex flex-col gap-2 sm:items-end">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />}
            disabled={isRefreshing}
            onClick={onRefresh}
          >
            Refresh
          </Button>
          <p className="inline-flex items-center gap-1.5 text-xs text-text-muted">
            <Clock3 className="h-3.5 w-3.5" />
            {lastFrameReceivedAt
              ? `Last frame ${formatDateTime(lastFrameReceivedAt)}`
              : 'No frame received yet'}
          </p>
        </div>
      )}
    </div>
  )
}
