import { Badge } from '@/components/ui/Badge'

interface Props {
  status: string
  className?: string
}

type Tone = 'neutral' | 'accent' | 'success' | 'danger' | 'muted'

interface BadgeSpec {
  tone: Tone
  label: string
  dot: boolean
}

function specFor(status: string): BadgeSpec {
  switch (status) {
    case 'active':
      return { tone: 'success', label: 'Active', dot: true }
    case 'starting':
      return { tone: 'accent', label: 'Starting', dot: true }
    case 'ended':
      return { tone: 'muted', label: 'Ended', dot: false }
    case 'unavailable':
      return { tone: 'muted', label: 'Unavailable', dot: false }
    case 'failed':
      return { tone: 'danger', label: 'Failed', dot: false }
    default:
      // Defensive fallback so an unknown backend value can't crash the UI.
      return { tone: 'neutral', label: status || 'Unknown', dot: false }
  }
}

export function StreamStatusBadge({ status, className }: Props) {
  const { tone, label, dot } = specFor(status)
  return (
    <Badge tone={tone} dot={dot} className={className}>
      {label}
    </Badge>
  )
}
