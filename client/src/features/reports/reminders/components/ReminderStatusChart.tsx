import { PieChart as PieChartIcon, Smartphone, Watch, Monitor } from 'lucide-react'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import type { ReminderEventSourceDevice, ReminderEventStatus, ReminderReportSummary } from '@/types/domain'

const STATUS_ORDER: ReminderEventStatus[] = ['scheduled', 'delivered', 'acknowledged', 'missed']

const STATUS_COLOR: Record<ReminderEventStatus, string> = {
  scheduled: '#94a3b8',
  delivered: '#F26522',
  acknowledged: '#16a34a',
  missed: '#ba1a1a',
}

const STATUS_LABEL: Record<ReminderEventStatus, string> = {
  scheduled: 'Scheduled',
  delivered: 'Delivered',
  acknowledged: 'Acknowledged',
  missed: 'Missed',
}

const DEVICE_ORDER: ReminderEventSourceDevice[] = ['phone', 'watch', 'system']

const DEVICE_LABEL: Record<ReminderEventSourceDevice, string> = {
  phone: 'Patient app',
  watch: 'Watch',
  system: 'System',
}

const DEVICE_ICON: Record<ReminderEventSourceDevice, typeof Smartphone> = {
  phone: Smartphone,
  watch: Watch,
  system: Monitor,
}

interface ReminderStatusChartProps {
  summary: ReminderReportSummary
}

export function ReminderStatusChart({ summary }: ReminderStatusChartProps) {
  const data = STATUS_ORDER.map((status) => ({
    name: STATUS_LABEL[status],
    status,
    value: summary.countsByStatus[status] ?? 0,
  }))

  const isEmpty = summary.totalScheduled === 0

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Status distribution
          </p>
          <h2 className="mt-1 text-base font-semibold text-on-surface">Reminder status</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            How reminders landed across the selected window.
          </p>
        </div>
      </div>

      {isEmpty ? (
        <EmptyState
          icon={PieChartIcon}
          title="No reminder activity in this range"
          message="Adjust the date filter or clear it to see all available data."
        />
      ) : (
        <>
          <div
            role="img"
            aria-label="Pie chart of reminder statuses"
            className="relative h-[260px] w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  stroke="#ffffff"
                  strokeWidth={2}
                  isAnimationActive
                >
                  {data.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_COLOR[entry.status]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid rgba(198,198,205,0.4)',
                    fontSize: 12,
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={28}
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12, color: '#45464c' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-7">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Total
              </span>
              <span className="text-2xl font-semibold tracking-tight text-on-surface">
                {summary.totalScheduled}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {DEVICE_ORDER.map((device) => {
              const Icon = DEVICE_ICON[device]
              const count = summary.countsBySourceDevice[device] ?? 0
              return (
                <div
                  key={device}
                  className="flex items-center justify-between gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2"
                >
                  <span className="flex items-center gap-2 text-[12px] font-medium text-on-surface-variant">
                    <Icon className="h-3.5 w-3.5" />
                    {DEVICE_LABEL[device]}
                  </span>
                  <span className="text-sm font-semibold text-on-surface">{count}</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </Card>
  )
}
