import { Badge } from '@/components/ui/Badge'
import type { HelpEventStatus } from '@/types/domain'

interface HelpStatusBadgeProps {
  status: HelpEventStatus | string
}

const known: Record<HelpEventStatus, { label: string; tone: 'accent' | 'success' | 'danger' | 'muted' }> = {
  triggered: { label: 'Triggered', tone: 'accent' },
  whatsapp_opened: { label: 'WhatsApp opened', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
}

export function HelpStatusBadge({ status }: HelpStatusBadgeProps) {
  const entry = (known as Record<string, { label: string; tone: 'accent' | 'success' | 'danger' | 'muted' }>)[status]
  if (entry) {
    return <Badge tone={entry.tone} dot>{entry.label}</Badge>
  }
  return <Badge tone="neutral" dot>{status}</Badge>
}
