// A small client for Razorpay's REST API (https://razorpay.com/docs/api/).
// Used only when PAYMENTS_MODE=razorpay. The key secret never leaves the server;
// the app and the checkout page only ever see the public key id.
import crypto from 'node:crypto';
import { config } from '../config.js';

const BASE_URL = 'https://api.razorpay.com/v1';

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const auth = Buffer.from(`${config.RAZORPAY_KEY_ID}:${config.RAZORPAY_KEY_SECRET}`).toString('base64');
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new GatewayError(`Could not reach Razorpay: ${err instanceof Error ? err.message : String(err)}`);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: { description?: string; code?: string } };
  if (!res.ok) throw new GatewayError(data.error?.description ?? `Razorpay returned HTTP ${res.status}`, res.status);
  return data;
}

export interface RazorpayPayment {
  id: string;
  order_id: string | null;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  amount: number;
  currency: string;
  method?: string;
  error_description?: string | null;
}

export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: 'pending' | 'processed' | 'failed';
}

export const razorpay = {
  /** Creates a Razorpay Order for the amount (in paise). Docs: /api/orders/create */
  createOrder: (amountCents: number, receipt: string, notes: Record<string, string>) =>
    request<{ id: string; status: string }>('POST', '/orders', { amount: amountCents, currency: 'INR', receipt: receipt.slice(0, 40), notes }),

  fetchPayment: (paymentId: string) => request<RazorpayPayment>('GET', `/payments/${encodeURIComponent(paymentId)}`),

  orderPayments: (orderId: string) =>
    request<{ items: RazorpayPayment[] }>('GET', `/orders/${encodeURIComponent(orderId)}/payments`).then((r) => r.items ?? []),

  /** Only needed if auto-capture is switched off in the Razorpay Dashboard. */
  capture: (paymentId: string, amountCents: number) =>
    request<RazorpayPayment>('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountCents, currency: 'INR' }),

  /** A normal refund (no extra fee). UPI refunds usually reach the customer in 2–7 working days. */
  refund: (paymentId: string, amountCents: number, notes: Record<string, string>) =>
    request<RazorpayRefund>('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountCents, speed: 'normal', notes }),
};

const safeEqual = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Checkout's success handler returns razorpay_payment_id + razorpay_signature.
 * signature = HMAC-SHA256(order_id + "|" + payment_id, key_secret), where order_id
 * is the one WE stored when creating the order (never the one sent back by the browser).
 */
export function verifyCheckoutSignature(storedOrderId: string, paymentId: string, signature: string): boolean {
  if (!config.RAZORPAY_KEY_SECRET) return false;
  const expected = crypto.createHmac('sha256', config.RAZORPAY_KEY_SECRET).update(`${storedOrderId}|${paymentId}`).digest('hex');
  return safeEqual(expected, String(signature));
}

/** Webhooks: X-Razorpay-Signature = HMAC-SHA256(raw request body, webhook secret). */
export function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!config.RAZORPAY_WEBHOOK_SECRET || !signature) return false;
  const expected = crypto.createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}
