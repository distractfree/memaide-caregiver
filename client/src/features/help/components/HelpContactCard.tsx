import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, MessageCircle, Pencil, Phone, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { HelpContactForm } from '@/features/help/components/HelpContactForm'
import { HelpSafetyNote } from '@/features/help/components/HelpSafetyNote'
import { formatDateTime } from '@/utils/formatting'
import type { HelpContact } from '@/types/domain'

interface HelpContactCardProps {
  patientId: string
  contact: HelpContact | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  onRetry: () => void
  onSaved: (contact: HelpContact) => void
}

export function HelpContactCard({
  patientId,
  contact,
  status,
  error,
  onRetry,
  onSaved,
}: HelpContactCardProps) {
  const [editing, setEditing] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  // If the selected patient changes, exit edit mode and clear the saved flash.
  useEffect(() => {
    setEditing(false)
    setSavedFlash(false)
  }, [patientId])

  function handleSaved(saved: HelpContact) {
    onSaved(saved)
    setEditing(false)
    setSavedFlash(true)
    window.setTimeout(() => setSavedFlash(false), 3000)
  }

  return (
    <Card className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent-dark">
            <MessageCircle className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-on-surface">Help contact</h2>
            <p className="text-xs text-text-muted">
              WhatsApp number the patient app uses for caregiver coordination.
            </p>
          </div>
        </div>
        {contact && !editing && status !== 'error' && (
          <Badge tone="success" dot>
            Configured
          </Badge>
        )}
        {!contact && status === 'ready' && (
          <Badge tone="muted" dot>
            Not configured
          </Badge>
        )}
      </header>

      {status === 'loading' ? (
        <LoadingState label="Loading help contact…" />
      ) : status === 'error' ? (
        <ErrorState
          title="Unable to load help contact"
          message={error ?? 'Something went wrong while contacting the backend.'}
          onRetry={onRetry}
        />
      ) : editing ? (
        <HelpContactForm
          patientId={patientId}
          existing={contact}
          onSaved={handleSaved}
          onCancel={() => setEditing(false)}
        />
      ) : contact ? (
        <ConfiguredView
          contact={contact}
          savedFlash={savedFlash}
          onEdit={() => setEditing(true)}
        />
      ) : (
        <EmptyView onConfigure={() => setEditing(true)} />
      )}

      <HelpSafetyNote />
    </Card>
  )
}

function ConfiguredView({
  contact,
  savedFlash,
  onEdit,
}: {
  contact: HelpContact
  savedFlash: boolean
  onEdit: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high text-accent-dark">
            <Phone className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-base font-semibold text-on-surface">
              {contact.whatsappNumber}
            </p>
            <p className="text-sm text-on-surface-variant">{contact.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AnimatePresence>
            {savedFlash && (
              <motion.span
                key="saved"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Badge tone="success" leftIcon={<Check className="h-3 w-3" />}>
                  Saved
                </Badge>
              </motion.span>
            )}
          </AnimatePresence>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Pencil className="h-3.5 w-3.5" />}
            onClick={onEdit}
          >
            Edit
          </Button>
        </div>
      </div>
      <p className="text-xs text-text-muted">
        Last updated {formatDateTime(contact.updatedAt)}
      </p>
    </div>
  )
}

function EmptyView({ onConfigure }: { onConfigure: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-outline-variant/60 bg-surface-section p-5">
      <div>
        <h3 className="text-sm font-semibold text-on-surface">
          No WhatsApp contact configured yet
        </h3>
        <p className="mt-1 text-sm text-on-surface-variant">
          Add a WhatsApp number so the patient app can open WhatsApp to a
          trusted caregiver from the help button.
        </p>
      </div>
      <Button
        variant="primary"
        size="sm"
        leftIcon={<Plus className="h-4 w-4" />}
        onClick={onConfigure}
      >
        Configure WhatsApp contact
      </Button>
    </div>
  )
}
