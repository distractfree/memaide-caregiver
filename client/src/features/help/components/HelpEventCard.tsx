import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { HelpSourceBadge } from '@/features/help/components/HelpSourceBadge'
import { HelpStatusBadge } from '@/features/help/components/HelpStatusBadge'
import { cn } from '@/utils/cn'
import type { HelpEvent, HelpEventStatus } from '@/types/domain'

interface HelpEventCardProps {
  event: HelpEvent
  index: number
  isLast: boolean
}

const dotTone: Record<HelpEventStatus, string> = {
  triggered: 'bg-accent',
  whatsapp_opened: 'bg-green-500',
  failed: 'bg-error',
  cancelled: 'bg-text-muted',
}

// A single scannable timeline row: status-tinted dot on a connecting rule,
// then the event's status, source, and time — no repeated prose.
export function HelpEventCard({ event, index, isLast }: HelpEventCardProps) {
  const hasAiSession = event.aiSessions && event.aiSessions.length > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.18) }}
      className="relative flex gap-3 pb-3 last:pb-0"
    >
      {!isLast && (
        <span
          aria-hidden
          className="absolute left-[6px] top-4 bottom-0 w-px bg-outline-variant/40"
        />
      )}
      <span
        aria-hidden
        className={cn(
          'relative z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full ring-4 ring-surface-container-lowest',
          dotTone[event.status as HelpEventStatus] ?? 'bg-outline',
        )}
      />
      <div className="min-w-0 flex-1 rounded-xl border border-outline-variant/30 bg-surface-bright p-3">
        <div className="flex flex-wrap items-center gap-2">
          <HelpStatusBadge status={event.status} />
          <HelpSourceBadge source={event.sourceDevice} />
          {hasAiSession && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-accent-dark">
              <Sparkles className="h-3 w-3" />
              AI session
            </span>
          )}
          <span className="ml-auto text-xs font-medium text-text-muted">
            {formatTime(event.triggeredAt)}
          </span>
        </div>
        <p className="mt-2 text-xs text-text-muted">
          WhatsApp{' '}
          <span className="font-mono text-on-surface-variant">{event.whatsappNumber}</span>
        </p>
      </div>
    </motion.div>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
