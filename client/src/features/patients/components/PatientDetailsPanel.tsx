import { AnimatePresence, motion } from 'framer-motion'
import { Calendar, Check, Pencil, Phone, Smartphone, Trash2, User2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatDateTime, formatPhone, initialsFromName } from '@/utils/formatting'
import type { Patient } from '@/types/domain'

interface PatientDetailsPanelProps {
  patient: Patient | null
  isSelected: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
}

export function PatientDetailsPanel({
  patient,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
}: PatientDetailsPanelProps) {
  if (!patient) {
    return (
      <Card>
        <EmptyState
          icon={User2}
          title="No patient viewed"
          message="Pick a patient from the list to see their full profile."
        />
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-5 overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={patient.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col gap-5"
        >
          <div className="flex items-start gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent-dark text-lg font-semibold">
              {initialsFromName(patient.name)}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xl font-semibold tracking-tight text-on-surface break-words">
                {patient.name}
              </p>
              {isSelected && (
                <div className="mt-1.5">
                  <Badge tone="accent" dot>
                    Selected patient
                  </Badge>
                </div>
              )}
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-3 text-sm">
            <div className="flex items-start gap-3">
              <Phone className="h-4 w-4 mt-0.5 text-on-surface-variant shrink-0" />
              <div className="min-w-0">
                <dt className="text-[11px] uppercase tracking-wider text-text-muted font-semibold">
                  Phone number
                </dt>
                <dd className="mt-0.5 text-on-surface break-words">
                  {formatPhone(patient.phoneNumber)}
                </dd>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Smartphone className="h-4 w-4 mt-0.5 text-on-surface-variant shrink-0" />
              <div className="min-w-0">
                <dt className="text-[11px] uppercase tracking-wider text-text-muted font-semibold">
                  Patient device ID
                </dt>
                <dd className="mt-0.5 break-all">
                  {patient.deviceId ? (
                    <span className="font-mono text-on-surface">{patient.deviceId}</span>
                  ) : (
                    <span className="text-text-muted">No device paired</span>
                  )}
                </dd>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar className="h-4 w-4 mt-0.5 text-on-surface-variant shrink-0" />
              <div className="min-w-0">
                <dt className="text-[11px] uppercase tracking-wider text-text-muted font-semibold">
                  Added
                </dt>
                <dd className="mt-0.5 text-on-surface">{formatDateTime(patient.createdAt)}</dd>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar className="h-4 w-4 mt-0.5 text-on-surface-variant shrink-0" />
              <div className="min-w-0">
                <dt className="text-[11px] uppercase tracking-wider text-text-muted font-semibold">
                  Last updated
                </dt>
                <dd className="mt-0.5 text-on-surface">{formatDateTime(patient.updatedAt)}</dd>
              </div>
            </div>

            <div className="rounded-xl bg-surface-section px-3 py-2.5">
              <dt className="text-[11px] uppercase tracking-wider text-text-muted font-semibold">
                Patient ID
              </dt>
              <dd className="mt-0.5 font-mono text-[11px] text-on-surface-variant break-all">
                {patient.id}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Check className="h-4 w-4" />}
              onClick={onSelect}
              disabled={isSelected}
            >
              {isSelected ? 'Already selected' : 'Set as selected'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Pencil className="h-4 w-4" />}
              onClick={onEdit}
            >
              Edit
            </Button>
            <Button
              variant="danger"
              size="sm"
              leftIcon={<Trash2 className="h-4 w-4" />}
              onClick={onDelete}
            >
              Delete
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>
    </Card>
  )
}
