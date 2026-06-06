import { BarChart3 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card } from '@/components/ui/Card'
import { formatDurationSeconds } from '@/utils/formatting'
import type { BeaconReportRoom } from '@/types/domain'

interface BeaconRoomChartProps {
  rooms: BeaconReportRoom[]
}

// Use neutral colors so rooms do not look "good" or "bad."
const PALETTE = ['#F26522', '#a63b00', '#0ea5e9', '#9333ea', '#16a34a', '#94a3b8']

interface TooltipPayload {
  payload: BeaconReportRoom
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0]!.payload
  return (
    <div className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs shadow-card">
      <p className="font-semibold text-on-surface">{row.roomName}</p>
      <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-[11px]">
        <dt className="text-text-muted">Events</dt>
        <dd className="text-on-surface">{row.eventCount}</dd>
        <dt className="text-text-muted">Avg dwell</dt>
        <dd className="text-on-surface">{formatDurationSeconds(row.averageDwellSeconds)}</dd>
        <dt className="text-text-muted">Total dwell</dt>
        <dd className="text-on-surface">{formatDurationSeconds(row.totalDwellSeconds)}</dd>
      </dl>
    </div>
  )
}

export function BeaconRoomChart({ rooms }: BeaconRoomChartProps) {
  const isEmpty = rooms.length === 0

  const topByDwell = [...rooms]
    .sort((a, b) => b.totalDwellSeconds - a.totalDwellSeconds)
    .slice(0, 3)

  const chartHeight = Math.max(220, rooms.length * 56)

  return (
    <Card
      className="flex flex-col gap-4"
      role="figure"
      aria-label="Bar chart of approximate beacon proximity event counts by room"
    >
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Events by room
        </p>
        <h2 className="mt-1 text-base font-semibold text-on-surface">Approximate room context</h2>
        <p className="mt-0.5 text-xs text-text-muted">
          Proximity event counts per configured room.
        </p>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-outline-variant/60 bg-surface-container-low px-4 py-10 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
            <BarChart3 className="h-4 w-4" />
          </span>
          <p className="text-sm font-semibold text-on-surface">No room data yet</p>
          <p className="text-xs text-text-muted max-w-sm">
            Once the patient app records proximity events, rooms will appear here.
          </p>
        </div>
      ) : (
        <>
          <div style={{ width: '100%', height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={rooms}
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
                  dataKey="roomName"
                  width={120}
                  tick={{ fontSize: 12, fill: '#1f2937' }}
                  stroke="rgba(198,198,205,0.6)"
                />
                <Tooltip
                  cursor={{ fill: 'rgba(242,101,34,0.06)' }}
                  content={<ChartTooltip />}
                />
                <Bar dataKey="eventCount" radius={[0, 8, 8, 0]} isAnimationActive>
                  {rooms.map((room, idx) => (
                    <Cell key={room.roomName} fill={PALETTE[idx % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {topByDwell.map((room) => (
              <div
                key={room.roomName}
                className="flex flex-col gap-0.5 rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2"
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  Avg dwell · {room.roomName}
                </span>
                <span className="text-sm font-semibold text-on-surface">
                  {formatDurationSeconds(room.averageDwellSeconds)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}
