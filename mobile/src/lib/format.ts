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

export function formatDate(iso: string, locale = 'en-IN'): string {
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatTime(iso: string, locale = 'en-IN'): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

export function formatDateTime(iso: string, locale = 'en-IN'): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}, ${formatTime(iso, locale)}`;
}

/** English status names (translate them with t()). */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_payment: 'Awaiting payment',
  confirmed: 'Order confirmed',
  preparing: 'Preparing',
  ready_for_pickup: 'Ready for pickup',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** A friendly sentence explaining each status to the customer (English; translate with t()). */
export function statusMessage(status: OrderStatus, type: 'delivery' | 'pickup'): string {
  switch (status) {
    case 'awaiting_payment':
      return 'Waiting for your UPI payment. Your items are held for you.';
    case 'confirmed':
      return "Your order is confirmed. We'll start preparing it soon.";
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
