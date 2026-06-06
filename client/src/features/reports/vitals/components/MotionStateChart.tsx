import { useMemo } from 'react'
import { Activity } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card } from '@/components/ui/Card'

interface MotionStateChartProps {
  counts: Record<string, number>
}

const LABELS: Record<string, string> = {
  idle: 'Idle',
  walking: 'Walking',
  active: 'Active',
  unknown: 'Unknown',
}

// Use neutral colors because motion state is only context.
const PALETTE = ['#F26522', '#a63b00', '#0ea5e9', '#94a3b8']

interface Row {
  motionState: string
  label: string
  count: number
}

interface TooltipPayload {
  payload: Row
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
      <p className="font-semibold text-on-surface">{row.label}</p>
      <p className="mt-0.5 text-[11px] text-text-muted">
        {row.count.toLocaleString()} sample{row.count === 1 ? '' : 's'}
      </p>
    </div>
  )
}

export function MotionStateChart({ counts }: MotionStateChartProps) {
  const rows = useMemo<Row[]>(() => {
    return Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([state, n]) => ({
        motionState: state,
        label: LABELS[state] ?? state,
        count: n,
      }))
      .sort((a, b) => b.count - a.count)
  }, [counts])

  const isEmpty = rows.length === 0
  const chartHeight = Math.max(200, rows.length * 56)

  return (
    <Card
      className="flex flex-col gap-4"
      role="figure"
      aria-label="Bar chart of motion/activity context counts"
    >
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Activity context
        </p>
        <h2 className="mt-1 text-base font-semibold text-on-surface">
          Motion sample distribution
        </h2>
        <p className="mt-0.5 text-xs text-text-muted">
          Counts of motion/activity context reported by the wearable.
        </p>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-outline-variant/60 bg-surface-container-low px-4 py-10 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
            <Activity className="h-4 w-4" />
          </span>
          <p className="text-sm font-semibold text-on-surface">
            No motion samples in this range
          </p>
          <p className="text-xs text-text-muted max-w-sm">
            Activity context will appear here once the wearable reports motion data.
          </p>
        </div>
      ) : (
        <div style={{ width: '100%', height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={rows}
              margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
            >
              <CartesianGrid stroke="rgba(198,198,205,0.3)" horizontal={false} />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#4B5563' }}
                stroke="rgba(198,198,205,0.6)"
              />
              <YAxis
                type="category"
                dataKey="label"
                width={96}
                tick={{ fontSize: 12, fill: '#1f2937' }}
                stroke="rgba(198,198,205,0.6)"
              />
              <Tooltip
                cursor={{ fill: 'rgba(242,101,34,0.06)' }}
                content={<ChartTooltip />}
              />
              <Bar dataKey="count" radius={[0, 8, 8, 0]} isAnimationActive>
                {rows.map((row, idx) => (
                  <Cell key={row.motionState} fill={PALETTE[idx % PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
