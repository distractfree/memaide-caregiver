import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle, X } from 'lucide-react'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { formatDateTime } from '@/utils/formatting'
import { adminApi } from '../adminApi'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

interface AdminAiSessionDetailModalProps {
  sessionId: string | null
  onClose: () => void
}

function getTimelineClass(role: string): string {
  switch (role) {
    case 'user':
      return 'patient'
    case 'system':
      return 'system'
    default:
      return 'assistant'
  }
}

function getTimelineLabel(role: string): string {
  switch (role) {
    case 'user':
      return 'Patient'
    case 'system':
      return 'System'
    default:
      return 'Assistant'
  }
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

    adminApi
      .getAiSessionById(sessionId)
      .then((data) => {
        if (!cancelled) {
          setSession(data)
          setStatus('ready')
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Failed to load session details.')
          setStatus('error')
        }
      })

    return () => {
      cancelled = true
    }
  }, [sessionId])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {!!sessionId && (
        <>
          {/* Backdrop */}
          <motion.div
            key="adm-modal-backdrop"
            className="fixed inset-0 z-[60]"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />

          {/* Modal */}
          <div
            className="fixed inset-0 z-[61] flex items-center justify-center"
            style={{ padding: 16, pointerEvents: 'none' }}
          >
            <motion.div
              key="adm-modal-panel"
              style={{
                width: '100%',
                maxWidth: 640,
                maxHeight: '90vh',
                overflowY: 'auto',
                backgroundColor: '#FFFFFF',
                borderRadius: 16,
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                pointerEvents: 'auto',
              }}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 4 }}
              transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                style={{
                  padding: 24,
                  borderBottom: '1px solid #E2E8F0',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0F172A', margin: 0 }}>
                    AI Session Details
                  </h2>
                  {session && (
                    <p style={{ fontSize: 14, color: '#475569', marginTop: 4 }}>
                      Started at {formatDateTime(session.startedAt)}
                    </p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 8,
                    color: '#475569',
                    borderRadius: 8,
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: 24 }}>
                {status === 'loading' && (
                  <div style={{ padding: '48px 0', textAlign: 'center' }}>
                    <LoadingState label="Loading session..." />
                  </div>
                )}

                {status === 'error' && (
                  <div style={{ padding: '48px 0' }}>
                    <ErrorState message={error || 'Error'} onRetry={onClose} />
                  </div>
                )}

                {status === 'ready' && session && (
                  <>
                    {/* Status badges */}
                    <div className="adm-modal-section">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <span
                          className={`adm-badge ${session.status === 'active' ? 'adm-badge-active' : 'adm-badge-closed'}`}
                        >
                          {session.status === 'active' ? 'Active' : session.status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                        </span>
                        {session.emergencySuggestedAt && (
                          <span className="adm-badge adm-badge-emergency">
                            <AlertTriangle className="h-3 w-3" />
                            Emergency Suggested
                          </span>
                        )}
                        {!session.emergencySuggestedAt && (
                          <span className="adm-badge adm-badge-no-emergency">
                            <CheckCircle className="h-3 w-3" />
                            No Emergency
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Metadata grid */}
                    <div className="adm-modal-section">
                      <div className="adm-modal-grid">
                        <div>
                          <p className="adm-modal-field-label">Patient</p>
                          <p className="adm-modal-field-value">{session.patientName || '—'}</p>
                        </div>
                        <div>
                          <p className="adm-modal-field-label">Caregiver</p>
                          <p className="adm-modal-field-value">{session.caregiverName || '—'}</p>
                        </div>
                        <div>
                          <p className="adm-modal-field-label">Started</p>
                          <p className="adm-modal-field-value">{formatDateTime(session.startedAt)}</p>
                        </div>
                        <div>
                          <p className="adm-modal-field-label">Messages</p>
                          <p className="adm-modal-field-value">{session.messageCount ?? session.messages?.length ?? 0}</p>
                        </div>
                        {session.caregiverJoinedAt && (
                          <div>
                            <p className="adm-modal-field-label">Caregiver Joined</p>
                            <p className="adm-modal-field-value">{formatDateTime(session.caregiverJoinedAt)}</p>
                          </div>
                        )}
                        {session.emergencySuggestedAt && (
                          <div>
                            <p className="adm-modal-field-label" style={{ color: '#DC2626' }}>Emergency Suggested At</p>
                            <p className="adm-modal-field-value" style={{ color: '#DC2626' }}>
                              {formatDateTime(session.emergencySuggestedAt)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* High-risk banner */}
                    {session.emergencySuggestedAt && (
                      <div className="adm-modal-section">
                        <div className="adm-alert-banner">
                          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                          High-risk language detected. Caregiver review recommended.
                        </div>
                      </div>
                    )}

                    {/* Message Timeline */}
                    <div className="adm-modal-section" style={{ borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0F172A', marginBottom: 16 }}>
                        Message Timeline
                      </h3>
                      {session.messages && session.messages.length > 0 ? (
                        <div className="adm-timeline" style={{ maxHeight: '40vh', overflowY: 'auto', paddingRight: 4 }}>
                          {session.messages.map((msg: any) => (
                            <div
                              key={msg.id}
                              className={`adm-timeline-item ${getTimelineClass(msg.role)}`}
                            >
                              <p className="adm-timeline-label">{getTimelineLabel(msg.role)}</p>
                              <p className="adm-timeline-text">{msg.content}</p>
                              <p style={{ fontSize: 10, opacity: 0.6, marginTop: 8 }}>
                                {formatDateTime(msg.createdAt)}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ fontSize: 14, color: '#94A3B8', fontStyle: 'italic', textAlign: 'center', padding: '32px 0' }}>
                          No messages recorded for this session.
                        </p>
                      )}
                    </div>

                    {/* Footer */}
                    <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 16, marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
                      <button className="adm-table-action" onClick={onClose} style={{ padding: '8px 16px' }}>
                        Close
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
