import { Activity, Armchair, CircleHelp, Footprints, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import type { VitalEventMotionState } from '@/types/domain'

const LABELS: Record<VitalEventMotionState, string> = {
  idle: 'Idle',
  walking: 'Walking',
  active: 'Active',
  unknown: 'Unknown',
}

const ICONS: Record<VitalEventMotionState, LucideIcon> = {
  idle: Armchair,
  walking: Footprints,
  active: Activity,
  unknown: CircleHelp,
}

// Motion state is only context, so avoid success or danger colors.
const TONES: Record<VitalEventMotionState, 'neutral' | 'accent' | 'muted'> = {
  idle: 'muted',
  walking: 'accent',
  active: 'accent',
  unknown: 'muted',
}

interface MotionStateBadgeProps {
  state: string
}

export function MotionStateBadge({ state }: MotionStateBadgeProps) {
  const known = (state in LABELS ? state : 'unknown') as VitalEventMotionState
  const Icon = ICONS[known]
  return (
    <Badge tone={TONES[known]} leftIcon={<Icon className="h-3 w-3" />}>
      {LABELS[known]}
    </Badge>
  )
}
