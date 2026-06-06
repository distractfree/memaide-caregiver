import { type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/utils/cn'

type Tone = 'neutral' | 'accent' | 'success' | 'danger' | 'muted'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
  dot?: boolean
  leftIcon?: ReactNode
}

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-container-high text-on-surface border-outline-variant/40',
  accent: 'bg-accent/10 text-accent-dark border-accent/30',
  success: 'bg-green-100 text-green-800 border-green-200',
  danger: 'bg-error-container text-error border-error/30',
  muted: 'bg-surface-container-low text-text-muted border-outline-variant/30',
}

const dotTones: Record<Tone, string> = {
  neutral: 'bg-outline',
  accent: 'bg-accent',
  success: 'bg-green-500',
  danger: 'bg-error',
  muted: 'bg-text-muted',
}

export function Badge({ tone = 'neutral', dot = false, leftIcon, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider',
        tones[tone],
        className,
      )}
      {...rest}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dotTones[tone])} />}
      {leftIcon}
      {children}
    </span>
  )
}
