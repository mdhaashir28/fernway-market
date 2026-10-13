import type { OrderStatus, PaymentMethod, PaymentStatus } from './types'

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  preparing: 'Preparing',
  ready_for_pickup: 'Ready for pickup',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

/** The words on the button that moves an order to each status. */
export const STATUS_ACTIONS: Record<OrderStatus, string> = {
  pending: 'Mark as pending',
  preparing: 'Start preparing',
  ready_for_pickup: 'Mark ready for pickup',
  out_for_delivery: 'Send out for delivery',
  completed: 'Mark as completed',
  cancelled: 'Cancel order',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pay_on_fulfillment: 'Pay on delivery / collection',
  demo_card: 'Demo card payment',
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  paid: 'Paid',
  refunded: 'Refunded',
}

/** 4500 → "₹45", 4550 → "₹45.50". Amounts are stored in paise (or cents). */
export function formatMoney(cents: number, currency: string): string {
  const digits = cents % 100 === 0 ? 0 : 2
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(cents / 100)
}

export function formatDateTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(iso))
}

/** "Tue 14 Oct, 10:00 – 11:00" */
export function formatSlot(startIso: string, endIso: string, timeZone?: string): string {
  const day = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone })
  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZone })
  return `${day.format(new Date(startIso))}, ${time.format(new Date(startIso))} – ${time.format(new Date(endIso))}`
}

export function timeAgo(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/** 1299 → "12.99" for form inputs */
export const centsToInput = (cents: number | null | undefined) => (cents == null ? '' : (cents / 100).toFixed(2))

/** "12.99" → 1299; returns null for empty or invalid input */
export function inputToCents(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '')
  if (!trimmed || !/^\d+(\.\d{0,2})?$/.test(trimmed)) return null
  return Math.round(Number(trimmed) * 100)
}
