import { useAdminAuth } from './AdminAuthContext'
import { AdminLoginPage } from './AdminLoginPage'
import { AdminDashboardPage } from './AdminDashboardPage'
import { LoadingState } from '@/components/ui/LoadingState'

export function AdminPage() {
  const { isAuthenticated, isBootstrapping } = useAdminAuth()

  if (isBootstrapping) {
    return (
      <div className="admin-portal" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingState label="Loading admin portal..." />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <AdminLoginPage />
  }

  return <AdminDashboardPage />
}
