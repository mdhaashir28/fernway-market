// How many order updates the customer hasn't read yet (shown on the bell and in Account).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { api } from '@/api/client';
import { useAuth } from './AuthContext';

interface NotificationsContextValue {
  unreadCount: number;
  refresh: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(() => {
    if (!user) return setUnreadCount(0);
    api
      .get<{ unreadCount: number }>('/api/notifications?limit=1')
      .then((r) => setUnreadCount(r.unreadCount))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    refresh();
    if (!user) return;
    const timer = setInterval(refresh, 30_000);
    const sub = AppState.addEventListener('change', (state) => state === 'active' && refresh());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [user, refresh]);

  const value = useMemo(() => ({ unreadCount, refresh }), [unreadCount, refresh]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used inside <NotificationsProvider>');
  return ctx;
}
