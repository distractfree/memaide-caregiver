import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Bell, Plus, Smartphone, UserPlus, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { usePatients } from '@/features/patients/PatientContext'
import { DeleteReminderModal } from '@/features/reminders/components/DeleteReminderModal'
import { ReminderFilters, type ReminderActiveFilter } from '@/features/reminders/components/ReminderFilters'
import { ReminderFormModal } from '@/features/reminders/components/ReminderFormModal'
import { ReminderList } from '@/features/reminders/components/ReminderList'
import { ReminderStatCards } from '@/features/reminders/components/ReminderStatCards'
import { api, ApiClientError } from '@/services/apiClient'
import { initialsFromName } from '@/utils/formatting'
import type { Reminder } from '@/types/domain'

type ModalState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; reminder: Reminder }
  | { kind: 'delete'; reminder: Reminder }

type PageStatus = 'idle' | 'loading' | 'ready' | 'error'

export function RemindersPage() {
  const { selectedPatient, selectedPatientId } = usePatients()

  const [reminders, setReminders] = useState<Reminder[]>([])
  const [status, setStatus] = useState<PageStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState<ReminderActiveFilter>('all')
  const [modal, setModal] = useState<ModalState>({ kind: 'none' })
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const prevPatientIdRef = useRef<string | null>(null)

  const loadReminders = useCallback(async (patientId: string) => {
    setStatus('loading')
    setError(null)
    try {
      const data = await api.listReminders(patientId)
      setReminders(data)
      setStatus('ready')
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message)
      } else {
        setError('Unable to load reminders.')
      }
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    const prev = prevPatientIdRef.current
    prevPatientIdRef.current = selectedPatientId

    if (!selectedPatientId) {
      setReminders([])
      setStatus('idle')
      setError(null)
      setActionError(null)
      setSearchTerm('')
      setFilter('all')
      if (prev) setModal({ kind: 'none' })
      return
    }

    // Patient changed, so close the modal to avoid saving to the wrong patient.
    if (prev && prev !== selectedPatientId) {
      setModal({ kind: 'none' })
      setActionError(null)
    }

    void loadReminders(selectedPatientId)
  }, [selectedPatientId, loadReminders])

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return reminders.filter((r) => {
      if (filter === 'active' && !r.active) return false
      if (filter === 'inactive' && r.active) return false
      if (!q) return true
      return (
        r.type.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.frequency.toLowerCase().includes(q) ||
        r.timeOfDay.toLowerCase().includes(q)
      )
    })
  }, [reminders, searchTerm, filter])

  const activeCount = useMemo(() => reminders.filter((r) => r.active).length, [reminders])
  const inactiveCount = reminders.length - activeCount

  const filterActive = searchTerm.trim().length > 0 || filter !== 'all'

  function openCreate() {
    setActionError(null)
    setModal({ kind: 'create' })
  }
  function openEdit(reminder: Reminder) {
    setActionError(null)
    setModal({ kind: 'edit', reminder })
  }
  function openDelete(reminder: Reminder) {
    setActionError(null)
    setModal({ kind: 'delete', reminder })
  }
  function closeModal() {
    setModal({ kind: 'none' })
  }

  async function handleCreateSuccess(created: Reminder) {
    setReminders((prev) => sortReminders([...prev, created]))
    closeModal()
  }

  async function handleEditSuccess(updated: Reminder) {
    setReminders((prev) =>
      sortReminders(prev.map((r) => (r.id === updated.id ? updated : r))),
    )
    closeModal()
  }

  async function handleDeleteConfirm(reminder: Reminder) {
    await api.deleteReminder(reminder.id)
    setReminders((prev) => prev.filter((r) => r.id !== reminder.id))
    closeModal()
  }

  async function handleToggleActive(reminder: Reminder) {
    setActionError(null)
    setTogglingId(reminder.id)
    try {
      const updated = await api.updateReminder(reminder.id, { active: !reminder.active })
      setReminders((prev) =>
        sortReminders(prev.map((r) => (r.id === updated.id ? updated : r))),
      )
    } catch (err) {
      if (err instanceof ApiClientError) {
        setActionError(err.message)
      } else {
        setActionError('Failed to update reminder.')
      }
    } finally {
      setTogglingId(null)
    }
  }

  // No patient selected, so show the empty state.
  if (!selectedPatientId) {
    return (
      <motion.div
        className="flex flex-col gap-6"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <PageHeader hasSelectedPatient={false} onCreate={openCreate} />
        <EmptyState
          icon={UserPlus}
          title="Select a patient to manage reminder support"
          message="Reminders are managed per patient. Choose a patient from the top bar, or open the Patients page to add one."
          action={
            <Link to="/patients">
              <Button leftIcon={<UserPlus className="h-4 w-4" />}>Go to patients</Button>
            </Link>
          }
        />
      </motion.div>
    )
  }

  return (
    <motion.div
      className="flex flex-col gap-6"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <PageHeader hasSelectedPatient={true} onCreate={openCreate} />

      {selectedPatient && <SelectedPatientPill patient={selectedPatient} />}

      {status === 'loading' && reminders.length === 0 ? (
        <LoadingState label="Loading reminders…" />
      ) : status === 'error' ? (
        <ErrorState
          title="Unable to load reminders"
          message={error ?? 'Something went wrong while contacting the backend.'}
          onRetry={() => void loadReminders(selectedPatientId)}
        />
      ) : (
        <>
          <ReminderStatCards
            total={reminders.length}
            activeCount={activeCount}
            inactiveCount={inactiveCount}
          />

          {actionError && (
            <div
              role="alert"
              className="flex items-start justify-between gap-3 rounded-xl border border-error/30 bg-error-container/60 px-3 py-2.5 text-sm text-error font-medium"
            >
              <span>{actionError}</span>
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={() => setActionError(null)}
                className="shrink-0 rounded-full p-1 hover:bg-error/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {reminders.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="No reminders yet"
              message="Add a reminder schedule to start surfacing it in the patient app."
              action={
                <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                  Add reminder
                </Button>
              }
            />
          ) : (
            <>
              <ReminderFilters
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                filter={filter}
                onFilterChange={setFilter}
                total={reminders.length}
                shown={filtered.length}
              />
              <ReminderList
                reminders={filtered}
                filterActive={filterActive}
                togglingId={togglingId}
                onToggle={(r) => void handleToggleActive(r)}
                onEdit={openEdit}
                onDelete={openDelete}
              />
            </>
          )}
        </>
      )}

      {modal.kind === 'create' && (
        <ReminderFormModal
          key="create"
          open
          mode="create"
          patientId={selectedPatientId}
          onClose={closeModal}
          onSuccess={handleCreateSuccess}
        />
      )}
      {modal.kind === 'edit' && (
        <ReminderFormModal
          key={`edit-${modal.reminder.id}`}
          open
          mode="edit"
          patientId={selectedPatientId}
          reminder={modal.reminder}
          onClose={closeModal}
          onSuccess={handleEditSuccess}
        />
      )}
      {modal.kind === 'delete' && (
        <DeleteReminderModal
          key={`delete-${modal.reminder.id}`}
          open
          reminder={modal.reminder}
          onClose={closeModal}
          onConfirm={() => handleDeleteConfirm(modal.reminder)}
        />
      )}
    </motion.div>
  )
}

