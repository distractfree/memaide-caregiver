import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Radar, Smartphone, UserPlus, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { usePatients } from '@/features/patients/PatientContext'
import { BeaconFilters, type BeaconActiveFilter } from '@/features/beacons/components/BeaconFilters'
import { BeaconFormModal } from '@/features/beacons/components/BeaconFormModal'
import { BeaconInfoCard } from '@/features/beacons/components/BeaconInfoCard'
import { BeaconList } from '@/features/beacons/components/BeaconList'
import { BeaconStatCards } from '@/features/beacons/components/BeaconStatCards'
import { DeleteBeaconModal } from '@/features/beacons/components/DeleteBeaconModal'
import { api, ApiClientError } from '@/services/apiClient'
import { initialsFromName } from '@/utils/formatting'
import type { Beacon } from '@/types/domain'

type ModalState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; beacon: Beacon }
  | { kind: 'delete'; beacon: Beacon }

type PageStatus = 'idle' | 'loading' | 'ready' | 'error'

export function BeaconsPage() {
  const { selectedPatient, selectedPatientId } = usePatients()

  const [beacons, setBeacons] = useState<Beacon[]>([])
  const [status, setStatus] = useState<PageStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState<BeaconActiveFilter>('all')
  const [modal, setModal] = useState<ModalState>({ kind: 'none' })
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const prevPatientIdRef = useRef<string | null>(null)
  const loadRequestIdRef = useRef(0)

  const loadBeacons = useCallback(async (patientId: string) => {
    const requestId = ++loadRequestIdRef.current
    setStatus('loading')
    setError(null)
    try {
      const data = await api.listBeacons(patientId)
      if (requestId !== loadRequestIdRef.current) return
      setBeacons(sortBeacons(data))
      setStatus('ready')
    } catch (err) {
      if (requestId !== loadRequestIdRef.current) return
      if (err instanceof ApiClientError) {
        setError(err.message)
      } else {
        setError('Unable to load beacons.')
      }
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    const prev = prevPatientIdRef.current
    prevPatientIdRef.current = selectedPatientId

    if (!selectedPatientId) {
      loadRequestIdRef.current++
      setBeacons([])
      setStatus('idle')
      setError(null)
      setActionError(null)
      setSearchTerm('')
      setFilter('all')
      if (prev) setModal({ kind: 'none' })
      return
    }

    if (prev && prev !== selectedPatientId) {
      setModal({ kind: 'none' })
      setActionError(null)
      setSearchTerm('')
      setFilter('all')
    }

    void loadBeacons(selectedPatientId)
  }, [selectedPatientId, loadBeacons])

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return beacons.filter((b) => {
      if (filter === 'active' && !b.active) return false
      if (filter === 'inactive' && b.active) return false
      if (!q) return true
      const majorStr = b.major !== null ? String(b.major) : ''
      const minorStr = b.minor !== null ? String(b.minor) : ''
      return (
        b.roomName.toLowerCase().includes(q) ||
        b.beaconUuid.toLowerCase().includes(q) ||
        majorStr.includes(q) ||
        minorStr.includes(q)
      )
    })
  }, [beacons, searchTerm, filter])

  const activeCount = useMemo(() => beacons.filter((b) => b.active).length, [beacons])
  const inactiveCount = beacons.length - activeCount
  const roomsCount = useMemo(
    () =>
      new Set(
        beacons.map((b) => b.roomName.trim().toLowerCase()).filter((r) => r.length > 0),
      ).size,
    [beacons],
  )

  const filterActive = searchTerm.trim().length > 0 || filter !== 'all'

  function openCreate() {
    setActionError(null)
    setModal({ kind: 'create' })
  }
  function openEdit(beacon: Beacon) {
    setActionError(null)
    setModal({ kind: 'edit', beacon })
  }
  function openDelete(beacon: Beacon) {
    setActionError(null)
    setModal({ kind: 'delete', beacon })
  }
  function closeModal() {
    setModal({ kind: 'none' })
  }

  async function handleCreateSuccess(created: Beacon) {
    setBeacons((prev) => sortBeacons([...prev, created]))
    closeModal()
  }

  async function handleEditSuccess(updated: Beacon) {
    setBeacons((prev) =>
      sortBeacons(prev.map((b) => (b.id === updated.id ? updated : b))),
    )
    closeModal()
  }

  async function handleDeleteConfirm(beacon: Beacon) {
    await api.deleteBeacon(beacon.id)
    setBeacons((prev) => prev.filter((b) => b.id !== beacon.id))
    closeModal()
  }

  async function handleToggleActive(beacon: Beacon) {
    setActionError(null)
    setTogglingId(beacon.id)
    try {
      const updated = await api.updateBeacon(beacon.id, { active: !beacon.active })
      setBeacons((prev) =>
        sortBeacons(prev.map((b) => (b.id === updated.id ? updated : b))),
      )
    } catch (err) {
      if (err instanceof ApiClientError) {
        setActionError(err.message)
      } else {
        setActionError('Failed to update beacon.')
      }
    } finally {
      setTogglingId(null)
    }
  }

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
          title="Select a patient to configure approximate BLE proximity"
          message="Beacons are configured per patient. Choose a patient from the top bar, or open the Patients page to add one."
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

      <BeaconInfoCard />

      {status === 'loading' && beacons.length === 0 ? (
        <LoadingState label="Loading beacons…" />
      ) : status === 'error' ? (
        <ErrorState
          title="Unable to load beacons"
          message={error ?? 'Something went wrong. Please try again.'}
          onRetry={() => void loadBeacons(selectedPatientId)}
        />
      ) : (
        <>
          <BeaconStatCards
            total={beacons.length}
            activeCount={activeCount}
            inactiveCount={inactiveCount}
            roomsCount={roomsCount}
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

          {beacons.length === 0 ? (
            <EmptyState
              icon={Radar}
              title="No beacons yet"
              message="Add a room beacon to start surfacing approximate proximity context in the patient app."
              action={
                <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                  Add beacon
                </Button>
              }
            />
          ) : (
            <>
              <BeaconFilters
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                filter={filter}
                onFilterChange={setFilter}
                total={beacons.length}
                shown={filtered.length}
              />
              <BeaconList
                beacons={filtered}
                filterActive={filterActive}
                togglingId={togglingId}
                onToggle={(b) => void handleToggleActive(b)}
                onEdit={openEdit}
                onDelete={openDelete}
              />
            </>
          )}
        </>
      )}

      {modal.kind === 'create' && (
        <BeaconFormModal
          key="create"
          open
          mode="create"
          patientId={selectedPatientId}
          onClose={closeModal}
          onSuccess={handleCreateSuccess}
        />
      )}
      {modal.kind === 'edit' && (
        <BeaconFormModal
          key={`edit-${modal.beacon.id}`}
          open
          mode="edit"
          patientId={selectedPatientId}
          beacon={modal.beacon}
          onClose={closeModal}
          onSuccess={handleEditSuccess}
        />
      )}
      {modal.kind === 'delete' && (
        <DeleteBeaconModal
          key={`delete-${modal.beacon.id}`}
          open
          beacon={modal.beacon}
          onClose={closeModal}
          onConfirm={() => handleDeleteConfirm(modal.beacon)}
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
        <Badge tone="muted">Approximate BLE proximity</Badge>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-on-surface">Beacons</h1>
        <p className="mt-1 text-sm text-on-surface-variant max-w-2xl">
          Configure room beacons used by the patient app for approximate proximity context. This
          is best-effort caregiver coordination, not exact indoor tracking or a medical device.
        </p>
      </div>
      <Button
        leftIcon={<Plus className="h-4 w-4" />}
        onClick={onCreate}
        disabled={!hasSelectedPatient}
        title={hasSelectedPatient ? undefined : 'Select a patient first'}
      >
        Add beacon
      </Button>
    </div>
  )
}

function SelectedPatientPill({
  patient,
}: {
  patient: NonNullable<ReturnType<typeof usePatients>['selectedPatient']>
}) {
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

function sortBeacons(list: Beacon[]): Beacon[] {
  // Match backend order: roomName asc, then createdAt asc.
  return [...list].sort((a, b) => {
    const an = a.roomName.toLowerCase()
    const bn = b.roomName.toLowerCase()
    if (an !== bn) return an < bn ? -1 : 1
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
  })
}
