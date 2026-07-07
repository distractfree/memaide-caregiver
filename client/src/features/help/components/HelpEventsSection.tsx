import { History, Inbox, LifeBuoy } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { HelpEventTimeline } from '@/features/help/components/HelpEventTimeline'
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
  validationError: string | null
  onFiltersChange: (next: HelpEventsFiltersValue) => void
  onRetry: () => void
}

export function HelpEventsSection({
  events,
  status,
  error,
  filters,
  validationError,
  onFiltersChange,
  onRetry,
}: HelpEventsSectionProps) {
  const hasActiveFilter =
    filters.sourceDevice !== undefined ||
    filters.status !== undefined ||
    filters.from !== undefined ||
    filters.to !== undefined

  return (
    <Card className="flex h-full flex-col gap-5">
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent-dark">
            <History className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-on-surface">Recent help events</h2>
            <p className="text-xs text-text-muted">
              Each entry records a press of the help button on the patient&rsquo;s phone or
              watch.
            </p>
          </div>
        </div>
        <HelpEventsFilters filters={filters} onChange={onFiltersChange} />
        {validationError && (
          <p role="alert" className="text-[12px] font-medium text-error">
            {validationError}
          </p>
        )}
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
              className="rounded-xl border border-error/30 bg-error-container/60 px-3 py-2.5 text-sm font-medium text-error"
            >
              {error}
            </div>
          )}
          {events.length === 0 ? (
            hasActiveFilter ? (
              <EmptyState
                icon={Inbox}
                title="No events match these filters"
                message="Clear the filters to see all recorded help events."
              />
            ) : (
              <EmptyState
                icon={LifeBuoy}
                title="No help events yet"
                message="When the patient uses the help button, each event will appear here with its source and outcome."
              />
            )
          ) : (
            <HelpEventTimeline events={events} />
          )}
        </>
      )}
    </Card>
  )
}
