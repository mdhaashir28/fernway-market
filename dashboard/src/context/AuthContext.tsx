import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, api, getToken, onUnauthorized, setToken } from '../lib/api'
import type { User } from '../lib/types'

interface AuthContextValue {
  user: User | null
  /** Managers can change prices, settings, delivery zones, offers and staff accounts. */
  isManager: boolean
  checking: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const isStaffRole = (user: User) => user.role === 'staff' || user.role === 'manager'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(Boolean(getToken()))

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  // If any request finds the token has expired, log out.
  useEffect(() => onUnauthorized(logout), [logout])

  // On first load, check whether a saved token is still valid.
  useEffect(() => {
    if (!getToken()) return
    api
      .get<{ user: User }>('/api/auth/me')
      .then(({ user }) => (isStaffRole(user) ? setUser(user) : logout()))
      .catch(() => logout())
      .finally(() => setChecking(false))
  }, [logout])

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.post<{ token: string; user: User }>('/api/auth/login', { email, password })
    if (!isStaffRole(result.user)) {
      throw new ApiError(403, 'NOT_STAFF', 'This is a customer account. Please log in with a staff or manager account.')
    }
    setToken(result.token)
    setUser(result.user)
  }, [])

  const value = useMemo(
    () => ({ user, isManager: user?.role === 'manager', checking, login, logout }),
    [user, checking, login, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
