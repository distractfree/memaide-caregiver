import { useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ApiClientError } from '@/services/apiClient'
import type { Patient } from '@/types/domain'

interface DeletePatientModalProps {
  open: boolean
  patient: Patient
  onClose: () => void
  onConfirm: () => Promise<void>
}

export function DeletePatientModal({ open, patient, onClose, onConfirm }: DeletePatientModalProps) {
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function handleConfirm() {
    setSubmitError(null)
    setSubmitting(true)
    try {
      await onConfirm()
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSubmitError(err.message)
      } else {
        setSubmitError('Unable to delete patient.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Delete patient profile" size="sm">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-error/10 text-error">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <p className="text-sm text-on-surface-variant">
            This will remove <span className="font-semibold text-on-surface">{patient.name}</span>'s
            profile from the caregiver portal. Reminders and history tied to this profile may also
            be removed.
          </p>
        </div>

        {submitError && (
          <div
            role="alert"
            className="rounded-xl border border-error/30 bg-error-container/60 px-3 py-2.5 text-sm text-error font-medium"
          >
            {submitError}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            loading={submitting}
            leftIcon={<Trash2 className="h-4 w-4" />}
            onClick={handleConfirm}
          >
            Delete patient
          </Button>
        </div>
      </div>
    </Modal>
  )
}
