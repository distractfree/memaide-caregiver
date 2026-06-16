import { useEffect, useRef, useState, useCallback } from 'react'
import { Inbox, MessageCircle, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { formatDateTime } from '@/utils/formatting'
import { api, ApiClientError } from '@/services/apiClient'
import type { AiSession } from '@/types/domain'
import { AiSessionDetailModal } from './AiSessionDetailModal'

interface AiSessionsSectionProps {
  patientId: string
}

export function AiSessionsSection({ patientId }: AiSessionsSectionProps) {
  const [sessions, setSessions] = useState<AiSession[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
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

  return (
    <Card className="flex flex-col gap-5 mt-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <MessageCircle className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-on-surface">AI Support Sessions</h2>
            <p className="text-xs text-text-muted">
              Auto-initiated conversations when the patient triggers a help event.
            </p>
          </div>
        </div>
        <button 
          onClick={() => loadSessions()}
          className="flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
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
          onRetry={loadSessions}
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
          {sessions.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No AI support sessions yet"
              message="When the patient requests help, AI sessions will appear here."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {sessions.map((session) => (
                <div 
                  key={session.id} 
                  className="relative rounded-xl border border-outline-variant/30 bg-surface-bright p-4 cursor-pointer hover:bg-surface-container-low transition-colors"
                  onClick={() => setSelectedSessionId(session.id)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${
                      session.status === 'active' ? 'bg-error/10 text-error' :
                      session.status === 'caregiver_joined' ? 'bg-primary/10 text-primary' :
                      'bg-surface-dim text-on-surface-variant border border-outline-variant'
                    }`}>
                      {session.status.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className="ml-auto text-xs text-text-muted">
                      {formatDateTime(session.startedAt)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-on-surface font-medium">
                    Session ID: <span className="font-mono text-xs font-normal text-on-surface-variant">{session.id}</span>
                  </p>
                  {session.summary && (
                    <p className="mt-2 text-sm text-on-surface-variant">
                      <span className="font-medium text-on-surface">Summary:</span> {session.summary}
                    </p>
                  )}
                  {session.messageCount !== undefined && (
                    <p className="mt-2 text-xs text-text-muted">
                      {session.messageCount} messages
                    </p>
                  )}
                  {session.status === 'active' && (
                    <div className="mt-4 flex">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          api.caregiverJoinAiSession(session.id).then(() => loadSessions());
                        }}
                        className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90"
                      >
                        Join Session
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <AiSessionDetailModal
        sessionId={selectedSessionId}
        onClose={() => setSelectedSessionId(null)}
        onSessionUpdated={loadSessions}
      />
    </Card>
  )
}
