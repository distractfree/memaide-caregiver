import { Info } from 'lucide-react'
import { Card } from '@/components/ui/Card'

export function HelpSafetyNote() {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-container-high text-on-surface-variant">
          <Info className="h-5 w-5" />
        </span>
        <h2 className="text-lg font-semibold text-on-surface">How help works</h2>
      </div>
      <div className="text-[13px] leading-relaxed text-on-surface-variant">
        <p>
          <span className="font-semibold text-on-surface">Caregiver coordination only. </span>
          The help button opens WhatsApp to the configured contact on the patient&rsquo;s
          device. It is not an emergency service and does not provide medical monitoring.
        </p>
        <p className="mt-2 text-text-muted">
          Actual call behavior depends on WhatsApp and the patient&rsquo;s device. Patient
          perspective stream status is handled separately in Stream Status.
        </p>
      </div>
    </Card>
  )
}
