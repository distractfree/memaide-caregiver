import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string | null
  hint?: string
  leftIcon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, leftIcon, className, id, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-[13px] font-semibold text-on-surface-variant">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute inset-y-0 left-3 flex items-center text-on-surface-variant pointer-events-none">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'h-11 w-full rounded-xl border bg-surface-container-lowest px-4 text-sm text-on-surface placeholder:text-text-muted transition-colors duration-200 ease-bezier',
            'focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent',
            error ? 'border-error/60' : 'border-outline-variant/60',
            leftIcon && 'pl-10',
            className,
          )}
          aria-invalid={error ? true : undefined}
          {...rest}
        />
      </div>
      {error ? (
        <p className="text-[12px] text-error font-medium">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-text-muted">{hint}</p>
      ) : null}
    </div>
  )
})
