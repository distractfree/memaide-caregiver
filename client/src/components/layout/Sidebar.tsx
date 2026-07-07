import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  BarChart3,
  Bell,
  Check,
  ChevronDown,
  HeartPulse,
  // LayoutDashboard, // Temporarily unused per UI cleanup request
  LifeBuoy,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Radar,
  Radio,
  Settings,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '@/features/auth/AuthContext'
import { usePatients } from '@/features/patients/PatientContext'
import { initialsFromName } from '@/utils/formatting'
import { cn } from '@/utils/cn'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const NAV: NavItem[] = [
  // { to: '/', label: 'Overview', icon: LayoutDashboard, end: true }, // Temporarily hidden per UI cleanup request
  { to: '/patients', label: 'Patients', icon: Users },
  { to: '/reminders', label: 'Reminders', icon: Bell },
  { to: '/reports/reminders', label: 'Reminder Reports', icon: BarChart3 },
  { to: '/help', label: 'Help', icon: LifeBuoy },
  { to: '/beacons', label: 'Beacons', icon: Radio },
  { to: '/reports/beacons', label: 'Beacon Reports', icon: Radar },
  { to: '/reports/vitals', label: 'Wellness Trends', icon: HeartPulse },
  { to: '/stream', label: 'Stream Status', icon: Video },
  { to: '/settings', label: 'Settings', icon: Settings },
]

interface SidebarProps {
  onNavigate?: () => void
  collapsed?: boolean
  onToggle?: () => void
}

