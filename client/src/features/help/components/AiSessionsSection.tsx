import { useCallback, useEffect, useRef, useState } from 'react'
import { Inbox, MessageCircle, RefreshCw, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { formatDateTime } from '@/utils/formatting'
import { api, ApiClientError } from '@/services/apiClient'
import type { AiSession, AiSessionStatus } from '@/types/domain'
import { AiSessionDetailModal } from './AiSessionDetailModal'

type SectionStatus = 'idle' | 'loading' | 'ready' | 'error'

interface AiSessionsSectionProps {
  patientId: string
  // Reports loaded sessions up to the page so the status strip can show counts
  // without issuing a second request. Must be stable (memoized) by the parent.
  onSessionsChange?: (sessions: AiSession[], status: SectionStatus) => void
}

const statusTone: Record<AiSessionStatus, 'danger' | 'accent' | 'muted'> = {
  active: 'danger',
  caregiver_joined: 'accent',
  resolved: 'muted',
}

// Secondary context: AI support sessions the patient app started. Presented in
// a quieter, full-width band below the primary contact and events zones.
export function AiSessionsSection({ patientId, onSessionsChange }: AiSessionsSectionProps) {
  const [sessions, setSessions] = useState<AiSession[]>([])
  const [status, setStatus] = useState<SectionStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const loadSessions = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setStatus('loading')
    setError(null)
    try {
      const data = await api.listAiSessions(patientId)
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
  }, [patientId])

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
            <div className="grid gap-3 md:grid-cols-2">
              {sessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  onOpen={() => setSelectedSessionId(session.id)}
                  onReload={onReload}
                />
              ))}
            </div>
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

function SessionRow({
  session,
  onOpen,
  onReload,
}: {
  session: AiSession
  onOpen: () => void
  onReload: () => void
}) {
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
        <Badge tone={statusTone[session.status]} dot>
          {session.status.replace('_', ' ')}
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
      {session.status === 'active' && (
        <div className="mt-3">
          <Button
            size="sm"
            leftIcon={<MessageCircle className="h-3.5 w-3.5" />}
            onClick={(e) => {
              e.stopPropagation()
              void api.caregiverJoinAiSession(session.id).then(onReload)
            }}
          >
            Join session
          </Button>
        </div>
      )}
    </div>
  )
}
