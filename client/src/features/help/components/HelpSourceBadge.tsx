import { HelpCircle, Server, Smartphone, Watch, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import type { HelpEventSourceDevice } from '@/types/domain'

interface HelpSourceBadgeProps {
  source: HelpEventSourceDevice | string
}

const known: Record<HelpEventSourceDevice, { label: string; icon: LucideIcon }> = {
  phone: { label: 'Phone', icon: Smartphone },
  watch: { label: 'Watch', icon: Watch },
  system: { label: 'System', icon: Server },
}

export function HelpSourceBadge({ source }: HelpSourceBadgeProps) {
  const entry = (known as Record<string, { label: string; icon: LucideIcon }>)[source]
  const Icon = entry?.icon ?? HelpCircle
  const label = entry?.label ?? source
  return (
    <Badge tone="neutral" leftIcon={<Icon className="h-3 w-3" />}>
      {label}
    </Badge>
  )
}
