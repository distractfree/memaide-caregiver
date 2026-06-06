import { useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { api, ApiClientError } from '@/services/apiClient'
import type { CreatePatientInput, Patient } from '@/types/domain'

type FormMode = 'create' | 'edit'

interface PatientFormModalProps {
  open: boolean
  mode: FormMode
  patient?: Patient
  onClose: () => void
  onSuccess: (patient: Patient) => void | Promise<void>
}

interface FieldErrors {
  name?: string
  phoneNumber?: string
  deviceId?: string
}

function validate(name: string, phone: string, deviceId: string): FieldErrors {
  const errs: FieldErrors = {}
  const n = name.trim()
  if (n.length === 0) errs.name = 'Name is required.'
  else if (n.length > 100) errs.name = 'Name must be 100 characters or fewer.'
  if (phone.trim().length > 30) errs.phoneNumber = 'Phone number must be 30 characters or fewer.'
  if (deviceId.trim().length > 100) errs.deviceId = 'Device ID must be 100 characters or fewer.'
  return errs
}

function mapBackendDetails(details: Record<string, unknown> | undefined): FieldErrors {
  const out: FieldErrors = {}
  if (!details || typeof details !== 'object') return out
  for (const key of ['name', 'phoneNumber', 'deviceId'] as const) {
    const value = details[key]
    if (Array.isArray(value) && typeof value[0] === 'string') {
      out[key] = value[0]
    } else if (typeof value === 'string') {
      out[key] = value
    }
  }
  return out
}

export function PatientFormModal({
  open,
  mode,
  patient,
  onClose,
  onSuccess,
}: PatientFormModalProps) {
  const initialName = mode === 'edit' && patient ? patient.name : ''
  const initialPhone = mode === 'edit' && patient ? (patient.phoneNumber ?? '') : ''
  const initialDevice = mode === 'edit' && patient ? (patient.deviceId ?? '') : ''

  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState(initialPhone)
  const [deviceId, setDeviceId] = useState(initialDevice)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitError(null)

    const errs = validate(name, phone, deviceId)
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      return
    }
    setFieldErrors({})

    const payload: CreatePatientInput = { name: name.trim() }
    const trimmedPhone = phone.trim()
    if (trimmedPhone.length > 0) payload.phoneNumber = trimmedPhone
    const trimmedDevice = deviceId.trim()
    if (trimmedDevice.length > 0) payload.deviceId = trimmedDevice

    setSubmitting(true)
    try {
      const result =
        mode === 'create'
          ? await api.createPatient(payload)
          : await api.updatePatient(patient!.id, payload)
      await onSuccess(result)
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSubmitError(err.message)
        if (err.code === 'VALIDATION_ERROR') {
          const mapped = mapBackendDetails(err.details)
          if (Object.keys(mapped).length > 0) setFieldErrors(mapped)
        }
      } else {
        setSubmitError('Unable to save patient.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const title = mode === 'create' ? 'Add patient' : 'Edit patient'
  const description =
    mode === 'create'
      ? 'Create a new patient profile linked to your caregiver account.'
      : 'Update the profile details for this patient.'
  const submitLabel = mode === 'create' ? 'Add patient' : 'Save changes'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      initialFocusRef={nameInputRef}
      size="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          ref={nameInputRef}
          label="Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
          maxLength={100}
          autoComplete="off"
        />
        <Input
          label="Phone number"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={fieldErrors.phoneNumber}
          hint="Optional. Leave blank to skip; existing values are not cleared."
          maxLength={30}
          autoComplete="off"
        />
        <Input
          label="Patient device ID"
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
          error={fieldErrors.deviceId}
          hint="Optional. Must be globally unique. Leave blank to skip; existing values are not cleared."
          maxLength={100}
          autoComplete="off"
        />

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
