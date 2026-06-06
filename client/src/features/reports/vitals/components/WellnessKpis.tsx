import type { LucideIcon } from 'lucide-react'
import { Activity, Footprints, HeartPulse, TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { formatDateTime } from '@/utils/formatting'
import type { VitalReportSummary } from '@/types/domain'

interface WellnessKpisProps {
  summary: VitalReportSummary
}

const MOTION_LABEL: Record<string, string> = {
  idle: 'Idle',
  walking: 'Walking',
  active: 'Active',
  unknown: 'Unknown',
}

function formatBpm(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${Math.round(value)} bpm`
}

function formatSteps(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return value.toLocaleString()
}

function motionLabel(value: string | null): string {
  if (!value) return '—'
  return MOTION_LABEL[value] ?? value
}

function hrRangeSub(summary: VitalReportSummary): string {
  if (summary.minHeartRate === null || summary.maxHeartRate === null) {
    return 'Single-sample range unavailable'
  }
  return `Range ${Math.round(summary.minHeartRate)} – ${Math.round(summary.maxHeartRate)} bpm`
}

function totalSamplesSub(summary: VitalReportSummary): string {
  if (summary.totalSamples === 0) return 'No samples in this range'
  if (!summary.firstSampleAt || !summary.latestSampleAt) {
    return 'Heart rate, motion, and step samples'
  }
  return `${formatDateTime(summary.firstSampleAt)} → ${formatDateTime(summary.latestSampleAt)}`
}

function latestHrSub(summary: VitalReportSummary): string {
  if (summary.latestHeartRate === null) return 'No heart-rate samples captured'
  if (!summary.latestSampleAt) return 'Latest wearable sample'
  return `Captured ${formatDateTime(summary.latestSampleAt)}`
}

function activitySub(summary: VitalReportSummary): string {
  if (summary.latestStepCount === null) return 'Step count unavailable'
  return `Latest step count: ${formatSteps(summary.latestStepCount)}`
}

export function WellnessKpis({ summary }: WellnessKpisProps) {
  return (
    <div className="grid gap-gutter sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label="Total samples"
        value={summary.totalSamples}
        sub={totalSamplesSub(summary)}
        icon={HeartPulse}
      />
      <KpiCard
        label="Latest heart-rate sample"
        value={formatBpm(summary.latestHeartRate)}
        sub={latestHrSub(summary)}
        icon={Activity}
      />
      <KpiCard
        label="Average heart-rate sample"
        value={formatBpm(summary.averageHeartRate)}
        sub={hrRangeSub(summary)}
        icon={TrendingUp}
      />
      <KpiCard
        label="Activity context"
        value={motionLabel(summary.mostCommonMotionState)}
        sub={activitySub(summary)}
        icon={Footprints}
      />
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
