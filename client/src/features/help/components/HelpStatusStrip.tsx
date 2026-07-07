import type { ComponentType } from 'react'
import { ChevronDown, Clock, LifeBuoy, MessageCircle, Sparkles } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/utils/cn'
import type { HelpContact, HelpEvent, AiSession } from '@/types/domain'

type SectionStatus = 'idle' | 'loading' | 'ready' | 'error'

interface HelpStatusStripProps {
  contact: HelpContact | null
  contactStatus: SectionStatus
  events: HelpEvent[]
  eventsStatus: SectionStatus
  sessions: AiSession[]
  sessionsStatus: SectionStatus
  isContactOpen?: boolean
  onToggleContact?: () => void
}

const PENDING = '—'

// Compact, at-a-glance summary derived entirely from already-fetched data.
// Deliberately lighter than the *StatCards pattern so Help does not read as a
// dashboard: label + value + caption, no oversized numerals.
export function HelpStatusStrip({
  contact,
  contactStatus,
  events,
  eventsStatus,
  sessions,
  sessionsStatus,
  isContactOpen,
  onToggleContact,
}: HelpStatusStripProps) {
  const contactReady = contactStatus === 'ready' || contactStatus === 'error'
  const configured = Boolean(contact)

  const lastEvent = eventsStatus === 'ready' ? mostRecentEvent(events) : null
  const activeSessions =
    sessionsStatus === 'ready'
      ? sessions.filter((s) => s.status === 'active').length
      : null

  return (
    <div className="grid gap-gutter grid-cols-2 lg:grid-cols-4">
      <Tile
        icon={MessageCircle}
        tone={contactReady && configured ? 'accent' : 'muted'}
        label="Help contact"
        value={!contactReady ? PENDING : configured ? 'Configured' : 'Not configured'}
        caption={contactReady && configured ? contact?.label : 'WhatsApp caregiver number'}
        onClick={onToggleContact}
        interactive={Boolean(onToggleContact)}
        isOpen={isContactOpen}
      />
      <Tile
        icon={LifeBuoy}
        tone="muted"
        label="Help events"
        value={eventsStatus === 'ready' ? String(events.length) : PENDING}
        caption="In current view"
      />
      <Tile
        icon={Clock}
        tone="muted"
        label="Last event"
        value={lastEvent ? relativeTime(lastEvent.triggeredAt) : PENDING}
        caption={lastEvent ? labelForStatus(lastEvent.status) : 'No help events yet'}
      />
      <Tile
        icon={Sparkles}
        tone={activeSessions && activeSessions > 0 ? 'accent' : 'muted'}
        label="AI sessions"
        value={
          activeSessions === null
            ? PENDING
            : activeSessions > 0
              ? `${activeSessions} active`
              : 'None active'
        }
        caption={
          sessionsStatus === 'ready' ? `${sessions.length} total` : 'Support sessions'
        }
      />
    </div>
  )
}

function Tile({
  icon: Icon,
  tone,
  label,
  value,
  caption,
  onClick,
  interactive,
  isOpen,
}: {
  icon: ComponentType<{ className?: string }>
  tone: 'accent' | 'muted'
  label: string
  value: string
  caption?: string | null
  onClick?: () => void
  interactive?: boolean
  isOpen?: boolean
}) {
  return (
    <Card
      padded={false}
      interactive={interactive}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 p-4 select-none relative',
        interactive && 'active:scale-[0.98]'
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl',
          tone === 'accent'
            ? 'bg-accent/10 text-accent-dark'
            : 'bg-surface-container-high text-on-surface-variant',
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1 pr-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          {label}
        </p>
        <p className="truncate text-sm font-semibold text-on-surface">{value}</p>
        {caption && <p className="truncate text-xs text-text-muted">{caption}</p>}
      </div>
      {interactive && (
        <span className="absolute right-4 text-text-muted">
          <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isOpen && "rotate-180")} />
        </span>
      )}
    </Card>
  )
}

function mostRecentEvent(events: HelpEvent[]): HelpEvent | null {
  if (events.length === 0) return null
  return events.reduce((latest, e) =>
    new Date(e.triggeredAt).getTime() > new Date(latest.triggeredAt).getTime() ? e : latest,
  )
}

function labelForStatus(status: string): string {
  switch (status) {
    case 'triggered':
      return 'Triggered'
    case 'whatsapp_opened':
      return 'WhatsApp opened'
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Cancelled'
    default:
      return status
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return PENDING
  const diffMs = Date.now() - then
  const min = Math.round(diffMs / 60000)
  if (min < 1) return 'Just now'
  if (min < 60) return `${min}m ago`
  const hrs = Math.round(min / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
