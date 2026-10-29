// Dates, times and order statuses in the app's language.
import type { OrderStatus } from '@/api/types';
import { useT } from '@/i18n';
import { formatDate, formatDateTime, formatTime, STATUS_LABELS, statusMessage } from './format';

export function useFormat() {
  const { t, locale } = useT();

  /** "Today", "Tomorrow" or "Thu 16 Oct" */
  const day = (iso: string) => {
    const date = new Date(iso);
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    if (date.toDateString() === today.toDateString()) return t('Today');
    if (date.toDateString() === tomorrow.toDateString()) return t('Tomorrow');
    return date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  };
  const time = (iso: string) => formatTime(iso, locale);

  return {
    date: (iso: string) => formatDate(iso, locale),
    dateTime: (iso: string) => formatDateTime(iso, locale),
    time,
    day,
    /** "Today, 10:00 – 11:00" */
    slot: (startIso: string, endIso: string) => `${day(startIso)}, ${time(startIso)} – ${time(endIso)}`,
    statusLabel: (status: OrderStatus) => t(STATUS_LABELS[status]),
    statusMessage: (status: OrderStatus, type: 'delivery' | 'pickup') => t(statusMessage(status, type)),
  };
}
