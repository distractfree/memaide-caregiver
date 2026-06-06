import { ChevronRight, Monitor, Radar, SearchX, Smartphone } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatApproximateDistance, formatDateTime, formatDurationSeconds } from '@/utils/formatting'
import type { BeaconEventSourceDevice, BeaconReportEvent } from '@/types/domain'

const DEVICE_LABEL: Record<BeaconEventSourceDevice, string> = {
  phone: 'Patient app',
  system: 'System',
}

const DEVICE_ICON: Record<BeaconEventSourceDevice, LucideIcon> = {
  phone: Smartphone,
  system: Monitor,
}

interface BeaconEventsTableProps {
  events: BeaconReportEvent[]
  hasActiveFilter: boolean
  onClearFilters?: () => void
  note?: string
}

function SourceDeviceLabel({ device }: { device: string }) {
  const known = device in DEVICE_LABEL ? (device as BeaconEventSourceDevice) : null
  if (!known) {
    return <span className="text-sm text-on-surface-variant">{device}</span>
  }
  const Icon = DEVICE_ICON[known]
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant">
      <Icon className="h-3.5 w-3.5" />
      {DEVICE_LABEL[known]}
    </span>
  )
}

function SourceDeviceBadge({ device }: { device: string }) {
  const known = device in DEVICE_LABEL ? (device as BeaconEventSourceDevice) : null
  const Icon = known ? DEVICE_ICON[known] : Monitor
  const label = known ? DEVICE_LABEL[known] : device
  return (
    <Badge tone={known === 'phone' ? 'accent' : 'muted'} leftIcon={<Icon className="h-3 w-3" />}>
      {label}
    </Badge>
  )
}

function truncateUuid(uuid: string): string {
  if (uuid.length <= 13) return uuid
  return `${uuid.slice(0, 8)}…${uuid.slice(-4)}`
}

export function BeaconEventsTable({
  events,
  hasActiveFilter,
  onClearFilters,
  note,
}: BeaconEventsTableProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState
          icon={hasActiveFilter ? SearchX : Radar}
          title={
            hasActiveFilter
              ? 'No events match your filters'
              : 'No beacon proximity events found yet'
          }
          message={
            hasActiveFilter
              ? 'Try widening the date range or clearing the filter to see all available data.'
              : 'Once the patient app detects configured beacons, proximity events will appear here.'
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
                <th scope="col" className="px-4 py-3">Detected at</th>
                <th scope="col" className="px-4 py-3">Room</th>
                <th scope="col" className="px-4 py-3">Beacon</th>
                <th scope="col" className="px-4 py-3">Dwell</th>
                <th scope="col" className="px-4 py-3">Distance</th>
                <th scope="col" className="px-4 py-3">Source</th>
                <th scope="col" className="px-4 py-3">Exited at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {events.map((event) => (
                <tr key={event.id} className="transition-colors hover:bg-surface-container-low/60">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-on-surface">
                    {formatDateTime(event.detectedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-semibold text-on-surface">{event.roomName}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-[12px] font-mono text-text-muted"
                      title={event.beaconUuid}
                    >
                      {truncateUuid(event.beaconUuid)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-on-surface-variant">
                    {formatDurationSeconds(event.dwellSeconds)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-on-surface-variant">
                    {formatApproximateDistance(event.estimatedDistanceM)}
                  </td>
                  <td className="px-4 py-3">
                    <SourceDeviceLabel device={event.sourceDevice} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-on-surface-variant">
                    {formatDateTime(event.exitedAt)}
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
                <p className="text-sm font-semibold text-on-surface">{event.roomName}</p>
                <p className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-text-muted">
                  {formatDateTime(event.detectedAt)}
                  <ChevronRight className="h-3 w-3" />
                  {event.exitedAt ? formatDateTime(event.exitedAt) : 'still nearby'}
                </p>
              </div>
              <SourceDeviceBadge device={event.sourceDevice} />
            </div>
            <dl className="grid grid-cols-2 gap-2 border-t border-outline-variant/30 pt-3 text-[12px]">
              <div>
                <dt className="font-semibold uppercase tracking-wider text-text-muted text-[10px]">
                  Dwell
                </dt>
                <dd className="mt-0.5 text-on-surface">
                  {formatDurationSeconds(event.dwellSeconds)}
                </dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wider text-text-muted text-[10px]">
                  Distance
                </dt>
                <dd className="mt-0.5 text-on-surface">
                  {formatApproximateDistance(event.estimatedDistanceM)}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="font-semibold uppercase tracking-wider text-text-muted text-[10px]">
                  Beacon
                </dt>
                <dd
                  className="mt-0.5 font-mono text-on-surface-variant break-all"
                  title={event.beaconUuid}
                >
                  {event.beaconUuid}
                </dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>

      {note && <p className="text-[11px] text-text-muted px-1">{note}</p>}
    </div>
  )
}
