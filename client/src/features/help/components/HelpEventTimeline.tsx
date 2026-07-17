import { useEffect, useId, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { HelpEventCard } from '@/features/help/components/HelpEventCard'
import type { HelpEvent } from '@/types/domain'

// Bound the initial render so a patient's lifetime help history never pushes the
// AI Support Sessions section far down the page. Each reveal adds another batch.
export const INITIAL_VISIBLE_HELP_EVENTS = 8
export const HELP_EVENTS_REVEAL_STEP = 8

interface HelpEventTimelineProps {
  events: HelpEvent[]
  // Changing this (patient or filter change) resets the visible window to the
  // initial 8. Defaults to a stable string so tests can omit it.
  resetKey?: string
}

interface DayGroup {
  key: string
  label: string
  events: HelpEvent[]
}

// Groups help events by calendar day (newest first) and renders each day as a
// labelled section of timeline rows. Only the currently visible slice is grouped,
// so a day heading never renders without at least one visible row beneath it.
export function HelpEventTimeline({ events, resetKey = '' }: HelpEventTimelineProps) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_HELP_EVENTS)
  const listId = useId()

  // Reset the reveal window whenever the patient or filters change.
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_HELP_EVENTS)
  }, [resetKey])

  // Sort once (newest → oldest), independent of the visible window, so revealing
  // more never reorders already-shown rows.
  const sorted = useMemo(
    () =>
      [...events].sort(
        (a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime(),
      ),
    [events],
  )

  const total = sorted.length
  const clampedVisible = Math.min(visibleCount, total)
  const visibleEvents = sorted.slice(0, clampedVisible)
  const groups = groupByDay(visibleEvents)

  const hasMore = clampedVisible < total
  const isExpanded = clampedVisible > INITIAL_VISIBLE_HELP_EVENTS
  const nextBatch = Math.min(HELP_EVENTS_REVEAL_STEP, total - clampedVisible)

  function showMore() {
    setVisibleCount((count) => Math.min(count + HELP_EVENTS_REVEAL_STEP, total))
  }
  function hideOlder() {
    setVisibleCount(INITIAL_VISIBLE_HELP_EVENTS)
  }

  return (
    <div className="flex flex-col gap-5">
      <div id={listId} className="flex flex-col gap-6">
        {groups.map((group) => (
          <section key={group.key}>
            <div className="mb-3 flex items-center gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                {group.label}
              </span>
              <span aria-hidden className="h-px flex-1 bg-outline-variant/40" />
              <span className="text-[11px] font-medium text-text-muted">
                {group.events.length}
              </span>
            </div>
            <div className="flex flex-col">
              {group.events.map((event, idx) => (
                <HelpEventCard
                  key={event.id}
                  event={event}
                  index={idx}
                  isLast={idx === group.events.length - 1}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {(hasMore || isExpanded) && (
        <div className="flex flex-wrap items-center gap-3">
          {hasMore && (
            <button
              type="button"
              onClick={showMore}
              aria-expanded={isExpanded}
              aria-controls={listId}
              className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/50 bg-surface-container-lowest px-3 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              Show {nextBatch} older {nextBatch === 1 ? 'event' : 'events'}
            </button>
          )}
          {isExpanded && (
            <button
              type="button"
              onClick={hideOlder}
              aria-expanded={isExpanded}
              aria-controls={listId}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition-colors hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
              Hide older events
            </button>
          )}
          <span className="ml-auto text-[11px] font-medium text-text-muted">
            {clampedVisible} shown · {total} total
          </span>
        </div>
      )}
    </div>
  )
}

function groupByDay(events: HelpEvent[]): DayGroup[] {
  const map = new Map<string, HelpEvent[]>()
  for (const event of events) {
    const d = new Date(event.triggeredAt)
    const key = Number.isNaN(d.getTime()) ? event.triggeredAt : dayKey(d)
    const bucket = map.get(key)
    if (bucket) bucket.push(event)
    else map.set(key, [event])
  }

  return Array.from(map.entries()).map(([key, groupEvents]) => ({
    key,
    label: dayLabel(groupEvents[0]!.triggeredAt),
    events: groupEvents,
  }))
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso

  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (isSameDay(d, today)) return 'Today'
  if (isSameDay(d, yesterday)) return 'Yesterday'

  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  })
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
