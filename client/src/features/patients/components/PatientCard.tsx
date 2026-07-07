import { motion } from 'framer-motion'
import { Calendar, Check, Pencil, Phone, Smartphone, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { cn } from '@/utils/cn'
import { formatDate, formatPhone, initialsFromName } from '@/utils/formatting'
import type { Patient } from '@/types/domain'
import type { MouseEvent } from 'react'

interface PatientCardProps {
  patient: Patient
  isSelected: boolean
  isViewed: boolean
  onView: () => void
  onSelect: () => void
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
  icon: React.ReactNode
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

export function PatientCard({
  patient,
  isSelected,
  isViewed,
  onView,
  onSelect,
  onEdit,
  onDelete,
  motionIndex,
}: PatientCardProps) {
  const stop =
    (handler: () => void) =>
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation()
      handler()
    }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2, delay: Math.min(motionIndex, 8) * 0.025 }}
      layout
    >
      <Card
        interactive
        onClick={onView}
        className={cn(
          'relative flex flex-col gap-4 h-full',
          isViewed && 'ring-2 ring-accent ring-offset-2 ring-offset-background',
        )}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent-dark text-sm font-semibold">
            {initialsFromName(patient.name)}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-base font-semibold text-on-surface">{patient.name}</p>
              {isSelected && (
                <Badge tone="accent" dot>
                  Selected
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-text-muted">
              Added {formatDate(patient.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 text-xs text-on-surface-variant">
          <p className="inline-flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{formatPhone(patient.phoneNumber)}</span>
          </p>
          <p className="inline-flex items-center gap-1.5">
            <Smartphone className="h-3.5 w-3.5 shrink-0" />
            {patient.deviceId ? (
              <span className="truncate font-mono">{patient.deviceId}</span>
            ) : (
              <span className="text-text-muted">No device paired</span>
            )}
          </p>
          <p className="inline-flex items-center gap-1.5 text-text-muted">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            <span>Updated {formatDate(patient.updatedAt)}</span>
          </p>
        </div>

        <div
          className="mt-auto flex items-center justify-end gap-1 border-t border-outline-variant/30 pt-3"
          onClick={(e) => e.stopPropagation()}
        >
          {iconButton({
            label: isSelected ? 'Already selected' : 'Set as selected patient',
            icon: <Check className="h-4 w-4" />,
            onClick: stop(onSelect),
            disabled: isSelected,
          })}
          {iconButton({
            label: 'Edit patient',
            icon: <Pencil className="h-4 w-4" />,
            onClick: stop(onEdit),
          })}
          {iconButton({
            label: 'Delete patient',
            icon: <Trash2 className="h-4 w-4" />,
            onClick: stop(onDelete),
            danger: true,
          })}
        </div>
      </Card>
    </motion.div>
  )
}
