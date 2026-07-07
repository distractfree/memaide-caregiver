import { useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
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

const PREDEFINED_TYPES = [
  'Medication',
  'Water',
  'Meal',
  'Activity',
  'Exercise',
  'Appointment',
  'Bathroom',
  'Sleep',
  'Game',
  'Check-in',
]

const dropdownOptions = [
  { value: '', label: 'Select a type...' },
  ...PREDEFINED_TYPES.map((t) => ({ value: t, label: t })),
  { value: 'Other', label: 'Other' },
]

const PREDEFINED_FREQUENCIES = [
  'Daily',
  'Twice daily',
  'Three times daily',
  'Weekdays',
  'Weekends',
  'Weekly',
  'Monthly',
  'As needed',
]

const frequencyDropdownOptions = [
  { value: '', label: 'Select a frequency...' },
  ...PREDEFINED_FREQUENCIES.map((f) => ({ value: f, label: f })),
  { value: 'Other', label: 'Other' },
]

function validate(
  selectedType: string,
  customType: string,
  description: string,
  timeOfDay: string,
  selectedFrequency: string,
  customFrequency: string,
): FieldErrors {
  const errs: FieldErrors = {}
  
  if (selectedType === '') {
    errs.type = 'Type is required.'
  } else if (selectedType === 'Other') {
    const t = customType.trim()
    if (t.length === 0) {
      errs.type = 'Custom type is required.'
    } else if (t.length > 50) {
      errs.type = 'Type must be 50 characters or fewer.'
    }
  } else {
    const t = selectedType.trim()
    if (t.length === 0) {
      errs.type = 'Type is required.'
    } else if (t.length > 50) {
      errs.type = 'Type must be 50 characters or fewer.'
    }
  }

  const d = description.trim()
  if (d.length === 0) errs.description = 'Description is required.'
  else if (d.length > 500) errs.description = 'Description must be 500 characters or fewer.'

  const time = timeOfDay.trim()
  if (time.length === 0) errs.timeOfDay = 'Time of day is required.'
  else if (!TIME_REGEX.test(time)) errs.timeOfDay = 'Use 24-hour HH:mm format (e.g. 08:00).'

  if (selectedFrequency === '') {
    errs.frequency = 'Frequency is required.'
  } else if (selectedFrequency === 'Other') {
    const f = customFrequency.trim()
    if (f.length === 0) {
      errs.frequency = 'Custom frequency is required.'
    } else if (f.length > 50) {
      errs.frequency = 'Frequency must be 50 characters or fewer.'
    }
  } else {
    const f = selectedFrequency.trim()
    if (f.length === 0) {
      errs.frequency = 'Frequency is required.'
    } else if (f.length > 50) {
      errs.frequency = 'Frequency must be 50 characters or fewer.'
    }
  }

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

  const [selectedType, setSelectedType] = useState<string>(() => {
    if (mode === 'edit' && initial?.type) {
      const matched = PREDEFINED_TYPES.find(
        (t) => t.toLowerCase() === initial.type.trim().toLowerCase()
      )
      return matched ? matched : 'Other'
    }
    return ''
  })

  const [customType, setCustomType] = useState<string>(() => {
    if (mode === 'edit' && initial?.type) {
      const matched = PREDEFINED_TYPES.find(
        (t) => t.toLowerCase() === initial.type.trim().toLowerCase()
      )
      return matched ? '' : initial.type
    }
    return ''
  })

  const [description, setDescription] = useState(initial?.description ?? '')
  const [timeOfDay, setTimeOfDay] = useState(initial?.timeOfDay ?? '')
  
  const [selectedFrequency, setSelectedFrequency] = useState<string>(() => {
    if (mode === 'edit' && initial?.frequency) {
      const matched = PREDEFINED_FREQUENCIES.find(
        (f) => f.toLowerCase() === initial.frequency.trim().toLowerCase()
      )
      return matched ? matched : 'Other'
    }
    return ''
  })

  const [customFrequency, setCustomFrequency] = useState<string>(() => {
    if (mode === 'edit' && initial?.frequency) {
      const matched = PREDEFINED_FREQUENCIES.find(
        (f) => f.toLowerCase() === initial.frequency.trim().toLowerCase()
      )
      return matched ? '' : initial.frequency
    }
    return ''
  })

  const [active, setActive] = useState(initial ? initial.active : true)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const typeSelectRef = useRef<HTMLSelectElement>(null)
  const customTypeInputRef = useRef<HTMLInputElement>(null)
  const frequencySelectRef = useRef<HTMLSelectElement>(null)
  const customFrequencyInputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitError(null)

    const errs = validate(
      selectedType,
      customType,
      description,
      timeOfDay,
      selectedFrequency,
      customFrequency,
    )
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      return
    }
    setFieldErrors({})

    const finalType = selectedType === 'Other' ? customType : selectedType
    const finalFrequency = selectedFrequency === 'Other' ? customFrequency : selectedFrequency

    const payload: CreateReminderInput = {
      type: finalType.trim(),
      description: description.trim(),
      timeOfDay: timeOfDay.trim(),
      frequency: finalFrequency.trim(),
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
      initialFocusRef={typeSelectRef}
      size="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Select
          ref={typeSelectRef}
          label={
            (
              <span>
                Type <span className="text-error font-medium">*</span>
              </span>
            ) as any
          }
          required
          value={selectedType}
          onChange={(e) => {
            const val = e.target.value
            setSelectedType(val)
            if (val !== 'Other') {
              setCustomType('')
            }
            setFieldErrors((prev) => {
              const next = { ...prev }
              delete next.type
              return next
            })
          }}
          error={selectedType !== 'Other' ? fieldErrors.type : undefined}
          options={dropdownOptions}
        />

        {selectedType === 'Other' && (
          <Input
            ref={customTypeInputRef}
            label={
              (
                <span>
                  Custom Type <span className="text-error font-medium">*</span>
                </span>
              ) as any
            }
            required
            value={customType}
            onChange={(e) => setCustomType(e.target.value)}
            error={fieldErrors.type}
            hint="Enter a custom reminder type."
            maxLength={50}
            autoComplete="off"
            placeholder="e.g. Physical Therapy"
          />
        )}

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="reminder-description"
            className="text-[13px] font-semibold text-on-surface-variant"
          >
            Description <span className="text-error font-medium">*</span>
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
            label={
              (
                <span>
                  Time of day <span className="text-error font-medium">*</span>
                </span>
              ) as any
            }
            type="time"
            required
            value={timeOfDay}
            onChange={(e) => setTimeOfDay(e.target.value)}
            error={fieldErrors.timeOfDay}
            hint="24-hour time used by the patient app."
          />
          <Select
            ref={frequencySelectRef}
            label={
              (
                <span>
                  Frequency <span className="text-error font-medium">*</span>
                </span>
              ) as any
            }
            required
            value={selectedFrequency}
            onChange={(e) => {
              const val = e.target.value
              setSelectedFrequency(val)
              if (val !== 'Other') {
                setCustomFrequency('')
              }
              setFieldErrors((prev) => {
                const next = { ...prev }
                delete next.frequency
                return next
              })
            }}
            error={selectedFrequency !== 'Other' ? fieldErrors.frequency : undefined}
            options={frequencyDropdownOptions}
          />
        </div>

        {selectedFrequency === 'Other' && (
          <Input
            ref={customFrequencyInputRef}
            label={
              (
                <span>
                  Custom Frequency <span className="text-error font-medium">*</span>
                </span>
              ) as any
            }
            required
            value={customFrequency}
            onChange={(e) => setCustomFrequency(e.target.value)}
            error={fieldErrors.frequency}
            hint="Enter a custom reminder frequency."
            maxLength={50}
            autoComplete="off"
            placeholder="e.g. every 4 hours"
          />
        )}

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
