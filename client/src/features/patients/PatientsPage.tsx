import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Search, Users } from 'lucide-react'
// import { Badge } from '@/components/ui/Badge' // Temporarily unused per UI cleanup request
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Input } from '@/components/ui/Input'
import { LoadingState } from '@/components/ui/LoadingState'
import { usePatients } from '@/features/patients/PatientContext'
// import { PatientStatCards } from '@/features/patients/components/PatientStatCards' // Temporarily hidden per UI cleanup request
import { PatientList } from '@/features/patients/components/PatientList'
import { PatientDetailsPanel } from '@/features/patients/components/PatientDetailsPanel'
import { PatientFormModal } from '@/features/patients/components/PatientFormModal'
import { DeletePatientModal } from '@/features/patients/components/DeletePatientModal'
import { api } from '@/services/apiClient'
import type { Patient } from '@/types/domain'

type ModalState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; patient: Patient }
  | { kind: 'delete'; patient: Patient }

export function PatientsPage() {
  const {
    patients,
    selectedPatientId,
    selectedPatient,
    status,
    error,
    setSelectedPatient,
    refresh,
  } = usePatients()

  const [searchTerm, setSearchTerm] = useState('')
  const [viewedPatientId, setViewedPatientId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>({ kind: 'none' })

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return patients
    return patients.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.phoneNumber ?? '').toLowerCase().includes(q) ||
        (p.deviceId ?? '').toLowerCase().includes(q),
    )
  }, [patients, searchTerm])

  const viewedPatient = useMemo(() => {
    if (viewedPatientId) {
      return patients.find((p) => p.id === viewedPatientId) ?? selectedPatient
    }
    return selectedPatient
  }, [patients, viewedPatientId, selectedPatient])

  // const withDeviceCount = useMemo(
  //   () => patients.filter((p) => p.deviceId).length,
  //   [patients],
  // ) // Temporarily unused per UI cleanup request

  function openCreate() {
    setModal({ kind: 'create' })
  }
  function openEdit(patient: Patient) {
    setModal({ kind: 'edit', patient })
  }
  function openDelete(patient: Patient) {
    setModal({ kind: 'delete', patient })
  }
  function closeModal() {
    setModal({ kind: 'none' })
  }

  function handleView(id: string) {
    setViewedPatientId(id)
  }

  async function handleCreateSuccess(p: Patient) {
    if (!selectedPatientId) {
      setSelectedPatient(p.id)
    }
    await refresh()
    closeModal()
  }

  async function handleEditSuccess() {
    await refresh()
    closeModal()
  }

  async function handleDeleteConfirm(p: Patient) {
    await api.deletePatient(p.id)
    if (viewedPatientId === p.id) setViewedPatientId(null)
    await refresh()
    closeModal()
  }

  const searchActive = searchTerm.trim().length > 0
  const showCountBadge = patients.length > 0

  const viewedIsSelected =
    !!viewedPatient && !!selectedPatientId && viewedPatient.id === selectedPatientId

  return (
    <motion.div
      className="flex flex-col gap-6"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-semibold tracking-tight text-on-surface">Patients</h1>
            {patients.length > 0 && (
              <span className="text-sm text-on-surface-variant">
                Total: {patients.length}
              </span>
            )}
          </div>
        </div>
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
          Add patient
        </Button>
      </div>

      {/* Summary stats - temporarily hidden per UI cleanup request */}
      {/* <PatientStatCards
        total={patients.length}
        withDeviceCount={withDeviceCount}
        selectedPatient={selectedPatient}
      /> */}

      {/* Search */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-md">
          <Input
            leftIcon={<Search className="h-4 w-4" />}
            placeholder="Search by name, phone, or device ID"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search patient profiles"
          />
        </div>
        {showCountBadge && (
          <span className="text-xs text-text-muted">
            Showing {filtered.length} of {patients.length}
          </span>
        )}
      </div>

      {/* Body */}
      {status === 'loading' && patients.length === 0 ? (
        <LoadingState label="Loading patients…" />
      ) : status === 'error' ? (
        <ErrorState
          title="Unable to load patients"
          message={error ?? 'Something went wrong. Please try again.'}
          onRetry={() => void refresh()}
        />
      ) : patients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No patient profiles yet"
          message="Add a patient profile to connect reminder support and caregiver coordination."
          action={
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
              Add patient
            </Button>
          }
        />
      ) : (
        <div className="grid gap-gutter lg:grid-cols-3">
          <div className="lg:col-span-2">
            <PatientList
              patients={filtered}
              searchActive={searchActive}
              selectedPatientId={selectedPatientId}
              viewedPatientId={viewedPatientId}
              onView={handleView}
              onSelect={setSelectedPatient}
              onEdit={openEdit}
              onDelete={openDelete}
            />
          </div>
          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-24">
              <PatientDetailsPanel
                patient={viewedPatient}
                isSelected={viewedIsSelected}
                onSelect={() => {
                  if (viewedPatient) setSelectedPatient(viewedPatient.id)
                }}
                onEdit={() => {
                  if (viewedPatient) openEdit(viewedPatient)
                }}
                onDelete={() => {
                  if (viewedPatient) openDelete(viewedPatient)
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {modal.kind === 'create' && (
        <PatientFormModal
          key="create"
          open
          mode="create"
          onClose={closeModal}
          onSuccess={handleCreateSuccess}
        />
      )}
      {modal.kind === 'edit' && (
        <PatientFormModal
          key={`edit-${modal.patient.id}`}
          open
          mode="edit"
          patient={modal.patient}
          onClose={closeModal}
          onSuccess={handleEditSuccess}
        />
      )}
      {modal.kind === 'delete' && (
        <DeletePatientModal
          key={`delete-${modal.patient.id}`}
          open
          patient={modal.patient}
          onClose={closeModal}
          onConfirm={() => handleDeleteConfirm(modal.patient)}
        />
      )}
    </motion.div>
  )
}
