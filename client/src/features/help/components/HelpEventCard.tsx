import { motion } from 'framer-motion'
import { HelpSourceBadge } from '@/features/help/components/HelpSourceBadge'
import { HelpStatusBadge } from '@/features/help/components/HelpStatusBadge'
import { formatDateTime } from '@/utils/formatting'
import type { HelpEvent } from '@/types/domain'

interface HelpEventCardProps {
  event: HelpEvent
  index: number
}

export function HelpEventCard({ event, index }: HelpEventCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.18) }}
      className="relative rounded-xl border border-outline-variant/30 bg-surface-bright p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <HelpStatusBadge status={event.status} />
        <HelpSourceBadge source={event.sourceDevice} />
        {event.aiSessions && event.aiSessions.length > 0 && (
          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-accent-dark">
            AI Session: {event.aiSessions[0].status}
          </span>
        )}
        <span className="ml-auto text-xs text-text-muted">
          {formatDateTime(event.triggeredAt)}
        </span>
      </div>
      <p className="mt-3 text-sm text-on-surface">
        Help button triggered from{' '}
        <span className="font-semibold">{labelForSource(event.sourceDevice)}</span>.
      </p>
      <p className="mt-1 text-xs text-text-muted">
        WhatsApp number at trigger:{' '}
        <span className="font-mono text-on-surface-variant">{event.whatsappNumber}</span>
      </p>
    </motion.div>
  )
}

function labelForSource(source: string): string {
  if (source === 'phone') return 'the patient phone'
  if (source === 'watch') return 'the patient watch'
  if (source === 'system') return 'the system'
  return source
}
