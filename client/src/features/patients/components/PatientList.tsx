import { AnimatePresence } from 'framer-motion'
import { SearchX } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PatientCard } from '@/features/patients/components/PatientCard'
import type { Patient } from '@/types/domain'

interface PatientListProps {
  patients: Patient[]
  searchActive: boolean
  selectedPatientId: string | null
  viewedPatientId: string | null
  onView: (id: string) => void
  onSelect: (id: string) => void
  onEdit: (patient: Patient) => void
  onDelete: (patient: Patient) => void
}

export function PatientList({
  patients,
  searchActive,
  selectedPatientId,
  viewedPatientId,
  onView,
  onSelect,
  onEdit,
  onDelete,
}: PatientListProps) {
  if (patients.length === 0 && searchActive) {
    return (
      <Card>
        <EmptyState
          icon={SearchX}
          title="No matches"
          message="Try a different search term or clear the search to see all patient profiles."
        />
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
      <AnimatePresence mode="popLayout">
        {patients.map((patient, idx) => (
          <PatientCard
            key={patient.id}
            patient={patient}
            isSelected={patient.id === selectedPatientId}
            isViewed={patient.id === viewedPatientId}
            onView={() => onView(patient.id)}
            onSelect={() => onSelect(patient.id)}
            onEdit={() => onEdit(patient)}
            onDelete={() => onDelete(patient)}
            motionIndex={idx}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}
