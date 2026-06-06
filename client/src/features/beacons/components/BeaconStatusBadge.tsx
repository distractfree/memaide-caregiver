import { Badge } from '@/components/ui/Badge'

interface BeaconStatusBadgeProps {
  active: boolean
}

export function BeaconStatusBadge({ active }: BeaconStatusBadgeProps) {
  return (
    <Badge tone={active ? 'success' : 'muted'} dot>
      {active ? 'Active' : 'Inactive'}
    </Badge>
  )
}
