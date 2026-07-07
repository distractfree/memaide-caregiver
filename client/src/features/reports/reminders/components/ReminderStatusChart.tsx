import { PieChart as PieChartIcon } from 'lucide-react'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import type { ReminderEventStatus, ReminderReportSummary } from '@/types/domain'

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



function renderLegend(props: any) {
  const { payload } = props
  if (!payload) return null
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-2.5 text-[11px] font-medium text-text-muted">
      {payload.map((entry: any, index: number) => (
        <li key={`item-${index}`} className="flex items-center gap-1">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span>{entry.value}</span>
        </li>
      ))}
    </ul>
  )
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
          <h2 className="text-base font-semibold text-on-surface">Reminder status</h2>
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
                <Legend content={renderLegend} />
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
        </>
      )}
    </Card>
  )
}
