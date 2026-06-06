import { HeartPulse } from 'lucide-react'

interface WellnessInfoCardProps {
  positioning?: string
  availability?: string
}

const DEFAULT_POSITIONING =
  'Wellness data is best-effort and intended for caregiver coordination, not diagnosis or a medical device.'

const DEFAULT_AVAILABILITY =
  'Wearable samples may vary by device, permissions, and sync timing.'

export function WellnessInfoCard({
  positioning,
  availability,
}: WellnessInfoCardProps) {
  return (
    <div
      className="flex items-start gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container-low px-4 py-3"
      role="note"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent-dark">
        <HeartPulse className="h-4 w-4" />
      </span>
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-on-surface">
          Best-effort wellness context — not a medical device.
        </p>
        <p className="mt-0.5 text-on-surface-variant">
          {positioning ?? DEFAULT_POSITIONING}
        </p>
        <p className="mt-0.5 text-[12px] text-text-muted">
          {availability ?? DEFAULT_AVAILABILITY}
        </p>
      </div>
    </div>
  )
}
