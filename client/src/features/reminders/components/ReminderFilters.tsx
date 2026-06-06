import { Search } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { cn } from '@/utils/cn'

export type ReminderActiveFilter = 'all' | 'active' | 'inactive'

interface ReminderFiltersProps {
  searchTerm: string
  onSearchChange: (value: string) => void
  filter: ReminderActiveFilter
  onFilterChange: (value: ReminderActiveFilter) => void
  total: number
  shown: number
}

const filterOptions: { value: ReminderActiveFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

export function ReminderFilters({
  searchTerm,
  onSearchChange,
  filter,
  onFilterChange,
  total,
  shown,
}: ReminderFiltersProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="w-full lg:max-w-md">
        <Input
          leftIcon={<Search className="h-4 w-4" />}
          placeholder="Search by type, description, frequency, or time"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search reminders"
        />
      </div>
      <div className="flex items-center gap-3 justify-between lg:justify-end">
        <div
          role="tablist"
          aria-label="Filter reminders by status"
          className="inline-flex rounded-full border border-outline-variant/40 bg-surface-container-low p-1"
        >
          {filterOptions.map((opt) => {
            const selected = opt.value === filter
            return (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onFilterChange(opt.value)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  selected
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface',
                )}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
        {total > 0 && (
          <span className="text-xs text-text-muted whitespace-nowrap">
            Showing {shown} of {total}
          </span>
        )}
      </div>
    </div>
  )
}
