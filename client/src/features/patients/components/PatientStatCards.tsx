import { Smartphone, Users } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { formatPhone, initialsFromName } from '@/utils/formatting'
import type { Patient } from '@/types/domain'

interface PatientStatCardsProps {
  total: number
  withDeviceCount: number
  selectedPatient: Patient | null
}

export function PatientStatCards({ total, withDeviceCount, selectedPatient }: PatientStatCardsProps) {
  return (
    <div className="grid gap-gutter sm:grid-cols-3">
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Total patients
          </p>
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent/10 text-accent-dark">
            <Users className="h-4 w-4" />
          </span>
        </div>
        <p className="text-3xl font-semibold tracking-tight text-on-surface">{total}</p>
        <p className="text-xs text-text-muted">Active care coordination</p>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Currently selected
          </p>
        </div>
        {selectedPatient ? (
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent-dark text-sm font-semibold">
              {initialsFromName(selectedPatient.name)}
            </span>
            <div className="leading-tight min-w-0">
              <p className="truncate text-base font-semibold text-on-surface">
                {selectedPatient.name}
              </p>
              <p className="truncate text-xs text-text-muted">
                {formatPhone(selectedPatient.phoneNumber)}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant">No patient selected.</p>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Profiles with device ID
          </p>
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent/10 text-accent-dark">
            <Smartphone className="h-4 w-4" />
          </span>
        </div>
        <p className="text-3xl font-semibold tracking-tight text-on-surface">{withDeviceCount}</p>
        <p className="text-xs text-text-muted">
          {total > 0 ? `of ${total} total` : 'No patients yet'}
        </p>
      </Card>
    </div>
  )
}