function PageHeader({
  hasSelectedPatient,
  onCreate,
}: {
  hasSelectedPatient: boolean
  onCreate: () => void
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Badge tone="muted">Reminder support</Badge>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-on-surface">Reminders</h1>
        <p className="mt-1 text-sm text-on-surface-variant max-w-2xl">
          Create and manage reminder schedules for the selected patient. Schedules surface
          gently in the patient app — acknowledgment reporting arrives in Task 4.
        </p>
      </div>
      <Button
        leftIcon={<Plus className="h-4 w-4" />}
        onClick={onCreate}
        disabled={!hasSelectedPatient}
        title={hasSelectedPatient ? undefined : 'Select a patient first'}
      >
        Add reminder
      </Button>
    </div>
  )
}

function SelectedPatientPill({ patient }: { patient: NonNullable<ReturnType<typeof usePatients>['selectedPatient']> }) {
  return (
    <Card padded={false} className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent-dark text-sm font-semibold">
        {initialsFromName(patient.name)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-on-surface">{patient.name}</p>
        <p className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">
          <Smartphone className="h-3 w-3" />
          {patient.deviceId ? (
            <span className="truncate font-mono">{patient.deviceId}</span>
          ) : (
            <span>No device paired</span>
          )}
        </p>
      </div>
      <Badge tone="accent" dot className="ml-auto">
        Selected
      </Badge>
    </Card>
  )
}

function sortReminders(list: Reminder[]): Reminder[] {
  // Match backend order: timeOfDay asc, then createdAt asc.
  return [...list].sort((a, b) => {
    if (a.timeOfDay !== b.timeOfDay) return a.timeOfDay < b.timeOfDay ? -1 : 1
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
  })
}
