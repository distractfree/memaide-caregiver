import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/utils/cn'

type Size = 'sm' | 'md' | 'lg'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  size?: Size
  closeOnBackdrop?: boolean
  initialFocusRef?: { readonly current: HTMLElement | null }
  hideCloseButton?: boolean
  children: ReactNode
}

const sizes: Record<Size, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  closeOnBackdrop = true,
  initialFocusRef,
  hideCloseButton = false,
  children,
}: ModalProps) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)

  // Esc to close
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  // Body scroll lock + focus management
  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    previousActiveElementRef.current = document.activeElement as HTMLElement | null

    const focusTarget =
      initialFocusRef?.current ??
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
      null

    if (focusTarget) {
      // Defer so that motion's initial frame doesn't steal focus
      const t = window.setTimeout(() => focusTarget.focus(), 30)
      return () => {
        window.clearTimeout(t)
        document.body.style.overflow = previousOverflow
        const prev = previousActiveElementRef.current
        if (prev && typeof prev.focus === 'function') prev.focus()
      }
    }

    return () => {
      document.body.style.overflow = previousOverflow
      const prev = previousActiveElementRef.current
      if (prev && typeof prev.focus === 'function') prev.focus()
    }
  }, [open, initialFocusRef])

  const handleBackdropClick = useCallback(() => {
    if (closeOnBackdrop) onClose()
  }, [closeOnBackdrop, onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-[60] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={handleBackdropClick}
            aria-hidden="true"
          />
          <div
            className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
          >
            <motion.div
              key="panel"
              ref={panelRef}
              className={cn(
                'w-full rounded-2xl bg-surface-container-lowest shadow-card-hover border border-outline-variant/30 p-6 pointer-events-auto',
                sizes[size],
              )}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 4 }}
              transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex-1 min-w-0">
                  <h2 id={titleId} className="text-lg font-semibold text-on-surface">
                    {title}
                  </h2>
                  {description && (
                    <p id={descriptionId} className="mt-1 text-sm text-on-surface-variant">
                      {description}
                    </p>
                  )}
                </div>
                {!hideCloseButton && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {children}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
