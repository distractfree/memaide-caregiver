import { motion } from 'framer-motion'
import { Video, Glasses, Smartphone, TestTube2, CircleHelp, X, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { formatDateTime, formatDurationSeconds } from '@/utils/formatting'
import type { StreamSession, StreamSessionSource, StreamSessionStatus } from '@/types/domain'

export interface StreamFilterState {
  status: StreamSessionStatus | ''
  source: StreamSessionSource | ''
  from: string | null
  to: string | null
}

interface Props {
  sessions: StreamSession[]
  hasActiveFilter: boolean
  onClearFilters: () => void
  filters: StreamFilterState
  onFiltersChange: (next: StreamFilterState) => void
  validationError: string | null
}

const STATUS_OPTIONS: Array<{ value: StreamSessionStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'starting', label: 'Starting' },
  { value: 'ended', label: 'Ended' },
  { value: 'unavailable', label: 'Unavailable' },
  { value: 'failed', label: 'Failed' },
]

const SOURCE_OPTIONS: Array<{ value: StreamSessionSource | ''; label: string }> = [
  { value: '', label: 'All sources' },
  { value: 'glasses', label: 'Smart glasses' },
  { value: 'phone', label: 'Phone' },
  { value: 'mock', label: 'Mock' },
  { value: 'unknown', label: 'Unknown' },
]

function durationSeconds(startedAt: string | null, endedAt: string | null): number | null {
  if (!startedAt || !endedAt) return null
  const start = new Date(startedAt).getTime()
  const end = new Date(endedAt).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
  return Math.floor((end - start) / 1000)
}

function getSourceDetails(source: string): { label: string; Icon: LucideIcon } {
  switch (source) {
    case 'glasses':
      return { Icon: Glasses, label: 'Smart glasses' }
    case 'phone':
      return { Icon: Smartphone, label: 'Phone' }
    case 'mock':
      return { Icon: TestTube2, label: 'Mock' }
    default:
      return { Icon: CircleHelp, label: source || 'Unknown' }
  }
}

function RenderSource({ source }: { source: string }) {
  const { Icon, label } = getSourceDetails(source)
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-on-surface-variant">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  )
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Active'
    case 'starting':
      return 'Starting'
    case 'ended':
      return 'Ended'
    case 'unavailable':
      return 'Unavailable'
    case 'failed':
      return 'Failed'
    default:
      return status || 'Unknown'
  }
}

function RenderStatus({ status }: { status: string }) {
  const label = getStatusLabel(status)
  const isActive = status === 'active'
  return (
    <span
      className={
        isActive
          ? 'text-sm font-semibold text-green-600 whitespace-nowrap'
          : 'text-sm text-on-surface-variant whitespace-nowrap'
      }
    >
      {label}
    </span>
  )
}

export function StreamSessionHistory({
  sessions,
  hasActiveFilter,
  onClearFilters,
  filters,
  onFiltersChange,
  validationError,
}: Props) {
  function updateFilter<K extends keyof StreamFilterState>(key: K, value: StreamFilterState[K]) {
    onFiltersChange({ ...filters, [key]: value })
  }

  // If there are absolutely no sessions and no filter is active, show the clean empty state.
  if (sessions.length === 0 && !hasActiveFilter) {
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
      {/* Connected Header & Filters container */}
      <div className="flex flex-col gap-4 border-b border-outline-variant/30 px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-on-surface">Session history</h2>
            <p className="text-xs text-text-muted">
              {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}, newest first.
            </p>
          </div>
          {hasActiveFilter && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              leftIcon={<X className="h-3.5 w-3.5" />}
              onClick={onClearFilters}
            >
              Clear filters
            </Button>
          )}
        </div>

        {/* Filter controls */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Status"
            options={STATUS_OPTIONS}
            value={filters.status}
            onChange={(e) => updateFilter('status', e.target.value as StreamSessionStatus | '')}
          />
          <Select
            label="Source"
            options={SOURCE_OPTIONS}
            value={filters.source}
            onChange={(e) => updateFilter('source', e.target.value as StreamSessionSource | '')}
          />
          <Input
            type="date"
            label="From"
            value={filters.from ?? ''}
            onChange={(e) => updateFilter('from', e.target.value === '' ? null : e.target.value)}
          />
          <Input
            type="date"
            label="To"
            value={filters.to ?? ''}
            onChange={(e) => updateFilter('to', e.target.value === '' ? null : e.target.value)}
          />
        </div>

        {validationError && (
          <p role="alert" className="text-[12px] text-error font-medium">
            {validationError}
          </p>
        )}
      </div>

      {sessions.length === 0 ? (
        /* If sessions match is 0 due to active filters, show inline warning inside the card */
        <div className="flex flex-col items-center justify-center text-center px-5 py-8 gap-1.5">
          <p className="text-sm font-semibold text-on-surface">
            No stream sessions match the selected filters.
          </p>
          <p className="text-xs text-on-surface-variant">
            Try widening the date range or clearing filters.
          </p>
        </div>
      ) : (
        <>
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
                    <td className="px-5 py-3"><RenderStatus status={s.status} /></td>
                    <td className="px-5 py-3"><RenderSource source={s.source} /></td>
                    <td className="px-5 py-3 text-on-surface">
                      {formatDurationSeconds(durationSeconds(s.startedAt, s.endedAt))}
                    </td>
                    <td className="px-5 py-3 text-sm text-on-surface-variant">
                      {s.helpEventId ? 'Linked' : '—'}
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
                <div className="flex flex-wrap items-center gap-3">
                  <RenderStatus status={s.status} />
                  <span className="text-text-muted/40">|</span>
                  <RenderSource source={s.source} />
                  {s.helpEventId && (
                    <>
                      <span className="text-text-muted/40">|</span>
                      <span className="text-xs text-on-surface-variant font-medium">Linked help event</span>
                    </>
                  )}
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
        </>
      )}
    </Card>
  )
}
