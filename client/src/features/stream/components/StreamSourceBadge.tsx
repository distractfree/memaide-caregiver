import { CircleHelp, Glasses, Smartphone, TestTube2, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'

interface Props {
  source: string
  className?: string
}

interface SourceSpec {
  Icon: LucideIcon
  label: string
}

function specFor(source: string): SourceSpec {
  switch (source) {
    case 'glasses':
      return { Icon: Glasses, label: 'Smart glasses' }
    case 'phone':
      return { Icon: Smartphone, label: 'Phone' }
    case 'mock':
      return { Icon: TestTube2, label: 'Mock' }
    case 'unknown':
      return { Icon: CircleHelp, label: 'Unknown' }
    default:
      return { Icon: CircleHelp, label: source || 'Unknown' }
  }
}

export function StreamSourceBadge({ source, className }: Props) {
  const { Icon, label } = specFor(source)
  return (
    <Badge tone="muted" leftIcon={<Icon className="h-3 w-3" />} className={className}>
      {label}
    </Badge>
  )
}
