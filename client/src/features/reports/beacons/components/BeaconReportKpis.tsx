import type { LucideIcon } from 'lucide-react'
import { Clock, Home, Radar, Ruler } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { formatApproximateDistance, formatDateTime, formatDurationSeconds } from '@/utils/formatting'
import type { BeaconLatestContext, BeaconReportSummary } from '@/types/domain'

interface BeaconReportKpisProps {
  summary: BeaconReportSummary
  latestContext: BeaconLatestContext | null
}

export function BeaconReportKpis({ summary, latestContext }: BeaconReportKpisProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-gutter sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total events"
          value={summary.totalEvents}
          sub="Approximate proximity events"
          icon={Radar}
        />
        <KpiCard
          label="Unique rooms"
          value={summary.uniqueRoomsVisited}
          sub="Distinct rooms visited"
          icon={Home}
        />
        <KpiCard
          label="Average dwell"
          value={formatDurationSeconds(summary.averageDwellSeconds)}
          sub="Time spent near a beacon"
          icon={Clock}
        />
        <KpiCard
          label="Avg estimated distance"
          value={formatApproximateDistance(summary.approximateDistanceAverageM)}
          sub="BLE estimates are noisy"
          icon={Ruler}
        />
      </div>

      {latestContext && (
        <div
          className="flex flex-col gap-1 rounded-2xl border border-outline-variant/40 bg-surface-container-low px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          role="status"
        >
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Latest known context
            </p>
            <p className="mt-0.5 text-sm text-on-surface">
              Last seen near{' '}
              <span className="font-semibold text-accent-dark">{latestContext.roomName}</span>{' '}
              on {formatDateTime(latestContext.detectedAt)}
            </p>
            <p className="mt-0.5 text-[11px] text-text-muted">{latestContext.accuracyNote}</p>
          </div>
          {latestContext.estimatedDistanceM !== null && (
            <span className="shrink-0 self-start inline-flex items-center gap-1.5 rounded-full border border-outline-variant/40 bg-surface-container-lowest px-2.5 py-1 text-[12px] font-medium text-on-surface-variant">
              <Ruler className="h-3 w-3" />
              {formatApproximateDistance(latestContext.estimatedDistanceM)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

interface KpiCardProps {
  label: string
  value: string | number
  sub: string
  icon: LucideIcon
}

function KpiCard({ label, value, sub, icon: Icon }: KpiCardProps) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{label}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent/10 text-accent-dark">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="text-3xl font-semibold tracking-tight text-on-surface">{value}</p>
      <p className="text-xs text-text-muted">{sub}</p>
    </Card>
  )
}
