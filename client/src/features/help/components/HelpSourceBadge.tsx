import { HelpCircle, Server, Smartphone, Watch, type LucideIcon } from 'lucide-react'
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
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-text-muted whitespace-nowrap">
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </span>
  )
}
