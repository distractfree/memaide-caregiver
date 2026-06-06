import { Monitor, Smartphone, Watch, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import type { VitalEventSourceDevice } from '@/types/domain'

const LABELS: Record<VitalEventSourceDevice, string> = {
  watch: 'Watch',
  phone: 'Patient app',
  system: 'System',
}

const ICONS: Record<VitalEventSourceDevice, LucideIcon> = {
  watch: Watch,
  phone: Smartphone,
  system: Monitor,
}

const TONES: Record<VitalEventSourceDevice, 'accent' | 'muted'> = {
  watch: 'accent',
  phone: 'accent',
  system: 'muted',
}

interface WellnessSourceBadgeProps {
  device: string
}

export function WellnessSourceBadge({ device }: WellnessSourceBadgeProps) {
  const known = device in LABELS ? (device as VitalEventSourceDevice) : null
  const Icon = known ? ICONS[known] : Monitor
  const label = known ? LABELS[known] : device
  const tone = known ? TONES[known] : 'muted'
  return (
    <Badge tone={tone} leftIcon={<Icon className="h-3 w-3" />}>
      {label}
    </Badge>
  )
}
