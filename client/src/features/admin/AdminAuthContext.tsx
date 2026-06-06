import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { adminApi, setAdminUnauthorizedHandler } from './adminApi'
import { clearAdminToken, getAdminToken, setAdminToken } from './adminTokenStorage'
import type { AdminUser } from './types'

type AuthStatus = 'bootstrapping' | 'unauthenticated' | 'authenticated'

interface AdminAuthContextValue {
  admin: AdminUser | null
  status: AuthStatus
  isAuthenticated: boolean
  isBootstrapping: boolean
  login: (password: string) => Promise<void>
  logout: () => void
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null)

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>('bootstrapping')

  const logout = useCallback(() => {
    clearAdminToken()
    setAdmin(null)
    setStatus('unauthenticated')
  }, [])

  // Log out if the admin API rejects the saved token.
  useEffect(() => {
    setAdminUnauthorizedHandler(() => {
      clearAdminToken()
      setAdmin(null)
      setStatus('unauthenticated')
    })
    return () => setAdminUnauthorizedHandler(null)
  }, [])

  // Restore the admin session from the saved token.
  useEffect(() => {
    let cancelled = false
    const token = getAdminToken()
    if (!token) {
      setStatus('unauthenticated')
      return
    }
    void (async () => {
      try {
        const me = await adminApi.me()
        if (cancelled) return
        setAdmin(me)
        setStatus('authenticated')
      } catch {
        if (cancelled) return
        clearAdminToken()
        setAdmin(null)
        setStatus('unauthenticated')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (password: string) => {
    const result = await adminApi.login(password)
    setAdminToken(result.token)
    setAdmin(result.admin)
    setStatus('authenticated')
  }, [])

  const value = useMemo<AdminAuthContextValue>(
    () => ({
      admin,
      status,
      isAuthenticated: status === 'authenticated',
      isBootstrapping: status === 'bootstrapping',
      login,
      logout,
    }),
    [admin, status, login, logout],
  )

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth must be used inside <AdminAuthProvider>')
  return ctx
}
