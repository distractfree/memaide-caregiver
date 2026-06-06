import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { api, ApiClientError } from '@/services/apiClient'
import type { HelpContact } from '@/types/domain'

// Mirrors backend regex /^\+[1-9]\d{7,14}$/ — keep in sync with
// server/src/modules/help/help.schemas.ts. Server is still authoritative.
const E164_REGEX = /^\+[1-9]\d{7,14}$/

interface HelpContactFormProps {
  patientId: string
  existing: HelpContact | null
  onSaved: (contact: HelpContact) => void
  onCancel: () => void
}

interface FieldErrors {
  whatsappNumber?: string
  label?: string
}

function validate(whatsappNumber: string, label: string): FieldErrors {
  const errs: FieldErrors = {}
  const w = whatsappNumber.trim()
  if (w.length === 0) {
    errs.whatsappNumber = 'WhatsApp number is required.'
  } else if (!E164_REGEX.test(w)) {
    errs.whatsappNumber = 'Use E.164 format, for example +18185550123.'
  }
  const l = label.trim()
  if (l.length > 120) {
    errs.label = 'Label must be 120 characters or fewer.'
  }
  return errs
}

function mapBackendDetails(details: Record<string, unknown> | undefined): FieldErrors {
  const out: FieldErrors = {}
  if (!details || typeof details !== 'object') return out
  for (const key of ['whatsappNumber', 'label'] as const) {
    const value = details[key]
    if (Array.isArray(value) && typeof value[0] === 'string') {
      out[key] = value[0]
    } else if (typeof value === 'string') {
      out[key] = value
    }
  }
  return out
}

export function HelpContactForm({ patientId, existing, onSaved, onCancel }: HelpContactFormProps) {
  const [whatsappNumber, setWhatsappNumber] = useState(existing?.whatsappNumber ?? '')
  const [label, setLabel] = useState(existing?.label ?? '')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const numberInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    numberInputRef.current?.focus()
  }, [])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitError(null)

    const errs = validate(whatsappNumber, label)
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      return
    }
    setFieldErrors({})

    const trimmedLabel = label.trim()
    setSubmitting(true)
    try {
      const saved = await api.saveHelpContact(patientId, {
        whatsappNumber: whatsappNumber.trim(),
        label: trimmedLabel.length > 0 ? trimmedLabel : undefined,
        active: true,
      })
      onSaved(saved)
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSubmitError(err.message)
        if (err.code === 'VALIDATION_ERROR') {
          const mapped = mapBackendDetails(err.details)
          if (Object.keys(mapped).length > 0) setFieldErrors(mapped)
        }
      } else {
        setSubmitError('Unable to save help contact.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        ref={numberInputRef}
        label="WhatsApp number"
        required
        type="tel"
        value={whatsappNumber}
        onChange={(e) => setWhatsappNumber(e.target.value)}
        error={fieldErrors.whatsappNumber}
        hint="Use E.164 format, for example +18185550123."
        autoComplete="off"
        placeholder="+18185550123"
        inputMode="tel"
      />

      <Input
        label="Label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        error={fieldErrors.label}
        hint='Optional. Defaults to "Primary caregiver" if left blank.'
        maxLength={120}
        autoComplete="off"
        placeholder="Primary caregiver"
      />

      {submitError && (
        <div
          role="alert"
          className="rounded-xl border border-error/30 bg-error-container/60 px-3 py-2.5 text-sm text-error font-medium"
        >
          {submitError}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={submitting}>
          Save help contact
        </Button>
      </div>
    </form>
  )
}
