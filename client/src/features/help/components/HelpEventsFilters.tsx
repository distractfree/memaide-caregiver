import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/utils/cn'
import type { HelpEventSourceDevice, HelpEventStatus } from '@/types/domain'

export interface HelpEventsFiltersValue {
  sourceDevice?: HelpEventSourceDevice
  status?: HelpEventStatus
  from?: string
  to?: string
}

interface HelpEventsFiltersProps {
  filters: HelpEventsFiltersValue
  onChange: (next: HelpEventsFiltersValue) => void
}

const sourceOptions: { value: HelpEventSourceDevice | ''; label: string }[] = [
  { value: '', label: 'All sources' },
  { value: 'phone', label: 'Phone' },
  { value: 'watch', label: 'Watch' },
  { value: 'system', label: 'System' },
]

const statusOptions: { value: HelpEventStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'triggered', label: 'Triggered' },
  { value: 'whatsapp_opened', label: 'WhatsApp opened' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const selectClasses = cn(
  'h-8 rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-2 pr-5 text-[11px] font-semibold text-on-surface transition-colors',
  'focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent',
)

const dateClasses = cn(
  'h-8 rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-2 text-[11px] font-semibold text-on-surface transition-colors',
  'focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent',
)

export function HelpEventsFilters({ filters, onChange }: HelpEventsFiltersProps) {
  const hasAny =
    filters.sourceDevice !== undefined ||
    filters.status !== undefined ||
    filters.from !== undefined ||
    filters.to !== undefined

  function setSource(value: string) {
    onChange({
      ...filters,
      sourceDevice: (value || undefined) as HelpEventSourceDevice | undefined,
    })
  }
  function setStatus(value: string) {
    onChange({
      ...filters,
      status: (value || undefined) as HelpEventStatus | undefined,
    })
  }
  function setFrom(value: string) {
    onChange({ ...filters, from: value || undefined })
  }
  function setTo(value: string) {
    onChange({ ...filters, to: value || undefined })
  }
  function clear() {
    onChange({})
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="help-events-source">
        Source device
      </label>
      <select
        id="help-events-source"
        className={cn(selectClasses, 'w-full sm:w-[95px] shrink-0')}
        value={filters.sourceDevice ?? ''}
        onChange={(e) => setSource(e.target.value)}
      >
        {sourceOptions.map((opt) => (
          <option key={opt.value || 'all'} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="help-events-status">
        Status
      </label>
      <select
        id="help-events-status"
        className={cn(selectClasses, 'w-full sm:w-[105px] shrink-0')}
        value={filters.status ?? ''}
        onChange={(e) => setStatus(e.target.value)}
      >
        {statusOptions.map((opt) => (
          <option key={opt.value || 'all'} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="help-events-from">
        From date
      </label>
      <input
        id="help-events-from"
        type="date"
        className={cn(dateClasses, 'w-full sm:w-[105px] shrink-0')}
        value={filters.from ?? ''}
        max={filters.to ?? undefined}
        onChange={(e) => setFrom(e.target.value)}
        aria-label="From date"
      />

      <label className="sr-only" htmlFor="help-events-to">
        To date
      </label>
      <input
        id="help-events-to"
        type="date"
        className={cn(dateClasses, 'w-full sm:w-[105px] shrink-0')}
        value={filters.to ?? ''}
        min={filters.from ?? undefined}
        onChange={(e) => setTo(e.target.value)}
        aria-label="To date"
      />

      {hasAny && (
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<X className="h-3.5 w-3.5" />}
          onClick={clear}
          className="ml-auto sm:ml-0 shrink-0 h-8 text-[11px]"
        >
          Clear
        </Button>
      )}
    </div>
  )
}
