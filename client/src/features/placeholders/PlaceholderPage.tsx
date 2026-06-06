import { motion } from 'framer-motion'
import { type LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { usePatients } from '@/features/patients/PatientContext'

interface PlaceholderPageProps {
  title: string
  taskNumber: number | string
  description: string
  icon: LucideIcon
  bullets?: string[]
  showSelectedPatient?: boolean
}

export function PlaceholderPage({
  title,
  taskNumber,
  description,
  icon: Icon,
  bullets,
  showSelectedPatient = false,
}: PlaceholderPageProps) {
  const { selectedPatient } = usePatients()

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-6"
    >
      <div className="flex items-center gap-3">
        <Badge tone="muted">Task {taskNumber}</Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-on-surface">{title}</h1>
      </div>

      <Card className="flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent-dark">
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-on-surface">Coming in Task {taskNumber}</h2>
            <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">{description}</p>
          </div>
        </div>

        {bullets && bullets.length > 0 && (
          <ul className="flex flex-col gap-2 rounded-2xl bg-surface-section p-4">
            {bullets.map((b) => (
              <li key={b} className="flex gap-2 text-sm text-on-surface-variant">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}

        {showSelectedPatient && (
          <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-4">
            <p className="text-[11px] uppercase tracking-wider text-text-muted">Selected patient</p>
            <p className="mt-1 text-sm font-semibold text-on-surface">
              {selectedPatient ? selectedPatient.name : 'No patient selected'}
            </p>
          </div>
        )}
      </Card>
    </motion.div>
  )
}
