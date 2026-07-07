import type { LucideIcon } from 'lucide-react'
import { Clock, Home, Radar, Ruler } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { formatApproximateDistance, formatDurationSeconds } from '@/utils/formatting'
import type { BeaconReportSummary } from '@/types/domain'

interface BeaconReportKpisProps {
  summary: BeaconReportSummary
}

export function BeaconReportKpis({ summary }: BeaconReportKpisProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-gutter sm:grid-cols-2">
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
