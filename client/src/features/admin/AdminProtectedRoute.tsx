import { type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAdminAuth } from './AdminAuthContext'
import { LoadingState } from '@/components/ui/LoadingState'

export function AdminProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isBootstrapping } = useAdminAuth()
  const location = useLocation()

  if (isBootstrapping) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingState label="Loading admin portal..." />
      </div>
    )
  }

  if (!isAuthenticated) {
    // We could store the attempted url, but simple redirect to /admin is fine for MVP
    return <Navigate to="/admin" state={{ from: location }} replace />
  }

  return <>{children}</>
}