export function Sidebar({ onNavigate, collapsed, onToggle }: SidebarProps) {
  const { caregiver, logout } = useAuth()
  const { patients, selectedPatient, setSelectedPatient, status } = usePatients()
  const [patientDropdownOpen, setPatientDropdownOpen] = useState(false)
  const patientDropdownRef = useRef<HTMLLIElement | null>(null)

  // Close patient dropdown on outside click or Escape
  useEffect(() => {
    if (!patientDropdownOpen) return
    function handleClick(e: MouseEvent) {
      if (
        patientDropdownRef.current &&
        !patientDropdownRef.current.contains(e.target as Node)
      ) {
        setPatientDropdownOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPatientDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [patientDropdownOpen])

  const tooltipLabel = collapsed ? 'Open sidebar' : 'Close sidebar'
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose

  return (
    <aside
      className={cn(
        'flex h-full flex-col bg-surface-container-lowest border-r border-outline-variant/30 transition-all duration-300 ease-bezier',
        collapsed ? 'w-16' : 'w-sidebar-width',
      )}
    >
      {/* Brand / Toggle header */}
      <div
        className={cn(
          'flex shrink-0 items-center h-topbar-height border-b border-outline-variant/30',
          collapsed ? 'justify-center px-2' : 'gap-3 px-5',
        )}
      >
        {/* Full branding — only when expanded */}
        {!collapsed && (
          <>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent shadow-card">
              <HeartPulse className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-sm font-semibold text-on-surface">MemAide</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-text-muted">
                Caregiver Portal
              </p>
            </div>
          </>
        )}

        {/* Toggle button — desktop only (rendered when onToggle is provided) */}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={tooltipLabel}
            className="group/toggle relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <ToggleIcon className="h-4 w-4" />
            {/* CSS-only tooltip — z-50 ensures it renders above page content */}
            <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 whitespace-nowrap rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-on-primary opacity-0 transition-opacity group-hover/toggle:opacity-100 group-focus-visible/toggle:opacity-100 shadow-card">
              {tooltipLabel}
            </span>
          </button>
        )}
      </div>

      {/* Nav — visible only when expanded */}
      {!collapsed && (
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="flex flex-col gap-1">
            {NAV.map((item) => {
              const Icon = item.icon
              const isPatientsItem = item.to === '/patients'

              if (isPatientsItem) {
                const canOpen =
                  status !== 'loading' && patients.length > 0

                return (
                  <li
                    key={item.to}
                    ref={patientDropdownRef}
                    className="relative"
                    style={{ overflow: 'visible' }}
                  >
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'group flex items-center gap-3 rounded-full px-3.5 py-2.5 text-sm font-semibold transition-all duration-300 ease-bezier',
                          isActive
                            ? 'bg-secondary text-on-secondary shadow-card'
                            : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
                        )
                      }
                    >
                      <Icon className="h-4 w-4" />
                      <span className="flex-1">{item.label}</span>
                      {/* Chevron button — opens patient selector */}
                      <button
                        type="button"
                        aria-label="Select patient"
                        aria-expanded={patientDropdownOpen}
                        disabled={!canOpen}
                        onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          if (canOpen)
                            setPatientDropdownOpen((v) => !v)
                        }}
                        className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-full transition-all duration-200',
                          'hover:bg-black/10 disabled:opacity-40 disabled:cursor-not-allowed',
                        )}
                      >
                        <ChevronDown
                          className={cn(
                            'h-3.5 w-3.5 transition-transform duration-200',
                            patientDropdownOpen && 'rotate-180',
                          )}
                        />
                      </button>
                    </NavLink>

                    {/* Patient selector dropdown */}
                    <AnimatePresence>
                      {patientDropdownOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.15 }}
                          className="absolute left-0 right-0 mt-1 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest shadow-card-hover p-2 z-50"
                        >
                          {patients.length === 0 ? (
                            <div className="px-3 py-4 text-sm text-text-muted">
                              No patients available.
                            </div>
                          ) : (
                            <ul className="max-h-60 overflow-y-auto">
                              {patients.map((p) => {
                                const active =
                                  p.id === selectedPatient?.id
                                return (
                                  <li key={p.id}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedPatient(p.id)
                                        setPatientDropdownOpen(
                                          false,
                                        )
                                        onNavigate?.()
                                      }}
                                      className={cn(
                                        'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors',
                                        active
                                          ? 'bg-surface-container-high'
                                          : 'hover:bg-surface-container-low',
                                      )}
                                    >
                                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-accent-dark text-[12px] font-semibold">
                                        {initialsFromName(
                                          p.name,
                                        )}
                                      </span>
                                      <span className="flex-1 min-w-0 leading-tight">
                                        <span className="block truncate text-sm font-semibold text-on-surface">
                                          {p.name}
                                        </span>
                                        {p.deviceId && (
                                          <span className="block truncate text-[11px] text-text-muted font-mono">
                                            {p.deviceId}
                                          </span>
                                        )}
                                      </span>
                                      {active && (
                                        <Check className="h-4 w-4 shrink-0 text-accent" />
                                      )}
                                    </button>
                                  </li>
                                )
                              })}
                            </ul>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </li>
                )
              }

              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-3 rounded-full px-3.5 py-2.5 text-sm font-semibold transition-all duration-300 ease-bezier',
                        isActive
                          ? 'bg-secondary text-on-secondary shadow-card'
                          : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
                      )
                    }
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>
      )}

      {/* Empty spacer when collapsed — pushes avatar to the bottom */}
      {collapsed && <div className="flex-1" />}

      {/* Caregiver footer */}
      <div
        className={cn(
          'border-t border-outline-variant/30',
          collapsed ? 'p-2' : 'p-3',
        )}
      >
        {collapsed ? (
          /* Collapsed: avatar circle only, centered */
          <div className="flex justify-center py-1">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-on-primary text-[12px] font-semibold">
              {caregiver ? initialsFromName(caregiver.name) : '?'}
            </span>
          </div>
        ) : (
          /* Expanded: full account card */
          <div className="flex items-center gap-3 rounded-2xl bg-surface-container-low p-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-on-primary text-[12px] font-semibold">
              {caregiver ? initialsFromName(caregiver.name) : '?'}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold text-on-surface">
                {caregiver?.name ?? 'Caregiver'}
              </p>
              <p className="truncate text-[11px] text-text-muted">
                {caregiver?.email ?? ''}
              </p>
            </div>
            <button
              type="button"
              onClick={logout}
              aria-label="Sign out"
              className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-error transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
