import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import type { StreamSessionSource, StreamSessionStatus } from '@/types/domain'

// Empty string means "no filter" and keeps bad values out of API calls.
export interface StreamFilterState {
  status: StreamSessionStatus | ''
  source: StreamSessionSource | ''
  from: string | null
  to: string | null
}

interface Props {
  filters: StreamFilterState
  onChange: (next: StreamFilterState) => void
  validationError: string | null
}

const STATUS_OPTIONS: Array<{ value: StreamSessionStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'starting', label: 'Starting' },
  { value: 'ended', label: 'Ended' },
  { value: 'unavailable', label: 'Unavailable' },
  { value: 'failed', label: 'Failed' },
]

const SOURCE_OPTIONS: Array<{ value: StreamSessionSource | ''; label: string }> = [
  { value: '', label: 'All sources' },
  { value: 'glasses', label: 'Smart glasses' },
  { value: 'phone', label: 'Phone' },
  { value: 'mock', label: 'Mock' },
  { value: 'unknown', label: 'Unknown' },
]

export function StreamFilters({ filters, onChange, validationError }: Props) {
  const hasAny =
    filters.status !== '' || filters.source !== '' || filters.from !== null || filters.to !== null

  function update<K extends keyof StreamFilterState>(key: K, value: StreamFilterState[K]) {
    onChange({ ...filters, [key]: value })
  }

  function handleClear() {
    onChange({ status: '', source: '', from: null, to: null })
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-on-surface">Filter sessions</h2>
        {hasAny && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            leftIcon={<X className="h-3.5 w-3.5" />}
            onClick={handleClear}
          >
            Clear filters
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          label="Status"
          options={STATUS_OPTIONS}
          value={filters.status}
          onChange={(e) => update('status', e.target.value as StreamSessionStatus | '')}
        />
        <Select
          label="Source"
          options={SOURCE_OPTIONS}
          value={filters.source}
          onChange={(e) => update('source', e.target.value as StreamSessionSource | '')}
        />
        <Input
          type="date"
          label="From"
          value={filters.from ?? ''}
          onChange={(e) => update('from', e.target.value === '' ? null : e.target.value)}
        />
        <Input
          type="date"
          label="To"
          value={filters.to ?? ''}
          onChange={(e) => update('to', e.target.value === '' ? null : e.target.value)}
        />
      </div>

      {validationError && (
        <p role="alert" className="text-[12px] text-error font-medium">
          {validationError}
        </p>
      )}
    </Card>
  )
}
