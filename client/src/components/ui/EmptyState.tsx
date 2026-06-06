import { type LucideIcon, Inbox } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/utils/cn'

interface EmptyStateProps {
  title: string
  message?: string
  icon?: LucideIcon
  className?: string
  action?: React.ReactNode
}

export function EmptyState({ title, message, icon: Icon = Inbox, action, className }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        'flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-outline-variant/60 bg-surface-section p-10 text-center',
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-on-surface">{title}</h3>
        {message && <p className="mt-1 text-sm text-on-surface-variant max-w-md">{message}</p>}
      </div>
      {action}
    </motion.div>
  )
}
