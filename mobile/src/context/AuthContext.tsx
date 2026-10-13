import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, onUnauthorized, setAuthToken } from '@/api/client';
import type { User } from '@/api/types';
import { secureStorage } from '@/lib/storage';

const TOKEN_KEY = 'fernway.token';

interface SignupInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

interface AuthContextValue {
  user: User | null;
  /** True while we check a saved login when the app starts. */
  restoring: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);

  const saveSession = useCallback(async (token: string | null, nextUser: User | null) => {
    setAuthToken(token);
    await secureStorage.set(TOKEN_KEY, token);
    setUser(nextUser);
  }, []);

  const logout = useCallback(() => saveSession(null, null), [saveSession]);

  useEffect(() => onUnauthorized(() => void logout()), [logout]);

  // When the app opens, check whether we have a saved login that still works.
  useEffect(() => {
    (async () => {
      const token = await secureStorage.get(TOKEN_KEY);
      if (token) {
        setAuthToken(token);
        try {
          const { user: me } = await api.get<{ user: User }>('/api/auth/me');
          setUser(me);
        } catch (err) {
          // Only forget the token if the server rejected it (not if we're offline).
          if ((err as { status?: number }).status === 401) await saveSession(null, null);
        }
      }
      setRestoring(false);
    })();
  }, [saveSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api.post<{ token: string; user: User }>('/api/auth/login', { email, password });
      await saveSession(result.token, result.user);
    },
    [saveSession],
  );

  const signup = useCallback(
    async (input: SignupInput) => {
      const result = await api.post<{ token: string; user: User }>('/api/auth/signup', input);
      await saveSession(result.token, result.user);
    },
    [saveSession],
  );

  const value = useMemo(() => ({ user, restoring, login, signup, logout }), [user, restoring, login, signup, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
