import { Bell, BellOff, ListChecks } from 'lucide-react'
import { Card } from '@/components/ui/Card'

interface ReminderStatCardsProps {
  total: number
  activeCount: number
  inactiveCount: number
}

export function ReminderStatCards({ total, activeCount, inactiveCount }: ReminderStatCardsProps) {
  return (
    <div className="grid gap-gutter sm:grid-cols-3">
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Total reminders
          </p>
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent/10 text-accent-dark">
            <ListChecks className="h-4 w-4" />
          </span>
        </div>
        <p className="text-3xl font-semibold tracking-tight text-on-surface">{total}</p>
        <p className="text-xs text-text-muted">Scheduled for this patient</p>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Active
          </p>
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent/10 text-accent-dark">
            <Bell className="h-4 w-4" />
          </span>
        </div>
        <p className="text-3xl font-semibold tracking-tight text-on-surface">{activeCount}</p>
        <p className="text-xs text-text-muted">Surfacing in the patient app</p>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Inactive
          </p>
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-surface-container-high text-on-surface-variant">
            <BellOff className="h-4 w-4" />
          </span>
        </div>
        <p className="text-3xl font-semibold tracking-tight text-on-surface">{inactiveCount}</p>
        <p className="text-xs text-text-muted">Paused, not currently shown</p>
      </Card>
    </div>
  )
}
