import { Info } from 'lucide-react'
import { Card } from '@/components/ui/Card'

export function StreamInfoCard() {
  return (
    <Card padded={false} className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
          <Info className="h-3.5 w-3.5" />
        </span>
        <div className="text-sm text-on-surface-variant leading-relaxed">
          <p>
            <span className="font-semibold text-on-surface">Caregiver coordination only. </span>
            Stream status is for caregiver coordination. It does not replace WhatsApp camera
            feed or emergency services.
          </p>
          <p className="mt-1">
            Patient perspective stream availability depends on the patient&rsquo;s device, app,
            and network. A viewer link is only a reference &mdash; it does not guarantee a live
            video call.
          </p>
        </div>
      </div>
    </Card>
  )
}
