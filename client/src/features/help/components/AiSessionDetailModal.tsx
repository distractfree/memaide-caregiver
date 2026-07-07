import { useEffect, useState } from 'react'
import { MessageCircle, ShieldAlert, CheckCircle2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { formatDateTime } from '@/utils/formatting'
import { api, ApiClientError } from '@/services/apiClient'
import type { AiSession } from '@/types/domain'

interface AiSessionDetailModalProps {
  sessionId: string | null
  onClose: () => void
  onSessionUpdated: () => void
}

export function AiSessionDetailModal({ sessionId, onClose, onSessionUpdated }: AiSessionDetailModalProps) {
  const [session, setSession] = useState<AiSession | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [showResolveForm, setShowResolveForm] = useState(false)
  const [resolveSummary, setResolveSummary] = useState('')

  useEffect(() => {
    if (!sessionId) {
      setSession(null)
      setStatus('idle')
      return
    }

    // Reset per-session action UI when opening a different session.
    setActionError(null)
    setShowResolveForm(false)
    setResolveSummary('')

    let cancelled = false
    setStatus('loading')

    api.getAiSessionById(sessionId)
      .then(data => {
        if (!cancelled) {
          setSession(data)
          setStatus('ready')
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Failed to load session details.')
          setStatus('error')
        }
      })

    return () => {
      cancelled = true
    }
  }, [sessionId])

  const handleJoin = async () => {
    if (!session) return
    setActionError(null)
    setJoining(true)
    try {
      await api.caregiverJoinAiSession(session.id)
      onSessionUpdated()
      onClose()
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Failed to join session.')
    } finally {
      setJoining(false)
    }
  }

  const handleResolve = async () => {
    if (!session) return
    setActionError(null)
    setResolving(true)
    try {
      const summary = resolveSummary.trim()
      await api.resolveAiSession(session.id, summary.length > 0 ? summary : 'Resolved by caregiver')
      onSessionUpdated()
      onClose()
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Failed to resolve session.')
    } finally {
      setResolving(false)
    }
  }

  return (
    <Modal
      open={!!sessionId}
      onClose={onClose}
      title="AI support session"
      description={session ? `Started ${formatDateTime(session.startedAt)}` : ''}
      size="lg"
    >
      {status === 'loading' && <div className="py-12"><LoadingState label="Loading session…" /></div>}
      {status === 'error' && <div className="py-12"><ErrorState message={error || 'Error'} onRetry={onClose} /></div>}
      {status === 'ready' && session && (
        <div className="mt-4 flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-outline-variant/30 pb-4">
            <div>
              <p className="text-xs font-semibold uppercase text-text-muted">Status</p>
              <p className="text-sm font-medium capitalize text-on-surface">{session.status.replace('_', ' ')}</p>
            </div>
            {session.caregiverJoinedAt && (
              <div>
                <p className="text-xs font-semibold uppercase text-text-muted">Caregiver joined</p>
                <p className="text-sm font-medium text-on-surface">{formatDateTime(session.caregiverJoinedAt)}</p>
              </div>
            )}
            {session.emergencySuggestedAt && (
              <div>
                <p className="flex items-center gap-1 text-xs font-semibold uppercase text-error"><ShieldAlert className="h-3 w-3" /> Escalation suggested</p>
                <p className="text-sm font-medium text-error">{formatDateTime(session.emergencySuggestedAt)}</p>
              </div>
            )}
          </div>

          <div className="max-h-[50vh] flex-1 overflow-y-auto pr-2">
            {session.messages && session.messages.length > 0 ? (
              <div className="flex flex-col gap-4">
                {session.messages.map(msg => (
                  <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                      msg.role === 'user'
                        ? 'rounded-br-none bg-primary text-white'
                        : msg.role === 'system'
                        ? 'rounded-bl-none border border-outline-variant/30 bg-surface-dim text-xs italic text-text-muted'
                        : 'rounded-bl-none bg-surface-container text-on-surface'
                    }`}>
                      {msg.content}
                    </div>
                    <span className="mt-1 px-1 text-[10px] text-text-muted">{formatDateTime(msg.createdAt)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm italic text-text-muted">No messages recorded for this session.</p>
            )}
          </div>

          {actionError && (
            <div
              role="alert"
              className="rounded-xl border border-error/30 bg-error-container/60 px-3 py-2.5 text-sm font-medium text-error"
            >
              {actionError}
            </div>
          )}

          {showResolveForm && (
            <div className="flex flex-col gap-2">
              <label htmlFor="resolve-summary" className="text-[13px] font-semibold text-on-surface-variant">
                Resolution summary <span className="font-normal text-text-muted">(optional)</span>
              </label>
              <textarea
                id="resolve-summary"
                value={resolveSummary}
                onChange={(e) => setResolveSummary(e.target.value)}
                rows={3}
                placeholder="Brief note on how this was resolved…"
                className="w-full rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface placeholder:text-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-3 border-t border-outline-variant/30 pt-4">
            {showResolveForm ? (
              <>
                <Button variant="ghost" onClick={() => setShowResolveForm(false)} disabled={resolving}>
                  Cancel
                </Button>
                <Button onClick={handleResolve} loading={resolving} leftIcon={<CheckCircle2 className="h-4 w-4" />}>
                  Confirm resolve
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={onClose}>Close</Button>
                {session.status === 'active' && (
                  <Button onClick={handleJoin} loading={joining} leftIcon={<MessageCircle className="h-4 w-4" />}>
                    Join session
                  </Button>
                )}
                {session.status === 'caregiver_joined' && (
                  <Button onClick={() => setShowResolveForm(true)} leftIcon={<CheckCircle2 className="h-4 w-4" />}>
                    Resolve session
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
