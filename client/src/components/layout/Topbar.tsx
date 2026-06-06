import { Bell, HelpCircle, Menu } from 'lucide-react'
import { PatientSelector } from '@/components/layout/PatientSelector'

interface TopbarProps {
  onOpenMenu: () => void
}

export function Topbar({ onOpenMenu }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-topbar-height items-center justify-between bg-surface-container-lowest/95 backdrop-blur border-b border-outline-variant/30 px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation"
          className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="hidden sm:block">
          <p className="text-[11px] uppercase tracking-wider text-text-muted">Today</p>
          <p className="text-sm font-semibold text-on-surface">
            {new Date().toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <PatientSelector />
        <div className="hidden md:flex items-center gap-1">
          <button
            type="button"
            aria-label="Notifications"
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <Bell className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Help"
            className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  )
}
