import { History, Inbox, LifeBuoy } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { HelpEventCard } from '@/features/help/components/HelpEventCard'
import {
  HelpEventsFilters,
  type HelpEventsFiltersValue,
} from '@/features/help/components/HelpEventsFilters'
import type { HelpEvent } from '@/types/domain'

interface HelpEventsSectionProps {
  events: HelpEvent[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  filters: HelpEventsFiltersValue
  onFiltersChange: (next: HelpEventsFiltersValue) => void
  onRetry: () => void
}

export function HelpEventsSection({
  events,
  status,
  error,
  filters,
  onFiltersChange,
  onRetry,
}: HelpEventsSectionProps) {
  const hasActiveFilter = filters.sourceDevice !== undefined || filters.status !== undefined

  return (
    <Card className="flex flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent-dark">
            <History className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-on-surface">Help button events</h2>
            <p className="text-xs text-text-muted">
              Help flow activity from the patient app and watch, newest first.
            </p>
          </div>
        </div>
        <HelpEventsFilters filters={filters} onChange={onFiltersChange} />
      </header>

      {status === 'loading' && events.length === 0 ? (
        <LoadingState label="Loading help events…" />
      ) : status === 'error' && events.length === 0 ? (
        <ErrorState
          title="Unable to load help events"
          message={error ?? 'Something went wrong. Please try again.'}
          onRetry={onRetry}
        />
      ) : (
        <>
          {status === 'error' && error && (
            <div
              role="alert"
              className="rounded-xl border border-error/30 bg-error-container/60 px-3 py-2.5 text-sm text-error font-medium"
            >
              {error}
            </div>
          )}
          {events.length === 0 ? (
            hasActiveFilter ? (
              <EmptyState
                icon={Inbox}
                title="No help events match these filters"
                message="Try clearing filters to see all recorded help button events."
              />
            ) : (
              <EmptyState
                icon={LifeBuoy}
                title="No help button events found yet"
                message="When the patient triggers the help button, events will appear here."
              />
            )
          ) : (
            <div className="flex flex-col gap-3">
              {events.map((event, idx) => (
                <HelpEventCard key={event.id} event={event} index={idx} />
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  )
}
