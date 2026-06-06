import { useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { api, ApiClientError } from '@/services/apiClient'
import type { Beacon, CreateBeaconInput, UpdateBeaconInput } from '@/types/domain'

type FormMode = 'create' | 'edit'

interface BeaconFormModalProps {
  open: boolean
  mode: FormMode
  patientId: string
  beacon?: Beacon
  onClose: () => void
  onSuccess: (beacon: Beacon) => void | Promise<void>
}

interface FieldErrors {
  roomName?: string
  beaconUuid?: string
  major?: string
  minor?: string
  thresholdDistanceM?: string
  dwellSeconds?: string
  active?: string
}

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

function parseOptionalInt(raw: string, label: string): { value?: number; error?: string } {
  const t = raw.trim()
  if (t.length === 0) return {}
  if (!/^-?\d+$/.test(t)) return { error: `${label} must be a whole number.` }
  const n = Number(t)
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { error: `${label} must be a whole number.` }
  }
  if (n < 0) return { error: `${label} must be 0 or greater.` }
  return { value: n }
}

function parseOptionalFloat(
  raw: string,
  label: string,
  opts: { strictPositive?: boolean } = {},
): { value?: number; error?: string } {
  const t = raw.trim()
  if (t.length === 0) return {}
  const n = Number(t)
  if (!Number.isFinite(n)) return { error: `${label} must be a number.` }
  if (opts.strictPositive && n <= 0) return { error: `${label} must be greater than 0.` }
  if (!opts.strictPositive && n < 0) return { error: `${label} must be 0 or greater.` }
  return { value: n }
}

function mapBackendDetails(details: Record<string, unknown> | undefined): FieldErrors {
  const out: FieldErrors = {}
  if (!details || typeof details !== 'object') return out
  const keys: (keyof FieldErrors)[] = [
    'roomName',
    'beaconUuid',
    'major',
    'minor',
    'thresholdDistanceM',
    'dwellSeconds',
    'active',
  ]
  for (const key of keys) {
    const value = (details as Record<string, unknown>)[key]
    if (Array.isArray(value) && typeof value[0] === 'string') {
      out[key] = value[0]
    } else if (typeof value === 'string') {
      out[key] = value
    }
  }
  return out
}

