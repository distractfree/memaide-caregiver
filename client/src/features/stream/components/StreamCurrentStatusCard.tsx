import { ExternalLink, Video } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { StreamSourceBadge } from '@/features/stream/components/StreamSourceBadge'
import { StreamStatusBadge } from '@/features/stream/components/StreamStatusBadge'
import { formatDateTime, formatDurationSeconds } from '@/utils/formatting'
import type { StreamStatusSummary } from '@/types/domain'

interface Props {
  summary: StreamStatusSummary
}

function durationSeconds(startedAt: string | null, endedAt: string | null): number | null {
  if (!startedAt || !endedAt) return null
  const start = new Date(startedAt).getTime()
  const end = new Date(endedAt).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
  return Math.floor((end - start) / 1000)
}

// Use a real link so open-in-new-tab and screen readers work correctly.
const VIEWER_LINK_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-full border border-outline-variant bg-transparent px-4 h-9 text-[13px] font-semibold text-on-surface transition-all duration-300 ease-bezier hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background'

export function StreamCurrentStatusCard({ summary }: Props) {
  const { activeSession, latestSession, hasActiveStream, viewerAvailable } = summary

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface-container-high text-on-surface">
            <Video className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Current stream status
            </p>
            <h2 className="text-base font-semibold text-on-surface truncate">
              {summary.caregiverMessage}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasActiveStream && (
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full bg-accent animate-pulse"
            />
          )}
          <StreamStatusBadge status={summary.displayStatus} />
        </div>
      </div>

      {activeSession ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-outline-variant/40 bg-surface-section/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <StreamSourceBadge source={activeSession.source} />
            <span className="text-xs text-text-muted">
              Started {formatDateTime(activeSession.startedAt)}
            </span>
          </div>

          {viewerAvailable && activeSession.viewerUrl ? (
            <div className="flex flex-col gap-2">
              <a
                href={activeSession.viewerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={VIEWER_LINK_CLASSES}
              >
                <ExternalLink className="h-4 w-4" />
                <span>Open stream reference</span>
              </a>
              <p className="text-[11px] text-text-muted leading-relaxed">
                Availability depends on the patient&rsquo;s device, app, and network. This is a
                reference link &mdash; it does not guarantee a live video call.
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-text-muted">
              No viewer link is currently available for this session.
            </p>
          )}
        </div>
      ) : latestSession ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-outline-variant/40 bg-surface-section/60 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Most recent session
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <StreamStatusBadge status={latestSession.status} />
            <StreamSourceBadge source={latestSession.source} />
          </div>
          <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-text-muted">Started</dt>
              <dd className="text-on-surface">{formatDateTime(latestSession.startedAt)}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Ended</dt>
              <dd className="text-on-surface">{formatDateTime(latestSession.endedAt)}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Duration</dt>
              <dd className="text-on-surface">
                {formatDurationSeconds(
                  durationSeconds(latestSession.startedAt, latestSession.endedAt),
                )}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="text-sm text-on-surface-variant">
          No stream session is currently available.
        </p>
      )}
    </Card>
  )
}
