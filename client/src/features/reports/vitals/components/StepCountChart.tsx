import { Footprints } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card } from '@/components/ui/Card'
import { formatDateTime } from '@/utils/formatting'
import type { VitalStepTrendPoint } from '@/types/domain'

interface StepCountChartProps {
  points: VitalStepTrendPoint[]
}

function shortTick(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function compactSteps(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
  return String(value)
}

interface TooltipPayload {
  payload: VitalStepTrendPoint
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: TooltipPayload[]
}) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0]!.payload
  return (
    <div className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs shadow-card">
      <p className="font-semibold text-on-surface">{row.stepCount.toLocaleString()} steps</p>
      <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-[11px]">
        <dt className="text-text-muted">Captured</dt>
        <dd className="text-on-surface">{formatDateTime(row.timestamp)}</dd>
        <dt className="text-text-muted">Source</dt>
        <dd className="text-on-surface">{row.sourceDevice}</dd>
      </dl>
    </div>
  )
}

export function StepCountChart({ points }: StepCountChartProps) {
  const isEmpty = points.length === 0

  return (
    <Card
      className="flex flex-col gap-4"
      role="figure"
      aria-label="Line chart of cumulative step counts over time"
    >
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Step-count trend
        </p>
        <h2 className="mt-1 text-base font-semibold text-on-surface">
          Cumulative step samples
        </h2>
        <p className="mt-0.5 text-xs text-text-muted">
          Reported step counts from the wearable. Values may reset by device.
        </p>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-outline-variant/60 bg-surface-container-low px-4 py-10 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
            <Footprints className="h-4 w-4" />
          </span>
          <p className="text-sm font-semibold text-on-surface">
            No step samples in this range
          </p>
          <p className="text-xs text-text-muted max-w-sm">
            Step counts will appear here once a wearable reports activity data.
          </p>
        </div>
      ) : (
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={points}
              margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
            >
              <CartesianGrid stroke="rgba(198,198,205,0.3)" vertical={false} />
              <XAxis
                dataKey="timestamp"
                tickFormatter={shortTick}
                minTickGap={32}
                tick={{ fontSize: 11, fill: '#4B5563' }}
                stroke="rgba(198,198,205,0.6)"
              />
              <YAxis
                allowDecimals={false}
                width={48}
                tick={{ fontSize: 11, fill: '#4B5563' }}
                stroke="rgba(198,198,205,0.6)"
                tickFormatter={compactSteps}
              />
              <Tooltip
                cursor={{ stroke: 'rgba(242,101,34,0.25)', strokeWidth: 1 }}
                content={<ChartTooltip />}
              />
              <Line
                type="monotone"
                dataKey="stepCount"
                stroke="#a63b00"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#a63b00' }}
                isAnimationActive
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
