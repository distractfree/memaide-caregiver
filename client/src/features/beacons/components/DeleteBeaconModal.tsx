import { useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ApiClientError } from '@/services/apiClient'
import type { Beacon } from '@/types/domain'

interface DeleteBeaconModalProps {
  open: boolean
  beacon: Beacon
  onClose: () => void
  onConfirm: () => Promise<void>
}

export function DeleteBeaconModal({
  open,
  beacon,
  onClose,
  onConfirm,
}: DeleteBeaconModalProps) {
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
        setSubmitError('Unable to delete beacon.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Delete beacon" size="sm">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-error/10 text-error">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="text-sm text-on-surface-variant">
            <p>
              Delete this beacon configuration from the caregiver portal? This cannot be undone.
            </p>
            <div className="mt-3 rounded-xl bg-surface-container-low px-3 py-2.5">
              <p className="text-sm font-semibold text-on-surface break-words">
                {beacon.roomName}
              </p>
              <p
                className="mt-1 text-[12px] font-mono text-text-muted break-all"
                title={beacon.beaconUuid}
              >
                {beacon.beaconUuid}
              </p>
            </div>
          </div>
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
            Delete beacon
          </Button>
        </div>
      </div>
    </Modal>
  )
}
