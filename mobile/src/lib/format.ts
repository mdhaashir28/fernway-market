import type { OrderStatus } from '@/api/types';

/** 4500 → "₹45", 4550 → "₹45.50". Amounts are stored in paise (or cents). */
export function formatMoney(cents: number, currency = 'INR'): string {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${formatTime(iso)}`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "Today", "Tomorrow" or "Thu 16 Oct" */
export function formatDay(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "Today, 10:00 – 11:00" */
export function formatSlot(startIso: string, endIso: string): string {
  return `${formatDay(startIso)}, ${formatTime(startIso)} – ${formatTime(endIso)}`;
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Order placed',
  preparing: 'Preparing',
  ready_for_pickup: 'Ready for pickup',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** A friendly sentence explaining each status to the customer. */
export function statusMessage(status: OrderStatus, type: 'delivery' | 'pickup'): string {
  switch (status) {
    case 'pending':
      return "We've received your order and will start preparing it soon.";
    case 'preparing':
      return 'Our team is picking and packing your items.';
    case 'ready_for_pickup':
      return 'Your order is ready! Collect it from the store at your chosen time.';
    case 'out_for_delivery':
      return 'Your order is on its way to you.';
    case 'completed':
      return type === 'pickup' ? 'Collected — thanks for shopping with us!' : 'Delivered — thanks for shopping with us!';
    case 'cancelled':
      return 'This order was cancelled.';
  }
}
