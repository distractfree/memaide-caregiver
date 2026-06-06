import { Info } from 'lucide-react'

export function HelpSafetyNote() {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-xl border border-outline-variant/40 bg-surface-container-low p-4"
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent-dark">
        <Info className="h-4 w-4" />
      </span>
      <div className="text-[13px] leading-relaxed text-on-surface-variant">
        <p>
          The patient app opens WhatsApp to the configured contact. Actual call
          behavior depends on WhatsApp and the patient device.
        </p>
        <p className="mt-1 text-text-muted">
          Patient perspective stream status is handled separately in the Stream
          Status section.
        </p>
      </div>
    </div>
  )
}