export function BeaconFormModal({
  open,
  mode,
  patientId,
  beacon,
  onClose,
  onSuccess,
}: BeaconFormModalProps) {
  const initial = mode === 'edit' && beacon ? beacon : null

  const [roomName, setRoomName] = useState(initial?.roomName ?? '')
  const [beaconUuid, setBeaconUuid] = useState(initial?.beaconUuid ?? '')
  const [major, setMajor] = useState(initial?.major != null ? String(initial.major) : '')
  const [minor, setMinor] = useState(initial?.minor != null ? String(initial.minor) : '')
  const [thresholdDistanceM, setThresholdDistanceM] = useState(
    initial ? String(initial.thresholdDistanceM) : '3',
  )
  const [dwellSeconds, setDwellSeconds] = useState(
    initial ? String(initial.dwellSeconds) : '5',
  )
  const [active, setActive] = useState(initial ? initial.active : true)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const roomNameInputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitError(null)

    const errs: FieldErrors = {}

    const room = roomName.trim()
    if (room.length === 0) errs.roomName = 'Room name is required.'
    else if (room.length > 100) errs.roomName = 'Room name must be 100 characters or fewer.'

    const uuid = beaconUuid.trim()
    if (uuid.length === 0) errs.beaconUuid = 'Beacon UUID is required.'
    else if (!UUID_REGEX.test(uuid)) errs.beaconUuid = 'Beacon UUID must be a valid UUID.'

    const majorResult = parseOptionalInt(major, 'Major')
    if (majorResult.error) errs.major = majorResult.error

    const minorResult = parseOptionalInt(minor, 'Minor')
    if (minorResult.error) errs.minor = minorResult.error

    const thresholdResult = parseOptionalFloat(thresholdDistanceM, 'Threshold distance', {
      strictPositive: true,
    })
    if (thresholdResult.error) errs.thresholdDistanceM = thresholdResult.error

    const dwellResult = parseOptionalInt(dwellSeconds, 'Dwell seconds')
    if (dwellResult.error) errs.dwellSeconds = dwellResult.error

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      return
    }
    setFieldErrors({})

    const payload: CreateBeaconInput = {
      roomName: room,
      beaconUuid: uuid,
      active,
    }
    if (majorResult.value !== undefined) payload.major = majorResult.value
    if (minorResult.value !== undefined) payload.minor = minorResult.value
    if (thresholdResult.value !== undefined) payload.thresholdDistanceM = thresholdResult.value
    if (dwellResult.value !== undefined) payload.dwellSeconds = dwellResult.value

    setSubmitting(true)
    try {
      const result =
        mode === 'create'
          ? await api.createBeacon(patientId, payload)
          : await api.updateBeacon(beacon!.id, payload as UpdateBeaconInput)
      await onSuccess(result)
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSubmitError(err.message)
        if (err.code === 'VALIDATION_ERROR') {
          const mapped = mapBackendDetails(err.details)
          if (Object.keys(mapped).length > 0) setFieldErrors(mapped)
        }
      } else {
        setSubmitError('Unable to save beacon.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const title = mode === 'create' ? 'Add beacon' : 'Edit beacon'
  const description =
    mode === 'create'
      ? 'Configure a room beacon used by the patient app for approximate proximity context.'
      : 'Update this room beacon configuration.'
  const submitLabel = mode === 'create' ? 'Add beacon' : 'Save changes'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      initialFocusRef={roomNameInputRef}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          ref={roomNameInputRef}
          label="Room name"
          required
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          error={fieldErrors.roomName}
          hint="Free-form label for this room (e.g. Kitchen, Bedroom, Hallway)."
          maxLength={100}
          autoComplete="off"
          placeholder="e.g. Kitchen"
        />

        <Input
          label="Beacon UUID"
          required
          value={beaconUuid}
          onChange={(e) => setBeaconUuid(e.target.value)}
          error={fieldErrors.beaconUuid}
          hint="Standard UUID printed on or assigned to the BLE beacon device."
          autoComplete="off"
          placeholder="00000000-0000-0000-0000-000000000000"
          className="font-mono"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Major (optional)"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={major}
            onChange={(e) => setMajor(e.target.value)}
            error={fieldErrors.major}
            hint="Optional iBeacon major identifier (0–65535)."
            placeholder="e.g. 1"
          />
          <Input
            label="Minor (optional)"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={minor}
            onChange={(e) => setMinor(e.target.value)}
            error={fieldErrors.minor}
            hint="Optional iBeacon minor identifier (0–65535)."
            placeholder="e.g. 23"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Threshold distance (m)"
            type="number"
            inputMode="decimal"
            min={0.1}
            step={0.1}
            value={thresholdDistanceM}
            onChange={(e) => setThresholdDistanceM(e.target.value)}
            error={fieldErrors.thresholdDistanceM}
            hint="Approximate proximity threshold in meters. BLE distance estimates are noisy."
            placeholder="3"
          />
          <Input
            label="Dwell seconds"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={dwellSeconds}
            onChange={(e) => setDwellSeconds(e.target.value)}
            error={fieldErrors.dwellSeconds}
            hint="Minimum time inside the threshold before counting as dwell."
            placeholder="5"
          />
        </div>

        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-outline-variant text-accent focus:ring-accent"
          />
          <span className="text-sm font-medium text-on-surface">Active beacon</span>
          <span className="text-xs text-text-muted">
            (uncheck to pause without deleting)
          </span>
        </label>

        {submitError && (
          <div
            role="alert"
            className="rounded-xl border border-error/30 bg-error-container/60 px-3 py-2.5 text-sm text-error font-medium"
          >
            {submitError}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
