import { CalendarRange, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'

export type DateRange = { from: string | null; to: string | null }

interface ReminderReportFiltersProps {
  filters: DateRange
  onChange: (next: DateRange) => void
  validationError: string | null
}

function todayYmd(): string {
  // Use the same calendar day the user sees locally — native <input type="date">
  // emits local-calendar YYYY-MM-DD, so presets must match that frame.
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function daysAgoYmd(days: number): string {
  const now = new Date()
  now.setDate(now.getDate() - days)
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function ReminderReportFilters({ filters, onChange, validationError }: ReminderReportFiltersProps) {
  const hasAny = filters.from !== null || filters.to !== null

  function applyToday() {
    const t = todayYmd()
    onChange({ from: t, to: t })
  }
  function applyLast7() {
    onChange({ from: daysAgoYmd(6), to: todayYmd() })
  }
  function applyLast30() {
    onChange({ from: daysAgoYmd(29), to: todayYmd() })
  }
  function clearAll() {
    onChange({ from: null, to: null })
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent/10 text-accent-dark">
            <CalendarRange className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Date range
            </p>
            <p className="mt-0.5 text-xs text-text-muted">
              Filter the acknowledgment report. Leave both empty to see all available data.
            </p>
          </div>
        </div>
        {hasAny && (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<X className="h-3.5 w-3.5" />}
            onClick={clearAll}
          >
            Clear
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          type="date"
          label="From"
          value={filters.from ?? ''}
          max={filters.to ?? undefined}
          onChange={(e) => onChange({ ...filters, from: e.target.value || null })}
        />
        <Input
          type="date"
          label="To"
          value={filters.to ?? ''}
          min={filters.from ?? undefined}
          onChange={(e) => onChange({ ...filters, to: e.target.value || null })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Presets
        </span>
        <Button variant="outline" size="sm" onClick={applyToday}>
          Today
        </Button>
        <Button variant="outline" size="sm" onClick={applyLast7}>
          Last 7 days
        </Button>
        <Button variant="outline" size="sm" onClick={applyLast30}>
          Last 30 days
        </Button>
      </div>

      {validationError && (
        <p role="alert" className="text-[12px] text-error font-medium">
          {validationError}
        </p>
      )}
    </Card>
  )
}
