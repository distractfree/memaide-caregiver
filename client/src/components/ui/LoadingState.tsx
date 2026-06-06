import { Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/utils/cn'

interface LoadingStateProps {
  label?: string
  fullscreen?: boolean
  className?: string
}

export function LoadingState({ label = 'Loading…', fullscreen = false, className }: LoadingStateProps) {
  const content = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className={cn('flex flex-col items-center justify-center gap-3 text-on-surface-variant', className)}
    >
      <Loader2 className="h-6 w-6 animate-spin text-accent" />
      <p className="text-sm font-medium">{label}</p>
    </motion.div>
  )

  if (fullscreen) {
    return <div className="min-h-screen w-full flex items-center justify-center bg-background">{content}</div>
  }
  return <div className="flex w-full items-center justify-center py-10">{content}</div>
}
