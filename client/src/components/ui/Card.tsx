import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/utils/cn'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean
  padded?: boolean
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, interactive = false, padded = true, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-2xl bg-surface-container-lowest shadow-card border border-outline-variant/20 transition-all duration-300 ease-bezier',
        padded && 'p-6',
        interactive && 'hover:shadow-card-hover hover:-translate-y-0.5 cursor-pointer',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
})
