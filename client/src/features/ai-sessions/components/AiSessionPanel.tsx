import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Info, MessageCircle, RefreshCw, ShieldAlert, X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { formatDateTime } from '@/utils/formatting'
import { cn } from '@/utils/cn'
import type { AiSession, AiSessionDisplayStatus, AiSessionMessage } from '@/types/domain'
import { isTerminalAiSession, resolveDisplayStatus } from '@/features/ai-sessions/aiSessionUi'
import type { UseAiSessionDetailResult } from '@/features/ai-sessions/hooks/useAiSessionDetail'

const RESOLVE_SUMMARY_MAX_LENGTH = 1000

const statusTone: Record<AiSessionDisplayStatus, 'danger' | 'accent' | 'muted'> = {
  Active: 'accent',
  'Caregiver joined': 'accent',
  Resolved: 'muted',
  Ended: 'muted',
  Failed: 'danger',
  Stale: 'muted',
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface AiSessionPanelProps {
  open: boolean
  onClose: () => void
  detail: UseAiSessionDetailResult
  // Notifies the host (Help list / Stream status) to refetch after a mutation.
  onSessionUpdated?: () => void
}

/**
 * Shared, read-only AI-session panel used by both the Help page and Stream
 * Status. It renders as a right-side drawer on desktop (frames stay visible)
 * and a bottom sheet on mobile. Phase 2 is deliberately read-only: it shows the
 * transcript/activity and offers Join/Resolve, but never a message composer.
 */
export function AiSessionPanel({ open, onClose, detail, onSessionUpdated }: AiSessionPanelProps) {
  const { session, status, error, isRefreshing, lastUpdatedAt, joining, resolving, actionError } =
    detail

  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)

  const [showResolveForm, setShowResolveForm] = useState(false)
  const [resolveSummary, setResolveSummary] = useState('')
  const [resolveValidationError, setResolveValidationError] = useState<string | null>(null)

  // Reset the per-session action UI whenever a different session opens/closes.
  useEffect(() => {
    setShowResolveForm(false)
    setResolveSummary('')
    setResolveValidationError(null)
  }, [session?.id, open])

  // Escape to close.
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  // Focus management: focus into the panel on open, restore focus on close.
  useEffect(() => {
    if (!open) return
    previousActiveElementRef.current = document.activeElement as HTMLElement | null
    const focusTarget =
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? panelRef.current
    const t = window.setTimeout(() => focusTarget?.focus(), 30)
    return () => {
      window.clearTimeout(t)
      const prev = previousActiveElementRef.current
      if (prev && typeof prev.focus === 'function') prev.focus()
    }
  }, [open])

  // Simple focus trap so Tab stays inside the dialog.
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab' || !panelRef.current) return
    const focusable = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement)
    if (focusable.length === 0) return
    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  async function handleJoin() {
    await detail.join()
    onSessionUpdated?.()
  }

  function openResolveForm() {
    detail.clearActionError()
    setResolveValidationError(null)
    setShowResolveForm(true)
  }

  async function handleResolveSubmit() {
    const trimmed = resolveSummary.trim()
    if (trimmed.length === 0) {
      setResolveValidationError('Enter a short resolution summary before resolving.')
      return
    }
    if (trimmed.length > RESOLVE_SUMMARY_MAX_LENGTH) {
      setResolveValidationError(
        `Keep the summary under ${RESOLVE_SUMMARY_MAX_LENGTH} characters.`,
      )
      return
    }
    setResolveValidationError(null)
    const ok = await detail.resolve(trimmed)
    if (ok) {
      onSessionUpdated?.()
      onClose()
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Mobile-only dimming backdrop. On desktop the drawer sits beside the
              still-visible frame, so no backdrop is rendered there. */}
          <motion.div
            key="ai-panel-backdrop"
            className="fixed inset-0 z-[60] bg-black/40 sm:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            key="ai-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onKeyDown={handleKeyDown}
            className={cn(
              'fixed z-[61] flex flex-col bg-surface-container-lowest shadow-card-hover',
              // Mobile: bottom sheet.
              'inset-x-0 bottom-0 max-h-[88vh] rounded-t-2xl border border-outline-variant/30',
              // Desktop: right-side drawer.
              'sm:inset-y-0 sm:right-0 sm:left-auto sm:bottom-auto sm:h-full sm:w-[min(440px,40vw)] sm:max-h-none sm:rounded-none sm:border-l sm:border-y-0 sm:border-r-0',
            )}
            initial={{ opacity: 0, x: 24, y: 24 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: 12, y: 12 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <header className="flex items-start justify-between gap-3 border-b border-outline-variant/30 p-4">
              <div className="min-w-0">
                <h2 id={titleId} className="text-base font-semibold text-on-surface">
                  AI support session
                </h2>
                <p className="text-xs text-text-muted">
                  {session ? `Started ${formatDateTime(session.startedAt)}` : 'Loading session…'}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {session && (
                  <button
                    type="button"
                    onClick={detail.refresh}
                    disabled={isRefreshing}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-on-surface-variant transition-colors hover:text-on-surface disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <RefreshCw
                      className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')}
                      aria-hidden
                    />
                    Refresh
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4">
              {status === 'loading' && !session ? (
                <div className="py-12">
                  <LoadingState label="Loading session…" />
                </div>
              ) : status === 'error' && !session ? (
                <div className="py-12">
                  <ErrorState message={error || 'Unable to load session details.'} onRetry={detail.refresh} />
                </div>
              ) : session ? (
                <SessionBody session={session} lastUpdatedAt={lastUpdatedAt} />
              ) : null}
            </div>

            {session && (
              <footer className="flex flex-col gap-3 border-t border-outline-variant/30 p-4">
                {actionError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-error/30 bg-error-container/60 px-3 py-2.5 text-sm font-medium text-error"
                  >
                    {actionError}
                  </div>
                )}

                {showResolveForm ? (
                  <div className="flex flex-col gap-2">
                    <label
                      htmlFor="ai-session-resolve-summary"
                      className="text-[13px] font-semibold text-on-surface-variant"
                    >
                      Resolution summary
                    </label>
                    <textarea
                      id="ai-session-resolve-summary"
                      value={resolveSummary}
                      onChange={(e) => setResolveSummary(e.target.value)}
                      rows={3}
                      maxLength={RESOLVE_SUMMARY_MAX_LENGTH}
                      placeholder="Briefly describe how this session was resolved…"
                      className="w-full rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface placeholder:text-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    {resolveValidationError && (
                      <p role="alert" className="text-xs font-medium text-error">
                        {resolveValidationError}
                      </p>
                    )}
                    <div className="flex justify-end gap-3">
                      <Button
                        variant="ghost"
                        onClick={() => setShowResolveForm(false)}
                        disabled={resolving}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleResolveSubmit}
                        loading={resolving}
                        leftIcon={<CheckCircle2 className="h-4 w-4" />}
                      >
                        Confirm resolve
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap justify-end gap-3">
                    <Button variant="outline" onClick={onClose}>
                      Close
                    </Button>
                    {session.isJoinable === true && (
                      <Button
                        onClick={handleJoin}
                        loading={joining}
                        leftIcon={<MessageCircle className="h-4 w-4" />}
                      >
                        Join session
                      </Button>
                    )}
                    {session.status === 'caregiver_joined' && !isTerminalAiSession(session) && (
                      <Button
                        onClick={openResolveForm}
                        leftIcon={<CheckCircle2 className="h-4 w-4" />}
                      >
                        Resolve session
                      </Button>
                    )}
                  </div>
                )}
              </footer>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function SessionBody({
  session,
  lastUpdatedAt,
}: {
  session: AiSession
  lastUpdatedAt: number | null
}) {
  const displayStatus = resolveDisplayStatus(session)
  const terminal = isTerminalAiSession(session)
  const messages = session.messages ?? []

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={statusTone[displayStatus]} dot>
          {displayStatus}
        </Badge>
        {lastUpdatedAt !== null && (
          <span className="ml-auto text-[11px] text-text-muted">
            Last updated {formatClockTime(lastUpdatedAt)}
          </span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
        <Fact label="Started" value={formatDateTime(session.startedAt)} />
        <Fact label="Last activity" value={formatDateTime(session.lastActivityAt ?? session.updatedAt)} />
        {session.caregiverJoinedAt && (
          <Fact label="Caregiver joined" value={formatDateTime(session.caregiverJoinedAt)} />
        )}
        {session.endedAt && <Fact label="Ended" value={formatDateTime(session.endedAt)} />}
        {session.emergencySuggestedAt && (
          <div className="col-span-2 flex items-center gap-1.5 text-error">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
            <span className="text-xs font-semibold">
              Escalation suggested {formatDateTime(session.emergencySuggestedAt)}
            </span>
          </div>
        )}
      </dl>

      {session.summary && terminal && (
        <div className="rounded-xl border border-outline-variant/30 bg-surface-bright p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Summary
          </p>
          <p className="mt-1 text-sm text-on-surface-variant">{session.summary}</p>
        </div>
      )}

      {/* Truthful capability notice: joining is monitoring, not messaging. */}
      <div className="flex items-start gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-2.5 text-xs text-on-surface-variant">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-on-surface-variant" aria-hidden />
        <p>
          Joining records that you are monitoring this session. Direct messaging is not available
          in this version.
        </p>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Session activity
        </p>
        {messages.length > 0 ? (
          <div className="flex flex-col gap-4">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm italic text-text-muted">
            {terminal
              ? 'No messages recorded for this session.'
              : 'No session activity has been recorded yet.'}
          </p>
        )}
      </div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-text-muted">{label}</dt>
      <dd className="font-medium text-on-surface">{value}</dd>
    </div>
  )
}

// Renders one transcript entry. Roles come from the canonical API DTO:
//   user      -> patient (right, primary)
//   caregiver -> caregiver reply (right, accent — distinct from the patient)
//   assistant -> AI (left, neutral bubble)
//   system    -> lifecycle/event notice (centered, quiet)
function MessageBubble({ message }: { message: AiSessionMessage }) {
  const { role, content, createdAt } = message

  if (role === 'system') {
    return (
      <div className="flex flex-col items-center">
        <div className="max-w-[90%] rounded-full border border-outline-variant/30 bg-surface-dim px-3 py-1 text-center text-xs italic text-text-muted">
          {content}
        </div>
        <span className="mt-1 px-1 text-[10px] text-text-muted">{formatDateTime(createdAt)}</span>
      </div>
    )
  }

  const alignEnd = role === 'user' || role === 'caregiver'
  const bubbleTone =
    role === 'user'
      ? 'rounded-br-none bg-primary text-white'
      : role === 'caregiver'
        ? 'rounded-br-none bg-accent/15 text-accent-dark'
        : 'rounded-bl-none bg-surface-container text-on-surface'

  return (
    <div className={`flex flex-col ${alignEnd ? 'items-end' : 'items-start'}`}>
      {role === 'caregiver' && (
        <span className="mb-0.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-accent-dark">
          Caregiver
        </span>
      )}
      <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${bubbleTone}`}>{content}</div>
      <span className="mt-1 px-1 text-[10px] text-text-muted">{formatDateTime(createdAt)}</span>
    </div>
  )
}

function formatClockTime(epochMs: number): string {
  const d = new Date(epochMs)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}
