import { motion } from 'framer-motion'
import { Loader2, Pencil, Power, Radar, Ruler, Timer, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { BeaconStatusBadge } from '@/features/beacons/components/BeaconStatusBadge'
import { cn } from '@/utils/cn'
import { formatDate } from '@/utils/formatting'
import type { Beacon } from '@/types/domain'
import type { MouseEvent, ReactNode } from 'react'

interface BeaconCardProps {
  beacon: Beacon
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

function formatThreshold(m: number): string {
  if (!Number.isFinite(m)) return '—'
  const rounded = Math.round(m * 10) / 10
  return `~${rounded} m`
}

function formatMajorMinor(major: number | null, minor: number | null): string {
  if (major === null && minor === null) return 'Major/Minor not set'
  const parts: string[] = []
  parts.push(`Major ${major ?? '—'}`)
  parts.push(`Minor ${minor ?? '—'}`)
  return parts.join(' · ')
}

export function BeaconCard({
  beacon,
  toggling,
  onToggle,
  onEdit,
  onDelete,
  motionIndex,
}: BeaconCardProps) {
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
          'flex flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-5',
          !beacon.active && 'opacity-80',
        )}
      >
        <div
          className={cn(
            'flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl',
            beacon.active
              ? 'bg-accent/10 text-accent-dark'
              : 'bg-surface-container-high text-on-surface-variant',
          )}
          aria-hidden="true"
        >
          <Radar className="h-6 w-6" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-on-surface truncate" title={beacon.roomName}>
              {beacon.roomName}
            </h3>
            <BeaconStatusBadge active={beacon.active} />
          </div>

          <p
            className="mt-1 text-[12px] font-mono text-text-muted break-all line-clamp-1"
            title={beacon.beaconUuid}
          >
            {beacon.beaconUuid}
          </p>

          <p className="mt-2 text-[12px] text-on-surface-variant">
            {formatMajorMinor(beacon.major, beacon.minor)}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/40 bg-surface-container-low px-2.5 py-1 text-[12px] font-medium text-on-surface-variant">
              <Ruler className="h-3 w-3" />
              {formatThreshold(beacon.thresholdDistanceM)} approximate
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/40 bg-surface-container-low px-2.5 py-1 text-[12px] font-medium text-on-surface-variant">
              <Timer className="h-3 w-3" />
              ≥ {beacon.dwellSeconds}s dwell
            </span>
          </div>

          <p className="mt-2 text-[11px] text-text-muted">
            Updated {formatDate(beacon.updatedAt)}
          </p>
        </div>

        <div className="flex items-center justify-end gap-1 sm:border-l sm:border-outline-variant/30 sm:pl-3">
          {iconButton({
            label: toggling
              ? 'Updating beacon status'
              : beacon.active
                ? 'Pause this beacon'
                : 'Activate this beacon',
            icon: toggling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Power className="h-4 w-4" />
            ),
            onClick: onToggle,
            disabled: toggling,
          })}
          {iconButton({
            label: 'Edit beacon',
            icon: <Pencil className="h-4 w-4" />,
            onClick: onEdit,
            disabled: toggling,
          })}
          {iconButton({
            label: 'Delete beacon',
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
