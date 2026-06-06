import { Info } from 'lucide-react'

export function BeaconInfoCard() {
  return (
    <div
      className="flex items-start gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container-low px-4 py-3"
      role="note"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent-dark">
        <Info className="h-4 w-4" />
      </span>
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-on-surface">BLE proximity is approximate.</p>
        <p className="mt-0.5 text-on-surface-variant">
          Signal strength can vary by phone, room layout, and interference. Beacons provide
          best-effort context for the patient app, not exact indoor location or a medical device.
        </p>
      </div>
    </div>
  )
}
