import { forwardRef, useId, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string
  options: SelectOption[]
  error?: string | null
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, error, className, id, ...rest },
  ref,
) {
  const autoId = useId()
  const selectId = id ?? autoId

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-[13px] font-semibold text-on-surface-variant">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'h-11 w-full appearance-none rounded-xl border bg-surface-container-lowest pl-4 pr-10 text-sm text-on-surface transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent',
            error ? 'border-error/60' : 'border-outline-variant/60',
            className,
          )}
          {...rest}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
      </div>
      {error && <p className="text-[12px] text-error font-medium">{error}</p>}
    </div>
  )
})
