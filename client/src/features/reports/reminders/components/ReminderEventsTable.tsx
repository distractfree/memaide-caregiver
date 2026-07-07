import { CalendarX, Smartphone, Watch, Monitor } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ReminderStatusBadge } from '@/features/reports/reminders/components/ReminderStatusBadge'
import { formatDateTime, formatDurationSeconds } from '@/utils/formatting'
import type { ReminderEventSourceDevice, ReminderReportEvent } from '@/types/domain'

const DEVICE_LABEL: Record<ReminderEventSourceDevice, string> = {
  phone: 'App',
  watch: 'Watch',
  system: 'System',
}

const DEVICE_ICON: Record<ReminderEventSourceDevice, LucideIcon> = {
  phone: Smartphone,
  watch: Watch,
  system: Monitor,
}

interface ReminderEventsTableProps {
  events: ReminderReportEvent[]
  onClearFilters?: () => void
  hasActiveFilter: boolean
}

export function ReminderEventsTable({ events, onClearFilters, hasActiveFilter }: ReminderEventsTableProps) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={CalendarX}
        title="No reminder events in this window"
        message={
          hasActiveFilter
            ? 'Try widening the date range or clearing the filter to see all available data.'
            : 'No reminder events have been recorded for this patient yet.'
        }
        action={
          hasActiveFilter && onClearFilters ? (
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              Clear filter
            </Button>
          ) : undefined
        }
      />
    )
  }

  return (
    <>
      {/* Desktop / tablet — semantic table */}
      <Card padded={false} className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-outline-variant/40 text-sm">
            <thead className="bg-surface-container-low">
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                <th scope="col" className="whitespace-nowrap px-4 py-3">Scheduled</th>
                <th scope="col" className="whitespace-nowrap px-4 py-3">Reminder</th>
                <th scope="col" className="whitespace-nowrap px-4 py-3">Status</th>
                <th scope="col" className="whitespace-nowrap px-4 py-3">Source</th>
                <th scope="col" className="whitespace-nowrap px-4 py-3">Acknowledged at</th>
                <th scope="col" className="whitespace-nowrap px-4 py-3">Time to ack</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {events.map((event) => (
                <tr key={event.id} className="transition-colors hover:bg-surface-container-low/60">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-on-surface">
                    {formatDateTime(event.scheduledAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <Badge tone="muted" className="self-start">{event.reminderType || 'Reminder'}</Badge>
                      <span className="text-sm text-on-surface">
                        {event.reminderDescription || '—'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ReminderStatusBadge status={event.status} />
                  </td>
                  <td className="px-4 py-3">
                    <SourceDeviceLabel device={event.sourceDevice} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-on-surface-variant">
                    {formatDateTime(event.acknowledgedAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-on-surface-variant">
                    {formatDurationSeconds(event.timeToAcknowledgeSeconds)}
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
                <Badge tone="muted">{event.reminderType || 'Reminder'}</Badge>
                <p className="mt-1.5 text-sm font-semibold text-on-surface">
                  {event.reminderDescription || '—'}
                </p>
                <p className="mt-0.5 text-[12px] text-text-muted">
                  {formatDateTime(event.scheduledAt)}
                </p>
              </div>
              <ReminderStatusBadge status={event.status} />
            </div>
            <dl className="grid grid-cols-2 gap-2 border-t border-outline-variant/30 pt-3 text-[12px]">
              <div>
                <dt className="font-semibold uppercase tracking-wider text-text-muted text-[10px]">Source</dt>
                <dd className="mt-0.5 text-on-surface">
                  <SourceDeviceLabel device={event.sourceDevice} />
                </dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wider text-text-muted text-[10px]">Time to ack</dt>
                <dd className="mt-0.5 text-on-surface">
                  {formatDurationSeconds(event.timeToAcknowledgeSeconds)}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="font-semibold uppercase tracking-wider text-text-muted text-[10px]">Acknowledged at</dt>
                <dd className="mt-0.5 text-on-surface-variant">
                  {formatDateTime(event.acknowledgedAt)}
                </dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>
    </>
  )
}

function SourceDeviceLabel({ device }: { device: string }) {
  const known = (device in DEVICE_LABEL) ? (device as ReminderEventSourceDevice) : null
  if (!known) {
    return <span className="text-sm text-on-surface-variant">{device}</span>
  }
  const Icon = DEVICE_ICON[known]
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-on-surface-variant">
      <Icon className="h-3.5 w-3.5" />
      {DEVICE_LABEL[known]}
    </span>
  )
}
