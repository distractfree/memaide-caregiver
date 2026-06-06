import { HeartPulse, SearchX } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatDateTime } from '@/utils/formatting'
import type { VitalEvent } from '@/types/domain'
import { MotionStateBadge } from './MotionStateBadge'
import { WellnessSourceBadge } from './WellnessSourceBadge'

interface VitalSamplesTableProps {
  events: VitalEvent[]
  hasActiveFilter: boolean
  onClearFilters?: () => void
  note?: string
}

function formatHeartRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${value} bpm`
}

function formatStepCount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return value.toLocaleString()
}

export function VitalSamplesTable({
  events,
  hasActiveFilter,
  onClearFilters,
  note,
}: VitalSamplesTableProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState
          icon={hasActiveFilter ? SearchX : HeartPulse}
          title={
            hasActiveFilter
              ? 'No wellness samples match your filters'
              : 'No wellness samples found yet'
          }
          message={
            hasActiveFilter
              ? 'Try widening the date range or clearing the filter to see all available samples.'
              : 'Once the wearable or patient app reports wellness data, samples will appear here.'
          }
          action={
            hasActiveFilter && onClearFilters ? (
              <Button variant="outline" size="sm" onClick={onClearFilters}>
                Clear filter
              </Button>
            ) : undefined
          }
        />
        {note && <p className="text-[11px] text-text-muted px-1">{note}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Desktop / tablet — semantic table */}
      <Card padded={false} className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-outline-variant/40 text-sm">
            <thead className="bg-surface-container-low">
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                <th scope="col" className="px-4 py-3">Captured at</th>
                <th scope="col" className="px-4 py-3">Heart rate</th>
                <th scope="col" className="px-4 py-3">Motion</th>
                <th scope="col" className="px-4 py-3">Steps</th>
                <th scope="col" className="px-4 py-3">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {events.map((event) => (
                <tr key={event.id} className="transition-colors hover:bg-surface-container-low/60">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-on-surface">
                    {formatDateTime(event.timestamp)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-on-surface">
                    {formatHeartRate(event.heartRate)}
                  </td>
                  <td className="px-4 py-3">
                    {event.motionState ? (
                      <MotionStateBadge state={event.motionState} />
                    ) : (
                      <span className="text-sm text-on-surface-variant">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-on-surface-variant">
                    {formatStepCount(event.stepCount)}
                  </td>
                  <td className="px-4 py-3">
                    <WellnessSourceBadge device={event.sourceDevice} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mobile — stacked cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {events.map((event) => (
          <Card key={event.id} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-on-surface">
                  {formatHeartRate(event.heartRate)}
                </p>
                <p className="mt-0.5 text-[12px] text-text-muted">
                  {formatDateTime(event.timestamp)}
                </p>
              </div>
              <WellnessSourceBadge device={event.sourceDevice} />
            </div>
            <dl className="grid grid-cols-2 gap-2 border-t border-outline-variant/30 pt-3 text-[12px]">
              <div>
                <dt className="font-semibold uppercase tracking-wider text-text-muted text-[10px]">
                  Motion
                </dt>
                <dd className="mt-0.5">
                  {event.motionState ? (
                    <MotionStateBadge state={event.motionState} />
                  ) : (
                    <span className="text-on-surface-variant">—</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wider text-text-muted text-[10px]">
                  Steps
                </dt>
                <dd className="mt-0.5 text-on-surface">{formatStepCount(event.stepCount)}</dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>

      {note && <p className="text-[11px] text-text-muted px-1">{note}</p>}
    </div>
  )
}
