import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar (fixed) — Sidebar handles its own width transition */}
      <div className="hidden lg:block fixed inset-y-0 left-0 z-30">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((prev) => !prev)}
        />
      </div>

      {/* Mobile sidebar drawer — completely unchanged */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileOpen(false)}
              className="lg:hidden fixed inset-0 z-40 bg-black/40"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="lg:hidden fixed inset-y-0 left-0 z-50"
            >
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div
        className={`transition-all duration-300 ease-bezier ${
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-sidebar-width'
        }`}
      >
        <Topbar onOpenMenu={() => setMobileOpen(true)} />
        <main className="px-4 sm:px-6 lg:px-margin-desktop py-6 lg:py-8">
          <div className="mx-auto max-w-app-shell">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
