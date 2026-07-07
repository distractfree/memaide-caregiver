import type { LucideIcon } from 'lucide-react'
import { AlertCircle, CalendarClock, CheckCircle2, Timer } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { formatDurationSeconds } from '@/utils/formatting'
import type { ReminderReportSummary } from '@/types/domain'

interface ReminderReportKpisProps {
  summary: ReminderReportSummary
}

export function ReminderReportKpis({ summary }: ReminderReportKpisProps) {
  return (
    <div className="grid gap-gutter sm:grid-cols-2">
      <KpiCard
        label="Total scheduled"
        value={summary.totalScheduled}
        icon={CalendarClock}
        tone="accent"
      />
      <KpiCard
        label="Acknowledged"
        value={summary.totalAcknowledged}
        icon={CheckCircle2}
        tone="success"
      />
      <KpiCard
        label="Missed"
        value={summary.totalMissed}
        icon={AlertCircle}
        tone="danger"
      />
      <KpiCard
        label="Avg response time"
        value={formatDurationSeconds(summary.averageTimeToAcknowledgeSeconds)}
        icon={Timer}
        tone="accent"
      />
    </div>
  )
}

type Tone = 'accent' | 'success' | 'danger'

const TONE_CHIP: Record<Tone, string> = {
  accent: 'bg-accent/10 text-accent-dark',
  success: 'bg-green-100 text-green-800',
  danger: 'bg-error-container text-error',
}

interface KpiCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  tone: Tone
}

function KpiCard({ label, value, icon: Icon, tone }: KpiCardProps) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-2xl ${TONE_CHIP[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="text-3xl font-semibold tracking-tight text-on-surface">{value}</p>
    </Card>
  )
}
