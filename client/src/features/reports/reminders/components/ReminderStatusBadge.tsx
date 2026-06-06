import { Badge } from '@/components/ui/Badge'
import type { ReminderEventStatus } from '@/types/domain'

const STATUS_LABEL: Record<ReminderEventStatus, string> = {
  scheduled: 'Scheduled',
  delivered: 'Delivered',
  acknowledged: 'Acknowledged',
  missed: 'Missed',
}

const STATUS_TONE: Record<ReminderEventStatus, 'neutral' | 'accent' | 'success' | 'danger'> = {
  scheduled: 'neutral',
  delivered: 'accent',
  acknowledged: 'success',
  missed: 'danger',
}

interface ReminderStatusBadgeProps {
  status: ReminderEventStatus | string
  className?: string
}

export function ReminderStatusBadge({ status, className }: ReminderStatusBadgeProps) {
  const known = (status in STATUS_LABEL) ? (status as ReminderEventStatus) : null
  if (!known) {
    return (
      <Badge tone="muted" className={className}>
        {String(status)}
      </Badge>
    )
  }
  return (
    <Badge tone={STATUS_TONE[known]} dot className={className}>
      {STATUS_LABEL[known]}
    </Badge>
  )
}
