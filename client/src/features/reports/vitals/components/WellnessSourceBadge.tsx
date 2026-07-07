import { Monitor, Smartphone, Watch, type LucideIcon } from 'lucide-react'

function getNormalizedDevice(device: string): { label: string; icon: LucideIcon } {
  const lower = device.toLowerCase()
  if (lower === 'watch') {
    return { label: 'Watch', icon: Watch }
  }
  if (lower === 'patient_app' || lower === 'patient app' || lower === 'app' || lower === 'phone') {
    return { label: 'App', icon: Smartphone }
  }
  if (lower === 'system') {
    return { label: 'System', icon: Monitor }
  }
  return { label: device, icon: Monitor }
}

interface WellnessSourceBadgeProps {
  device: string
}

export function WellnessSourceBadge({ device }: WellnessSourceBadgeProps) {
  const { label, icon: Icon } = getNormalizedDevice(device)

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-on-surface-variant">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  )
}
