import { AnimatePresence } from 'framer-motion'
import { SearchX } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { BeaconCard } from '@/features/beacons/components/BeaconCard'
import type { Beacon } from '@/types/domain'

interface BeaconListProps {
  beacons: Beacon[]
  filterActive: boolean
  togglingId: string | null
  onToggle: (beacon: Beacon) => void
  onEdit: (beacon: Beacon) => void
  onDelete: (beacon: Beacon) => void
}

export function BeaconList({
  beacons,
  filterActive,
  togglingId,
  onToggle,
  onEdit,
  onDelete,
}: BeaconListProps) {
  if (beacons.length === 0 && filterActive) {
    return (
      <Card>
        <EmptyState
          icon={SearchX}
          title="No matches"
          message="Try a different search term or clear the filters to see all beacons."
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence mode="popLayout">
        {beacons.map((beacon, idx) => (
          <BeaconCard
            key={beacon.id}
            beacon={beacon}
            toggling={togglingId === beacon.id}
            onToggle={() => onToggle(beacon)}
            onEdit={() => onEdit(beacon)}
            onDelete={() => onDelete(beacon)}
            motionIndex={idx}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}
