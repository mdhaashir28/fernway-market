import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { formatDateTime, formatMoney, formatSlot } from '../lib/format'
import type { StoreInfo } from '../lib/types'

interface StoreContextValue {
  store: StoreInfo
  money: (cents: number) => string
  dateTime: (iso: string) => string
  slot: (startIso: string, endIso: string) => string
}

const FALLBACK: StoreInfo = { name: 'Fernway Market', address: '', phone: '', currency: 'INR', timezone: 'Asia/Kolkata' }

const StoreContext = createContext<StoreContextValue | null>(null)

/** Loads store settings (name, currency, time zone) once and provides formatting helpers. */
export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<StoreInfo>(FALLBACK)

  useEffect(() => {
    api
      .get<StoreInfo>('/api/store')
      .then(setStore)
      .catch(() => {})
  }, [])

  const value = useMemo<StoreContextValue>(
    () => ({
      store,
      money: (cents) => formatMoney(cents, store.currency),
      dateTime: (iso) => formatDateTime(iso, store.timezone),
      slot: (start, end) => formatSlot(start, end, store.timezone),
    }),
    [store],
  )
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx
}
