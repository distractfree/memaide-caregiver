import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, ApiClientError, setUnauthorizedHandler } from '@/services/apiClient'
import { clearToken, getToken, setToken } from '@/services/tokenStorage'
import type { Caregiver, RegisterInput } from '@/types/domain'

type AuthStatus = 'bootstrapping' | 'unauthenticated' | 'authenticated'

interface AuthContextValue {
  caregiver: Caregiver | null
  status: AuthStatus
  isAuthenticated: boolean
  isBootstrapping: boolean
  login: (email: string, password: string) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [caregiver, setCaregiver] = useState<Caregiver | null>(null)
  const [status, setStatus] = useState<AuthStatus>('bootstrapping')

  const logout = useCallback(() => {
    clearToken()
    setCaregiver(null)
    setStatus('unauthenticated')
  }, [])

  // Log out if the API says the saved token is no longer valid.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearToken()
      setCaregiver(null)
      setStatus('unauthenticated')
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  // Restore the session from the saved token.
  useEffect(() => {
    let cancelled = false
    const token = getToken()
    if (!token) {
      setStatus('unauthenticated')
      return
    }
    void (async () => {
      try {
        const me = await api.me()
        if (cancelled) return
        setCaregiver(me)
        setStatus('authenticated')
      } catch {
        if (cancelled) return
        clearToken()
        setCaregiver(null)
        setStatus('unauthenticated')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.login(email, password)
    setToken(result.token)
    setCaregiver(result.caregiver)
    setStatus('authenticated')
  }, [])

  const register = useCallback(async (input: RegisterInput) => {
    const result = await api.register(input)
    setToken(result.token)
    setCaregiver(result.caregiver)
    setStatus('authenticated')
  }, [])

  const refresh = useCallback(async () => {
    try {
      const me = await api.me()
      setCaregiver(me)
      setStatus('authenticated')
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        logout()
      }
      throw err
    }
  }, [logout])

  const value = useMemo<AuthContextValue>(
    () => ({
      caregiver,
      status,
      isAuthenticated: status === 'authenticated',
      isBootstrapping: status === 'bootstrapping',
      login,
      register,
      logout,
      refresh,
    }),
    [caregiver, status, login, register, logout, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
