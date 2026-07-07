import { cn } from '@/utils/cn'
import type { ReminderEventStatus } from '@/types/domain'

const STATUS_LABEL: Record<ReminderEventStatus, string> = {
  scheduled: 'Scheduled',
  delivered: 'Delivered',
  acknowledged: 'Acknowledged',
  missed: 'Missed',
}

const STATUS_COLOR_CLASS: Record<ReminderEventStatus, string> = {
  scheduled: 'text-text-muted',
  delivered: 'text-accent-dark',
  acknowledged: 'text-green-700',
  missed: 'text-error',
}

interface ReminderStatusBadgeProps {
  status: ReminderEventStatus | string
  className?: string
}

export function ReminderStatusBadge({ status, className }: ReminderStatusBadgeProps) {
  const known = (status in STATUS_LABEL) ? (status as ReminderEventStatus) : null
  if (!known) {
    return (
      <span className={cn('text-[11px] font-semibold uppercase tracking-wider text-text-muted', className)}>
        {String(status)}
      </span>
    )
  }
  return (
    <span className={cn('text-[11px] font-semibold uppercase tracking-wider', STATUS_COLOR_CLASS[known], className)}>
      {STATUS_LABEL[known]}
    </span>
  )
}
