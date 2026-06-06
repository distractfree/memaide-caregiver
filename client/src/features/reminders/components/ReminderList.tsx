import { AnimatePresence } from 'framer-motion'
import { SearchX } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ReminderCard } from '@/features/reminders/components/ReminderCard'
import type { Reminder } from '@/types/domain'

interface ReminderListProps {
  reminders: Reminder[]
  filterActive: boolean
  togglingId: string | null
  onToggle: (reminder: Reminder) => void
  onEdit: (reminder: Reminder) => void
  onDelete: (reminder: Reminder) => void
}

export function ReminderList({
  reminders,
  filterActive,
  togglingId,
  onToggle,
  onEdit,
  onDelete,
}: ReminderListProps) {
  if (reminders.length === 0 && filterActive) {
    return (
      <Card>
        <EmptyState
          icon={SearchX}
          title="No matches"
          message="Try a different search term or clear the filters to see all reminders."
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence mode="popLayout">
        {reminders.map((reminder, idx) => (
          <ReminderCard
            key={reminder.id}
            reminder={reminder}
            toggling={togglingId === reminder.id}
            onToggle={() => onToggle(reminder)}
            onEdit={() => onEdit(reminder)}
            onDelete={() => onDelete(reminder)}
            motionIndex={idx}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}
