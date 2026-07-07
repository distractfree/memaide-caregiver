import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Bell, HelpCircle, Menu } from 'lucide-react'
import { PatientSelector } from '@/components/layout/PatientSelector'

interface TopbarProps {
  onOpenMenu: () => void
}

const PAGE_HELP: Record<string, { title: string; description: string }> = {
  '/patients': {
    title: 'Patients',
    description: 'Manage patient profiles connected to caregiver coordination, reminder support, and device setup.',
  },
  '/reminders': {
    title: 'Reminders',
    description: 'Create and manage reminder schedules for the selected patient. Schedules surface gently in the patient app, with acknowledgment trends available in reports.',
  },
  '/reports/reminders': {
    title: 'Reminder Reports',
    description: 'Caregiver-facing acknowledgment trends for the selected patient. Shows best-effort delivery and acknowledgment from the patient app and watch for caregiver coordination, not diagnosis.',
  },
  '/help': {
    title: 'Help',
    description: 'Configure the WhatsApp caregiver contact and review help button events from the patient device. The help button supports caregiver coordination only: it opens WhatsApp to the configured contact and is not an emergency service or medical monitoring tool. Patient perspective stream status is handled separately in Stream Status.',
  },
  '/beacons': {
    title: 'Beacons',
    description: 'Configure room beacons used by the patient app for approximate proximity context. This is best-effort caregiver coordination, not exact indoor tracking or a medical device.',
  },
  '/reports/beacons': {
    title: 'Beacon Reports',
    description: 'Review approximate beacon proximity events for the selected patient. Best-effort caregiver coordination data, not exact indoor tracking or a medical device.',
  },
  '/reports/vitals': {
    title: 'Wellness Trends',
    description: 'Review best-effort wearable wellness and activity trends for the selected patient. Wellness data is best-effort and intended for caregiver coordination, not diagnosis or a medical device.',
  },
  '/stream': {
    title: 'Stream Status',
    description: 'Review patient perspective stream session status for the selected patient. Stream status is for caregiver coordination — it does not replace WhatsApp camera feed or emergency services.',
  },
  '/settings': {
    title: 'Settings',
    description: 'Review caregiver portal account, patient context, and available sections.',
  },
}

function getHelpForPath(pathname: string) {
  // Check for exact match first
  if (PAGE_HELP[pathname]) {
    return PAGE_HELP[pathname]
  }
  // Check for partial matches (e.g., /reports/reminders)
  for (const [route, help] of Object.entries(PAGE_HELP)) {
    if (pathname.startsWith(route)) {
      return help
    }
  }
  return null
}

const HELP_TOOLTIP_ID = 'topbar-help-tooltip'

export function Topbar({ onOpenMenu }: TopbarProps) {
  const location = useLocation()
  const [isTooltipOpen, setIsTooltipOpen] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const currentHelp = getHelpForPath(location.pathname)

  // Close tooltip when route changes
  useEffect(() => {
    setIsTooltipOpen(false)
  }, [location.pathname])

  // Close tooltip when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsTooltipOpen(false)
      }
    }

    if (isTooltipOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isTooltipOpen])

  // Close tooltip on Escape for keyboard users
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsTooltipOpen(false)
      }
    }

    if (isTooltipOpen) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isTooltipOpen])

  function handleTooltipOpen() {
    setIsTooltipOpen(true)
  }

  function handleTooltipClose() {
    setIsTooltipOpen(false)
  }

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
          <div className="relative">
            <button
              ref={buttonRef}
              type="button"
              aria-label="Help"
              aria-expanded={isTooltipOpen}
              aria-describedby={isTooltipOpen && currentHelp ? HELP_TOOLTIP_ID : undefined}
              onMouseEnter={handleTooltipOpen}
              onMouseLeave={handleTooltipClose}
              onFocus={handleTooltipOpen}
              onBlur={handleTooltipClose}
              onClick={handleTooltipOpen}
              className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
            {isTooltipOpen && currentHelp && (
              <div
                ref={tooltipRef}
                id={HELP_TOOLTIP_ID}
                role="tooltip"
                className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-4 shadow-card z-50"
                onMouseEnter={handleTooltipOpen}
                onMouseLeave={handleTooltipClose}
              >
                <div>
                  <h3 className="text-sm font-semibold text-on-surface">{currentHelp.title}</h3>
                  <p className="mt-1 text-xs text-on-surface-variant leading-relaxed">
                    {currentHelp.description}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
