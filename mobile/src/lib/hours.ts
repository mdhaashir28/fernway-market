import type { StoreInfo } from '@/api/types';

/** Today's opening hours in the store's time zone. */
export function todaysHours(store: StoreInfo): { open: true; text: string } | { open: false; reason: string | null } {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: store.timezone }));
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const closure = store.closures?.find((c) => c.date === today);
  const hours = store.openingHours?.find((h) => h.weekday === now.getDay());
  if (closure) return { open: false, reason: closure.reason };
  if (!hours || hours.isClosed) return { open: false, reason: null };
  return { open: true, text: `${hours.opensAt} – ${hours.closesAt}` };
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
