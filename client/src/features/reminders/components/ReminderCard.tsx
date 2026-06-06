import { motion } from 'framer-motion'
import { Loader2, Pencil, Power, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { cn } from '@/utils/cn'
import { formatDate } from '@/utils/formatting'
import type { Reminder } from '@/types/domain'
import type { MouseEvent, ReactNode } from 'react'

interface ReminderCardProps {
  reminder: Reminder
  toggling: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  motionIndex: number
}

function iconButton({
  label,
  icon,
  onClick,
  disabled,
  danger,
}: {
  label: string
  icon: ReactNode
  onClick: (e: MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:pointer-events-none',
        danger && 'hover:text-error',
      )}
    >
      {icon}
    </button>
  )
}

export function ReminderCard({
  reminder,
  toggling,
  onToggle,
  onEdit,
  onDelete,
  motionIndex,
}: ReminderCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2, delay: Math.min(motionIndex, 8) * 0.02 }}
      layout
    >
      <Card
        className={cn(
          'flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5',
          !reminder.active && 'opacity-80',
        )}
      >
        <div
          className={cn(
            'flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl font-semibold',
            reminder.active
              ? 'bg-accent/10 text-accent-dark'
              : 'bg-surface-container-high text-on-surface-variant',
          )}
          aria-label={`Time of day ${reminder.timeOfDay}`}
        >
          <span className="text-lg leading-none tracking-tight">{reminder.timeOfDay}</span>
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider opacity-70">
            24h
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="muted">{reminder.type}</Badge>
            <Badge tone={reminder.active ? 'success' : 'muted'} dot>
              {reminder.active ? 'Active' : 'Inactive'}
            </Badge>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              {reminder.frequency}
            </span>
          </div>
          <p className="mt-2 text-sm text-on-surface line-clamp-2 break-words">
            {reminder.description}
          </p>
          <p className="mt-1 text-[11px] text-text-muted">
            Updated {formatDate(reminder.updatedAt)}
          </p>
        </div>

        <div className="flex items-center justify-end gap-1 sm:border-l sm:border-outline-variant/30 sm:pl-3">
          {iconButton({
            label: toggling
              ? 'Updating reminder status'
              : reminder.active
                ? 'Pause this reminder'
                : 'Activate this reminder',
            icon: toggling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Power className="h-4 w-4" />
            ),
            onClick: onToggle,
            disabled: toggling,
          })}
          {iconButton({
            label: 'Edit reminder',
            icon: <Pencil className="h-4 w-4" />,
            onClick: onEdit,
            disabled: toggling,
          })}
          {iconButton({
            label: 'Delete reminder',
            icon: <Trash2 className="h-4 w-4" />,
            onClick: onDelete,
            disabled: toggling,
            danger: true,
          })}
        </div>
      </Card>
    </motion.div>
  )
}
