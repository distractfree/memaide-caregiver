import { motion } from 'framer-motion'
import { Video } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { StreamSourceBadge } from '@/features/stream/components/StreamSourceBadge'
import { StreamStatusBadge } from '@/features/stream/components/StreamStatusBadge'
import { formatDateTime, formatDurationSeconds } from '@/utils/formatting'
import type { StreamSession } from '@/types/domain'

interface Props {
  sessions: StreamSession[]
  hasActiveFilter: boolean
  onClearFilters: () => void
}

function durationSeconds(startedAt: string | null, endedAt: string | null): number | null {
  if (!startedAt || !endedAt) return null
  const start = new Date(startedAt).getTime()
  const end = new Date(endedAt).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
  return Math.floor((end - start) / 1000)
}

export function StreamSessionHistory({ sessions, hasActiveFilter, onClearFilters }: Props) {
  if (sessions.length === 0) {
    if (hasActiveFilter) {
      return (
        <Card className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm font-semibold text-on-surface">
            No stream sessions match the selected filters.
          </p>
          <p className="text-xs text-on-surface-variant">
            Try widening the date range or clearing filters.
          </p>
          <Button variant="outline" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        </Card>
      )
    }
    return (
      <EmptyState
        icon={Video}
        title="No stream sessions found yet."
        message="When the patient app or smart-glasses session emits stream events, they will appear here."
      />
    )
  }

  return (
    <Card padded={false}>
      <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-on-surface">Session history</h2>
          <p className="text-xs text-text-muted">
            {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}, newest first.
          </p>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-section/60 text-[11px] uppercase tracking-wider text-text-muted">
            <tr>
              <th scope="col" className="px-5 py-3 text-left font-semibold">Started</th>
              <th scope="col" className="px-5 py-3 text-left font-semibold">Ended</th>
              <th scope="col" className="px-5 py-3 text-left font-semibold">Status</th>
              <th scope="col" className="px-5 py-3 text-left font-semibold">Source</th>
              <th scope="col" className="px-5 py-3 text-left font-semibold">Duration</th>
              <th scope="col" className="px-5 py-3 text-left font-semibold">Help event</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/20">
            {sessions.map((s, idx) => (
              <motion.tr
                key={s.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: Math.min(idx, 6) * 0.02 }}
                className="bg-surface-container-lowest"
              >
                <td className="px-5 py-3 text-on-surface">{formatDateTime(s.startedAt)}</td>
                <td className="px-5 py-3 text-on-surface">{formatDateTime(s.endedAt)}</td>
                <td className="px-5 py-3"><StreamStatusBadge status={s.status} /></td>
                <td className="px-5 py-3"><StreamSourceBadge source={s.source} /></td>
                <td className="px-5 py-3 text-on-surface">
                  {formatDurationSeconds(durationSeconds(s.startedAt, s.endedAt))}
                </td>
                <td className="px-5 py-3">
                  {s.helpEventId ? (
                    <Badge tone="muted">Linked</Badge>
                  ) : (
                    <span className="text-text-muted">&mdash;</span>
                  )}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards */}
      <ul className="md:hidden divide-y divide-outline-variant/20">
        {sessions.map((s, idx) => (
          <motion.li
            key={s.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: Math.min(idx, 6) * 0.02 }}
            className="flex flex-col gap-2 px-5 py-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <StreamStatusBadge status={s.status} />
              <StreamSourceBadge source={s.source} />
              {s.helpEventId && <Badge tone="muted">Linked help event</Badge>}
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-text-muted">Started</dt>
              <dd className="text-on-surface">{formatDateTime(s.startedAt)}</dd>
              <dt className="text-text-muted">Ended</dt>
              <dd className="text-on-surface">{formatDateTime(s.endedAt)}</dd>
              <dt className="text-text-muted">Duration</dt>
              <dd className="text-on-surface">
                {formatDurationSeconds(durationSeconds(s.startedAt, s.endedAt))}
              </dd>
            </dl>
          </motion.li>
        ))}
      </ul>
    </Card>
  )
}
