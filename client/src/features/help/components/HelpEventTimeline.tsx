import { HelpEventCard } from '@/features/help/components/HelpEventCard'
import type { HelpEvent } from '@/types/domain'

interface HelpEventTimelineProps {
  events: HelpEvent[]
}

interface DayGroup {
  key: string
  label: string
  events: HelpEvent[]
}

// Groups help events by calendar day (newest first) and renders each day as a
// labelled section of timeline rows.
export function HelpEventTimeline({ events }: HelpEventTimelineProps) {
  const groups = groupByDay(events)

  return (
    <div className="flex flex-col gap-6">
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
  )
}

function groupByDay(events: HelpEvent[]): DayGroup[] {
  const sorted = [...events].sort(
    (a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime(),
  )

  const map = new Map<string, HelpEvent[]>()
  for (const event of sorted) {
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
