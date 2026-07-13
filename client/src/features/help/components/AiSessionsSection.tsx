import { type MouseEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Inbox, MessageCircle, RefreshCw, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { cn } from '@/utils/cn'
import { formatDateTime } from '@/utils/formatting'
import { api, ApiClientError } from '@/services/apiClient'
import type { AiSession, AiSessionDisplayStatus, AiSessionsQuery } from '@/types/domain'
import { isCurrentSession, resolveDisplayStatus } from './aiSessionDisplay'
import { AiSessionDetailModal } from './AiSessionDetailModal'

type SectionStatus = 'idle' | 'loading' | 'ready' | 'error'

interface AiSessionsSectionProps {
  patientId: string
  // Reports loaded sessions up to the page so the status strip can show counts
  // without issuing a second request. Must be stable (memoized) by the parent.
  onSessionsChange?: (sessions: AiSession[], status: SectionStatus) => void
}

const statusTone: Record<AiSessionDisplayStatus, 'danger' | 'accent' | 'muted'> = {
  Active: 'accent',
  'Caregiver joined': 'accent',
  Resolved: 'muted',
  Ended: 'muted',
  Failed: 'danger',
  Stale: 'muted',
}

// History window options. Default keeps the list short (latest 20) so it never
// loads the full audit log; wider windows are opt-in. No records are deleted —
// older sessions stay reachable by switching the range.
type HistoryRange = 'recent' | 'week' | 'all'

const RANGE_OPTIONS: { value: HistoryRange; label: string }[] = [
  { value: 'recent', label: 'Current & recent' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'all', label: 'All sessions' },
]

const RECENT_LIMIT = 20
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function rangeToQuery(range: HistoryRange): AiSessionsQuery {
  if (range === 'recent') return { limit: RECENT_LIMIT }
  if (range === 'week') return { from: new Date(Date.now() - WEEK_MS).toISOString() }
  return {}
}

// Secondary context: AI support sessions the patient app started. Presented in
// a quieter, full-width band below the primary contact and events zones.
export function AiSessionsSection({ patientId, onSessionsChange }: AiSessionsSectionProps) {
  const [sessions, setSessions] = useState<AiSession[]>([])
  const [status, setStatus] = useState<SectionStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [range, setRange] = useState<HistoryRange>('recent')
  const requestIdRef = useRef(0)

  const loadSessions = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setStatus('loading')
    setError(null)
    try {
      const data = await api.listAiSessions(patientId, rangeToQuery(range))
      if (requestId !== requestIdRef.current) return
      setSessions(data)
      setStatus('ready')
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      if (err instanceof ApiClientError) {
        setError(err.message)
      } else {
        setError('Unable to load AI sessions.')
      }
      setStatus('error')
    }
  }, [patientId, range])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  useEffect(() => {
    onSessionsChange?.(sessions, status)
  }, [sessions, status, onSessionsChange])

  const onReload = loadSessions

  return (
    <Card className="flex flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-container-high text-on-surface-variant">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-on-surface">AI support sessions</h2>
            <p className="text-xs text-text-muted">
              Conversations the patient app started for extra support. Review a transcript,
              join, or mark a session resolved.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onReload}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-on-surface-variant transition-colors hover:text-on-surface"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </header>

      <RangeControl range={range} onChange={setRange} disabled={status === 'loading'} />

      {status === 'loading' && sessions.length === 0 ? (
        <LoadingState label="Loading AI sessions…" />
      ) : status === 'error' && sessions.length === 0 ? (
        <ErrorState
          title="Unable to load AI sessions"
          message={error ?? 'Something went wrong. Please try again.'}
          onRetry={onReload}
        />
      ) : (
        <>
          {status === 'error' && error && (
            <div
              role="alert"
              className="rounded-xl border border-error/30 bg-error-container/60 px-3 py-2.5 text-sm font-medium text-error"
            >
              {error}
            </div>
          )}
          {sessions.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No AI support sessions"
              message="If the patient app starts a support conversation, it will be listed here."
            />
          ) : (
            <SessionGroups
              sessions={sessions}
              onOpen={setSelectedSessionId}
              onReload={onReload}
            />
          )}
        </>
      )}

      <AiSessionDetailModal
        sessionId={selectedSessionId}
        onClose={() => setSelectedSessionId(null)}
        onSessionUpdated={onReload}
      />
    </Card>
  )
}

function RangeControl({
  range,
  onChange,
  disabled,
}: {
  range: HistoryRange
  onChange: (range: HistoryRange) => void
  disabled?: boolean
}) {
  return (
    <div
      role="group"
      aria-label="Session history range"
      className="inline-flex flex-wrap gap-1 rounded-full bg-surface-container-low p-1"
    >
      {RANGE_OPTIONS.map((option) => {
        const active = option.value === range
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60',
              active
                ? 'bg-accent/10 text-accent-dark'
                : 'text-on-surface-variant hover:text-on-surface',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

// Keeps the current/live session visually first, with historical sessions in a
// clearly separated group below. Both remain visible; nothing is hidden.
function SessionGroups({
  sessions,
  onOpen,
  onReload,
}: {
  sessions: AiSession[]
  onOpen: (id: string) => void
  onReload: () => void
}) {
  const current = sessions.filter(isCurrentSession)
  const history = sessions.filter((s) => !isCurrentSession(s))

  return (
    <div className="flex flex-col gap-5">
      {current.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Current session
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {current.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                onOpen={() => onOpen(session.id)}
                onReload={onReload}
              />
            ))}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="flex flex-col gap-3">
          {current.length > 0 && (
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Recent history
            </p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {history.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                onOpen={() => onOpen(session.id)}
                onReload={onReload}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SessionRow({
  session,
  onOpen,
  onReload,
}: {
  session: AiSession
  onOpen: () => void
  onReload: () => void
}) {
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const displayStatus = resolveDisplayStatus(session)

  const handleJoin = async (e: MouseEvent) => {
    e.stopPropagation()
    // Backend is the source of truth: never attempt to join a non-joinable session.
    if (session.isJoinable !== true || joining) return
    setJoinError(null)
    setJoining(true)
    try {
      await api.caregiverJoinAiSession(session.id)
      onReload()
    } catch (err) {
      setJoinError(err instanceof ApiClientError ? err.message : 'Failed to join session.')
    } finally {
      setJoining(false)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className="cursor-pointer rounded-xl border border-outline-variant/30 bg-surface-bright p-4 transition-colors hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={statusTone[displayStatus]} dot>
          {displayStatus}
        </Badge>
        <span className="ml-auto text-xs text-text-muted">
          {formatDateTime(session.startedAt)}
        </span>
      </div>
      {session.summary ? (
        <p className="mt-3 line-clamp-2 text-sm text-on-surface-variant">{session.summary}</p>
      ) : (
        <p className="mt-3 text-sm italic text-text-muted">No summary recorded yet.</p>
      )}
      {session.messageCount !== undefined && (
        <p className="mt-2 text-xs text-text-muted">{session.messageCount} messages</p>
      )}
      {session.isJoinable === true && (
        <div className="mt-3">
          <Button
            size="sm"
            loading={joining}
            leftIcon={<MessageCircle className="h-3.5 w-3.5" />}
            onClick={handleJoin}
          >
            Join session
          </Button>
        </div>
      )}
      {joinError && (
        <p role="alert" className="mt-2 text-xs font-medium text-error">
          {joinError}
        </p>
      )}
    </div>
  )
}
