import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/api/client';
import type { StoreInfo } from '@/api/types';
import { formatMoney } from '@/lib/format';

interface StoreContextValue {
  store: StoreInfo | null;
  /** Formats paise/cents in the store's currency, e.g. 4550 → "₹45.50". */
  money: (cents: number) => string;
  reload: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

/** Loads store settings (name, currency, delivery zones, payment options) once. */
export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    api
      .get<StoreInfo>('/api/store')
      .then(setStore)
      .catch(() => {});
  }, [version]);

  const value = useMemo<StoreContextValue>(
    () => ({
      store,
      money: (cents) => formatMoney(cents, store?.currency ?? 'INR'),
      reload: () => setVersion((v) => v + 1),
    }),
    [store],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
