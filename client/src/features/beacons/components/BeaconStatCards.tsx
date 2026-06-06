import { Home, Radar, Wifi, WifiOff } from 'lucide-react'
import { Card } from '@/components/ui/Card'

interface BeaconStatCardsProps {
  total: number
  activeCount: number
  inactiveCount: number
  roomsCount: number
}

export function BeaconStatCards({
  total,
  activeCount,
  inactiveCount,
  roomsCount,
}: BeaconStatCardsProps) {
  return (
    <div className="grid gap-gutter sm:grid-cols-2 lg:grid-cols-4">
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Total beacons
          </p>
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent/10 text-accent-dark">
            <Radar className="h-4 w-4" />
          </span>
        </div>
        <p className="text-3xl font-semibold tracking-tight text-on-surface">{total}</p>
        <p className="text-xs text-text-muted">Configured for this patient</p>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Active
          </p>
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent/10 text-accent-dark">
            <Wifi className="h-4 w-4" />
          </span>
        </div>
        <p className="text-3xl font-semibold tracking-tight text-on-surface">{activeCount}</p>
        <p className="text-xs text-text-muted">Currently broadcasting context</p>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Inactive
          </p>
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-surface-container-high text-on-surface-variant">
            <WifiOff className="h-4 w-4" />
          </span>
        </div>
        <p className="text-3xl font-semibold tracking-tight text-on-surface">{inactiveCount}</p>
        <p className="text-xs text-text-muted">Paused, not used by the patient app</p>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Rooms
          </p>
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-surface-container-high text-on-surface-variant">
            <Home className="h-4 w-4" />
          </span>
        </div>
        <p className="text-3xl font-semibold tracking-tight text-on-surface">{roomsCount}</p>
        <p className="text-xs text-text-muted">Distinct room labels</p>
      </Card>
    </div>
  )
}
