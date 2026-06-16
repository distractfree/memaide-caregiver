import { useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { api, ApiClientError } from '@/services/apiClient'
import { cn } from '@/utils/cn'
import type { CreateReminderInput, Reminder, UpdateReminderInput } from '@/types/domain'

type FormMode = 'create' | 'edit'

interface ReminderFormModalProps {
  open: boolean
  mode: FormMode
  patientId: string
  reminder?: Reminder
  onClose: () => void
  onSuccess: (reminder: Reminder) => void | Promise<void>
}

interface FieldErrors {
  type?: string
  description?: string
  timeOfDay?: string
  frequency?: string
}

const TIME_REGEX = /^\d{2}:\d{2}$/

function validate(
  type: string,
  description: string,
  timeOfDay: string,
  frequency: string,
): FieldErrors {
  const errs: FieldErrors = {}
  const t = type.trim()
  if (t.length === 0) errs.type = 'Type is required.'
  else if (t.length > 50) errs.type = 'Type must be 50 characters or fewer.'

  const d = description.trim()
  if (d.length === 0) errs.description = 'Description is required.'
  else if (d.length > 500) errs.description = 'Description must be 500 characters or fewer.'

  const time = timeOfDay.trim()
  if (time.length === 0) errs.timeOfDay = 'Time of day is required.'
  else if (!TIME_REGEX.test(time)) errs.timeOfDay = 'Use 24-hour HH:mm format (e.g. 08:00).'

  const f = frequency.trim()
  if (f.length === 0) errs.frequency = 'Frequency is required.'
  else if (f.length > 50) errs.frequency = 'Frequency must be 50 characters or fewer.'

  return errs
}

function mapBackendDetails(details: Record<string, unknown> | undefined): FieldErrors {
  const out: FieldErrors = {}
  if (!details || typeof details !== 'object') return out
  for (const key of ['type', 'description', 'timeOfDay', 'frequency'] as const) {
    const value = details[key]
    if (Array.isArray(value) && typeof value[0] === 'string') {
      out[key] = value[0]
    } else if (typeof value === 'string') {
      out[key] = value
    }
  }
  return out
}

export function ReminderFormModal({
  open,
  mode,
  patientId,
  reminder,
  onClose,
  onSuccess,
}: ReminderFormModalProps) {
  const initial = mode === 'edit' && reminder ? reminder : null

  const [type, setType] = useState(initial?.type ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [timeOfDay, setTimeOfDay] = useState(initial?.timeOfDay ?? '')
  const [frequency, setFrequency] = useState(initial?.frequency ?? '')
  const [active, setActive] = useState(initial ? initial.active : true)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const typeInputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitError(null)

    const errs = validate(type, description, timeOfDay, frequency)
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      return
    }
    setFieldErrors({})

    const payload: CreateReminderInput = {
      type: type.trim(),
      description: description.trim(),
      timeOfDay: timeOfDay.trim(),
      frequency: frequency.trim(),
      active,
    }

    setSubmitting(true)
    try {
      const result =
        mode === 'create'
          ? await api.createReminder(patientId, payload)
          : await api.updateReminder(reminder!.id, payload as UpdateReminderInput)
      await onSuccess(result)
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSubmitError(err.message)
        if (err.code === 'VALIDATION_ERROR') {
          const mapped = mapBackendDetails(err.details)
          if (Object.keys(mapped).length > 0) setFieldErrors(mapped)
        }
      } else {
        setSubmitError('Unable to save reminder.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const title = mode === 'create' ? 'Add reminder' : 'Edit reminder'
  const description_ =
    mode === 'create'
      ? 'Create a reminder schedule that surfaces in the patient app.'
      : 'Update the schedule for this reminder.'
  const submitLabel = mode === 'create' ? 'Add reminder' : 'Save changes'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description_}
      initialFocusRef={typeInputRef}
      size="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          ref={typeInputRef}
          label="Type"
          required
          value={type}
          onChange={(e) => setType(e.target.value)}
          error={fieldErrors.type}
          hint="Free-form label shown in the patient app (e.g. medication, hydration, activity)."
          maxLength={50}
          autoComplete="off"
          placeholder="e.g. medication"
        />

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="reminder-description"
            className="text-[13px] font-semibold text-on-surface-variant"
          >
            Description
          </label>
          <textarea
            id="reminder-description"
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="What should the patient be reminded to do?"
            aria-invalid={fieldErrors.description ? true : undefined}
            className={cn(
              'w-full rounded-xl border bg-surface-container-lowest px-4 py-3 text-sm text-on-surface placeholder:text-text-muted transition-colors duration-200 ease-bezier',
              'focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent',
              fieldErrors.description
                ? 'border-error/60'
                : 'border-outline-variant/60',
            )}
          />
          {fieldErrors.description ? (
            <p className="text-[12px] text-error font-medium">{fieldErrors.description}</p>
          ) : (
            <p className="text-[12px] text-text-muted">
              This description appears in the patient app.
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Time of day"
            type="time"
            required
            value={timeOfDay}
            onChange={(e) => setTimeOfDay(e.target.value)}
            error={fieldErrors.timeOfDay}
            hint="24-hour time used by the patient app."
          />
          <Input
            label="Frequency"
            required
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            error={fieldErrors.frequency}
            hint="e.g. daily, weekly, weekdays."
            maxLength={50}
            autoComplete="off"
            placeholder="e.g. daily"
          />
        </div>

        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-outline-variant text-accent focus:ring-accent"
          />
          <span className="text-sm font-medium text-on-surface">Active reminder</span>
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
