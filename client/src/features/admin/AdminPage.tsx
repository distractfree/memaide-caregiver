import { useAdminAuth } from './AdminAuthContext'
import { AdminLoginPage } from './AdminLoginPage'
import { AdminDashboardPage } from './AdminDashboardPage'
import { LoadingState } from '@/components/ui/LoadingState'

export function AdminPage() {
  const { isAuthenticated, isBootstrapping } = useAdminAuth()

  if (isBootstrapping) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingState label="Loading admin portal..." />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <AdminLoginPage />
  }

  return <AdminDashboardPage />
}
