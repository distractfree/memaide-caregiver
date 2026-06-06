import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { formatDateTime } from '@/utils/formatting'
import { adminApi } from '../adminApi'

interface AdminAiSessionDetailModalProps {
  sessionId: string | null
  onClose: () => void
}

export function AdminAiSessionDetailModal({ sessionId, onClose }: AdminAiSessionDetailModalProps) {
  const [session, setSession] = useState<any | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    if (!sessionId) {
      setSession(null)
      setStatus('idle')
      return
    }

    let cancelled = false
    setStatus('loading')
    
    adminApi.getAiSessionById(sessionId)
      .then(data => {
        if (!cancelled) {
          setSession(data)
          setStatus('ready')
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message || 'Failed to load session details.')
          setStatus('error')
        }
      })

    return () => {
      cancelled = true
    }
  }, [sessionId])

  return (
    <Modal
      open={!!sessionId}
      onClose={onClose}
      title="Admin View: AI Support Session Details"
      description={session ? `Started at ${formatDateTime(session.startedAt)}` : ''}
      size="lg"
    >
      {status === 'loading' && <div className="py-12"><LoadingState label="Loading session..." /></div>}
      {status === 'error' && <div className="py-12"><ErrorState message={error || 'Error'} onRetry={onClose} /></div>}
      {status === 'ready' && session && (
        <div className="flex flex-col gap-6 mt-4">
          <div className="rounded-xl border border-warning/30 bg-warning-container/30 p-4">
            <p className="text-xs text-warning-dark">
              <strong>Admin Read-Only:</strong> You are viewing a scripted support session timeline. No modifications are permitted.
            </p>
          </div>
          <div className="flex items-center gap-4 border-b border-outline-variant/30 pb-4">
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase">Status</p>
              <p className="text-sm font-medium text-on-surface capitalize">{session.status.replace('_', ' ')}</p>
            </div>
            {session.caregiverJoinedAt && (
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase">Caregiver Joined</p>
                <p className="text-sm font-medium text-on-surface">{formatDateTime(session.caregiverJoinedAt)}</p>
              </div>
            )}
            {session.emergencySuggestedAt && (
              <div>
                <p className="text-xs font-semibold text-error uppercase flex items-center gap-1"><ShieldAlert className="w-3 h-3"/> Emergency Suggested</p>
                <p className="text-sm font-medium text-error">{formatDateTime(session.emergencySuggestedAt)}</p>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto max-h-[50vh] pr-2">
            {session.messages && session.messages.length > 0 ? (
              <div className="flex flex-col gap-4">
                {session.messages.map((msg: any) => (
                  <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                      msg.role === 'user' 
                        ? 'bg-primary text-white rounded-br-none' 
                        : msg.role === 'system'
                        ? 'bg-surface-dim text-text-muted text-xs italic border border-outline-variant/30 rounded-bl-none'
                        : 'bg-surface-container text-on-surface rounded-bl-none'
                    }`}>
                      {msg.content}
                    </div>
                    <span className="text-[10px] text-text-muted mt-1 px-1">{formatDateTime(msg.createdAt)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-muted italic text-center py-8">No messages recorded for this session.</p>
            )}
          </div>

          <div className="border-t border-outline-variant/30 pt-4 flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
