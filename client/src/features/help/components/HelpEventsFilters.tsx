import { Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/utils/cn'
import type { HelpEventSourceDevice, HelpEventStatus } from '@/types/domain'

export interface HelpEventsFiltersValue {
  sourceDevice?: HelpEventSourceDevice
  status?: HelpEventStatus
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
  'h-9 rounded-full border border-outline-variant/50 bg-surface-container-lowest px-3 pr-8 text-[12px] font-semibold text-on-surface transition-colors',
  'focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent',
)

export function HelpEventsFilters({ filters, onChange }: HelpEventsFiltersProps) {
  const hasAny = filters.sourceDevice !== undefined || filters.status !== undefined

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
  function clear() {
    onChange({})
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        <Filter className="h-3 w-3" />
        Filters
      </span>
      <label className="sr-only" htmlFor="help-events-source">
        Source device
      </label>
      <select
        id="help-events-source"
        className={selectClasses}
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
        className={selectClasses}
        value={filters.status ?? ''}
        onChange={(e) => setStatus(e.target.value)}
      >
        {statusOptions.map((opt) => (
          <option key={opt.value || 'all'} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {hasAny && (
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<X className="h-3.5 w-3.5" />}
          onClick={clear}
        >
          Clear
        </Button>
      )}
    </div>
  )
}
