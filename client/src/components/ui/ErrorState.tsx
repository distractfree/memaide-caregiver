import { AlertTriangle, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { cn } from '@/utils/cn'

interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, className }: ErrorStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        'flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-error/20 bg-error-container/40 p-8 text-center',
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-error/10 text-error">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-on-surface">{title}</h3>
        <p className="mt-1 text-sm text-on-surface-variant max-w-md">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </motion.div>
  )
}
