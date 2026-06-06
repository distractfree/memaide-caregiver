import { NavLink } from 'react-router-dom'
import {
  BarChart3,
  Bell,
  HeartPulse,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Radar,
  Radio,
  Settings,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { initialsFromName } from '@/utils/formatting'
import { cn } from '@/utils/cn'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
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
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const { caregiver, logout } = useAuth()

  return (
    <aside className="flex h-full w-sidebar-width flex-col bg-surface-container-lowest border-r border-outline-variant/30">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 h-topbar-height border-b border-outline-variant/30">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent shadow-card">
          <HeartPulse className="h-5 w-5 text-white" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-on-surface">MemAide</p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-text-muted">Caregiver Portal</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-1">
          {NAV.map((item) => {
            const Icon = item.icon
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

      {/* Caregiver footer */}
      <div className="border-t border-outline-variant/30 p-3">
        <div className="flex items-center gap-3 rounded-2xl bg-surface-container-low p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-on-primary text-[12px] font-semibold">
            {caregiver ? initialsFromName(caregiver.name) : '?'}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-semibold text-on-surface">{caregiver?.name ?? 'Caregiver'}</p>
            <p className="truncate text-[11px] text-text-muted">{caregiver?.email ?? ''}</p>
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
      </div>
    </aside>
  )
}
