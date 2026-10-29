// UPI payments for orders, through Razorpay's secure hosted Checkout — or a
// clearly labelled DEMO when PAYMENTS_MODE=demo (no money moves).
//
// How a UPI payment works:
//   1. The customer places an order with paymentMethod "upi". It waits in
//      "awaiting_payment" with its stock and pickup slot held for
//      PAYMENT_TIMEOUT_MINUTES.
//   2. startPayment() records a payment attempt and creates a Razorpay Order.
//      The app opens our /pay/<token> page, which opens Razorpay Checkout
//      (UPI only). The customer approves the payment in their UPI app — we
//      never see or store the UPI PIN, card or bank details.
//   3. The order is marked PAID only after the SERVER has verified the result:
//      Checkout's signature is checked with the key secret AND the payment is
//      fetched from Razorpay to confirm it was captured for the right amount.
//      Razorpay webhooks (payment.captured / payment.failed / refund.*) are
//      handled the same way, so a payment still counts if the app was closed.
//   4. Failed, cancelled or still-pending attempts leave the order waiting:
//      the customer can pay again, switch to pay on delivery, or cancel.
//      Unpaid orders are cancelled automatically when time runs out.
// We store only references (Razorpay order/payment/refund ids), statuses,
// amounts and times.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { pool, withTransaction, type Db } from '../db/pool.js';
import { ApiError, conflict, forbidden, notFound } from '../lib/errors.js';
import { formatMoney } from '../lib/money.js';
import { orderNumber } from '../lib/order-number.js';
import { addOrderEvent, GATEWAY, type Actor } from './audit.service.js';
import { flushWhatsAppQueueSoon, notifyCustomer } from './notification.service.js';
import { razorpay, verifyCheckoutSignature, verifyWebhookSignature, type RazorpayPayment } from './razorpay.js';

export type PaymentProvider = 'razorpay' | 'demo';
export const currentProvider = (): PaymentProvider => (config.paymentsEnvironment === 'demo' ? 'demo' : 'razorpay');
export const paymentsAreDemo = () => currentProvider() === 'demo';
/** demo (practice page) · test (Razorpay test keys, no real money) · live (real money). */
export const paymentsEnvironment = () => config.paymentsEnvironment;

export interface PaymentRow {
  id: number;
  orderId: number;
  provider: PaymentProvider;
  /** Razorpay with TEST keys: no real money moved. */
  testMode: boolean;
  status: 'created' | 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired';
  amountCents: number;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  failureReason: string | null;
  checkoutToken: string;
  returnUrl: string | null;
  createdAt: Date;
  paidAt: Date | null;
}

const PAYMENT_COLUMNS = `
  p.id, p.order_id AS "orderId", p.provider, p.test_mode AS "testMode", p.status, p.amount_cents AS "amountCents",
  p.provider_order_id AS "providerOrderId", p.provider_payment_id AS "providerPaymentId",
  p.failure_reason AS "failureReason", p.checkout_token AS "checkoutToken", p.return_url AS "returnUrl",
  p.created_at AS "createdAt", p.paid_at AS "paidAt"`;

async function lockPayment(db: Db, paymentId: number): Promise<PaymentRow> {
  const { rows } = await db.query<PaymentRow>(`SELECT ${PAYMENT_COLUMNS} FROM payments p WHERE p.id = $1 FOR UPDATE`, [paymentId]);
  if (!rows[0]) throw notFound('Payment');
  return rows[0];
}

export async function findPaymentByToken(token: string): Promise<PaymentRow | null> {
  const { rows } = await pool.query<PaymentRow>(`SELECT ${PAYMENT_COLUMNS} FROM payments p WHERE p.checkout_token = $1`, [token]);
  return rows[0] ?? null;
}

/** Only redirect back to our own apps and websites after paying (never to arbitrary sites). */
export function safeReturnUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    // The phone app (scheme from app.json) and Expo Go during development.
    if (['fernway:', 'exp:', 'exps:'].includes(parsed.protocol)) return url;
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      if (config.corsOrigins.includes(parsed.origin)) return url;
      if (!config.isProduction && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(parsed.hostname)) return url;
    }
  } catch {
    // not a URL
  }
  return null;
}

/** Keeps the order's payment_status in step with its payments and refunds. */
async function recomputePaymentStatus(db: Db, orderId: number): Promise<void> {
  await db.query(
    `WITH totals AS (
       SELECT COALESCE((SELECT sum(amount_cents) FROM payments WHERE order_id = $1 AND status = 'paid'), 0) AS paid,
              COALESCE((SELECT sum(amount_cents) FROM refunds WHERE order_id = $1 AND status = 'processed'), 0) AS processed,
              COALESCE((SELECT sum(amount_cents) FROM refunds WHERE order_id = $1 AND status = 'pending'), 0) AS pending
     )
     UPDATE orders o SET
       refunded_cents = totals.processed + totals.pending,
       payment_status = CASE
         WHEN totals.paid = 0 THEN o.payment_status
         WHEN totals.pending > 0 THEN 'refund_pending'::payment_status
         WHEN totals.processed >= totals.paid THEN 'refunded'::payment_status
         WHEN totals.processed > 0 THEN 'partially_refunded'::payment_status
         ELSE 'paid'::payment_status END
     FROM totals WHERE o.id = $1`,
    [orderId],
  );
}

// ---------------------------------------------------------------------------
// Starting a payment
// ---------------------------------------------------------------------------
export async function startPayment(orderId: number, userId: number, returnUrl: string | null, baseUrl: string) {
  const provider = currentProvider();
  const testMode = provider === 'razorpay' && config.paymentsEnvironment === 'test';
  const attempt = await withTransaction(async (client) => {
    const { rows } = await client.query<{ userId: number; status: string; totalCents: number; dueBy: Date | null }>(
      `SELECT user_id AS "userId", status, total_cents AS "totalCents", payment_due_by AS "dueBy" FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId],
    );
    const order = rows[0];
    if (!order || order.userId !== userId) throw notFound('Order');
    if (order.status !== 'awaiting_payment') {
      throw conflict('PAYMENT_NOT_NEEDED', order.status === 'cancelled' ? 'This order was cancelled.' : 'This order has already been paid or does not need a payment.');
    }
    if (order.dueBy && order.dueBy.getTime() < Date.now()) {
      throw conflict('PAYMENT_EXPIRED', 'The time to pay for this order has run out. Please place the order again.');
    }
    // Close earlier unfinished attempts. If one of them is paid later anyway, it is refunded automatically.
    await client.query(`UPDATE payments SET status = 'cancelled', cancelled_at = now() WHERE order_id = $1 AND status IN ('created', 'pending')`, [orderId]);
    const token = crypto.randomBytes(24).toString('base64url');
    const { rows: created } = await client.query<{ id: number }>(
      `INSERT INTO payments (order_id, provider, test_mode, amount_cents, checkout_token, return_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [orderId, provider, testMode, order.totalCents, token, safeReturnUrl(returnUrl)],
    );
    await client.query(`UPDATE orders SET payment_status = 'pending' WHERE id = $1`, [orderId]);
    await addOrderEvent(client, orderId, { id: userId, role: 'customer' }, {
      type: 'payment_started',
      message: `UPI payment started${provider === 'demo' ? ' (DEMO — no money moves)' : testMode ? ' with Razorpay (TEST mode — no real money)' : ' with Razorpay'}`,
      details: { paymentId: created[0].id, amountCents: order.totalCents },
    });
    return { id: created[0].id, token, amountCents: order.totalCents };
  });

  if (provider === 'razorpay') {
    try {
      const gatewayOrder = await razorpay.createOrder(attempt.amountCents, `${orderNumber(orderId)}-${attempt.id}`, {
        order_number: orderNumber(orderId),
        payment_attempt: String(attempt.id),
      });
      await pool.query('UPDATE payments SET provider_order_id = $2 WHERE id = $1', [attempt.id, gatewayOrder.id]);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await pool.query(`UPDATE payments SET status = 'failed', failure_reason = $2, failed_at = now() WHERE id = $1`, [
        attempt.id,
        `Could not start the payment: ${reason}`.slice(0, 300),
      ]);
      throw new ApiError(502, 'PAYMENT_START_FAILED', "We couldn't start the UPI payment just now. Please try again in a moment, or choose pay on delivery.");
    }
  }
  return { paymentId: attempt.id, checkoutUrl: `${baseUrl}/pay/${attempt.token}` };
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------
/**
 * Marks an attempt paid (after the server has verified it). Idempotent.
 * If the order was already paid by another attempt, or was cancelled before
 * the money arrived, this payment is refunded automatically.
 */
export async function markPaymentPaid(paymentId: number, providerPaymentId: string, actor: Actor): Promise<'confirmed' | 'already_recorded' | 'refunding'> {
  const result = await withTransaction(async (client) => {
    const payment = await lockPayment(client, paymentId);
    if (payment.status === 'paid') return { outcome: 'already_recorded' as const, payment };
    const { rows } = await client.query<{ userId: number; status: string; totalCents: number }>(
      'SELECT user_id AS "userId", status, total_cents AS "totalCents" FROM orders WHERE id = $1 FOR UPDATE',
      [payment.orderId],
    );
    const order = rows[0];

    await client.query(
      `UPDATE payments SET status = 'paid', provider_payment_id = COALESCE($2, provider_payment_id), paid_at = now(), failure_reason = NULL WHERE id = $1`,
      [paymentId, providerPaymentId],
    );
    await addOrderEvent(client, payment.orderId, actor, {
      type: 'payment_received',
      message: `UPI payment of ${formatMoney(payment.amountCents)} received${payment.provider === 'demo' ? ' (DEMO)' : ''}`,
      details: { paymentId, providerPaymentId },
      visibleToCustomer: true,
    });

    const { rows: others } = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM payments WHERE order_id = $1 AND status = 'paid' AND id <> $2`,
      [payment.orderId, paymentId],
    );
    if (order.status === 'awaiting_payment' && others[0].count === 0) {
      await client.query(
        `UPDATE orders SET status = 'confirmed', payment_status = 'paid', paid_at = now(), payment_due_by = NULL WHERE id = $1`,
        [payment.orderId],
      );
      await client.query(`UPDATE payments SET status = 'cancelled', cancelled_at = now() WHERE order_id = $1 AND status IN ('created', 'pending')`, [payment.orderId]);
      await client.query(`INSERT INTO order_status_history (order_id, status, note) VALUES ($1, 'confirmed', 'Payment received')`, [payment.orderId]);
      await notifyCustomer(client, { userId: order.userId, orderId: payment.orderId, event: 'order_confirmed', vars: { total: formatMoney(order.totalCents) } });
      return { outcome: 'confirmed' as const, payment };
    }

    // Paid twice, or paid after the order was cancelled → give this payment back.
    await addOrderEvent(client, payment.orderId, actor, {
      type: 'payment_refund_needed',
      message:
        order.status === 'cancelled'
          ? 'A payment arrived after the order was cancelled — refunding it automatically'
          : 'A second payment arrived for an order that was already paid — refunding it automatically',
      details: { paymentId },
    });
    await recomputePaymentStatus(client, payment.orderId);
    return { outcome: 'refunding' as const, payment };
  });

  if (result.outcome === 'refunding') {
    await refundPayment(result.payment.id, result.payment.amountCents, 'Duplicate or late payment', actor);
  }
  flushWhatsAppQueueSoon();
  return result.outcome;
}

/** Records a failed attempt. The order keeps waiting so the customer can try again. */
export async function markPaymentFailed(paymentId: number, reason: string, actor: Actor): Promise<void> {
  await withTransaction(async (client) => {
    const payment = await lockPayment(client, paymentId);
    if (payment.status === 'paid' || payment.status === 'failed' || payment.status === 'expired') return;
    await client.query(`UPDATE payments SET status = 'failed', failure_reason = $2, failed_at = now() WHERE id = $1`, [paymentId, reason.slice(0, 300)]);
    const { rows } = await client.query<{ userId: number; status: string }>('SELECT user_id AS "userId", status FROM orders WHERE id = $1 FOR UPDATE', [payment.orderId]);
    const order = rows[0];
    await addOrderEvent(client, payment.orderId, actor, {
      type: 'payment_failed',
      message: `UPI payment failed: ${reason}`,
      details: { paymentId },
      visibleToCustomer: true,
    });
    if (order.status === 'awaiting_payment') {
      await client.query(`UPDATE orders SET payment_status = 'failed' WHERE id = $1`, [payment.orderId]);
      await notifyCustomer(client, { userId: order.userId, orderId: payment.orderId, event: 'payment_failed' });
    }
  });
}

/** The customer closed the payment screen without paying. */
export async function markPaymentCancelled(paymentId: number, actor: Actor): Promise<void> {
  await withTransaction(async (client) => {
    const payment = await lockPayment(client, paymentId);
    if (payment.status !== 'created' && payment.status !== 'pending') return;
    await client.query(`UPDATE payments SET status = 'cancelled', cancelled_at = now() WHERE id = $1`, [paymentId]);
    await addOrderEvent(client, payment.orderId, actor, {
      type: 'payment_cancelled',
      message: 'UPI payment screen closed without paying',
      details: { paymentId },
    });
  });
}

/** The customer said they paid but the result isn't known yet (e.g. still approving in the UPI app). */
export async function markPaymentPending(paymentId: number): Promise<void> {
  await pool.query(`UPDATE payments SET status = 'pending' WHERE id = $1 AND status = 'created'`, [paymentId]);
}

/** Razorpay: the success handler on our checkout page sends us the signed result. */
export async function confirmRazorpayCheckout(
  payment: PaymentRow,
  body: { razorpay_payment_id?: string; razorpay_order_id?: string; razorpay_signature?: string },
): Promise<'paid' | 'pending' | 'failed'> {
  if (payment.provider !== 'razorpay' || !payment.providerOrderId) throw conflict('WRONG_PROVIDER', 'This payment is not a Razorpay payment.');
  const paymentId = String(body.razorpay_payment_id ?? '');
  // Verify against the order id WE stored, never the one sent back by the browser.
  if (!paymentId || !verifyCheckoutSignature(payment.providerOrderId, paymentId, String(body.razorpay_signature ?? ''))) {
    await addOrderEvent(pool, payment.orderId, GATEWAY, { type: 'payment_signature_invalid', message: 'Rejected a payment result with an invalid signature' });
    throw new ApiError(400, 'INVALID_SIGNATURE', 'We could not verify this payment. If money left your account, contact the store with your order number.');
  }
  return settleRazorpayPayment(payment, await razorpay.fetchPayment(paymentId));
}

/** Applies Razorpay's own record of a payment (after checking it belongs to this attempt). */
async function settleRazorpayPayment(payment: PaymentRow, gatewayPayment: RazorpayPayment): Promise<'paid' | 'pending' | 'failed'> {
  if (gatewayPayment.order_id !== payment.providerOrderId || gatewayPayment.amount !== payment.amountCents || gatewayPayment.currency !== 'INR') {
    await addOrderEvent(pool, payment.orderId, GATEWAY, {
      type: 'payment_mismatch',
      message: 'Razorpay reported a payment that does not match this order (amount or order id) — not marked as paid',
      details: { providerPaymentId: gatewayPayment.id },
    });
    return 'failed';
  }
  let status = gatewayPayment.status;
  if (status === 'authorized') status = (await razorpay.capture(gatewayPayment.id, payment.amountCents)).status;
  if (status === 'captured' || status === 'refunded') {
    await markPaymentPaid(payment.id, gatewayPayment.id, GATEWAY);
    return 'paid';
  }
  if (status === 'failed') {
    await markPaymentFailed(payment.id, gatewayPayment.error_description || 'The payment was declined', GATEWAY);
    return 'failed';
  }
  await markPaymentPending(payment.id);
  return 'pending';
}

/**
 * Asks Razorpay what happened to an order's payment attempts (used by
 * "Check payment status" and before an unpaid order is cancelled).
 */
export async function refreshOrderPayments(orderId: number): Promise<void> {
  if (currentProvider() !== 'razorpay') return;
  const { rows } = await pool.query<PaymentRow>(
    `SELECT ${PAYMENT_COLUMNS} FROM payments p
     WHERE p.order_id = $1 AND p.provider = 'razorpay' AND p.provider_order_id IS NOT NULL AND p.status <> 'paid'
       AND p.created_at > now() - interval '3 days'`,
    [orderId],
  );
  for (const payment of rows) {
    const attempts = await razorpay.orderPayments(payment.providerOrderId!);
    const best =
      attempts.find((a) => a.status === 'captured' || a.status === 'refunded') ??
      attempts.find((a) => a.status === 'authorized') ??
      attempts.find((a) => a.status === 'failed');
    if (best) await settleRazorpayPayment(payment, best);
  }
}

// ---------------------------------------------------------------------------
// DEMO payments (PAYMENTS_MODE=demo only)
// ---------------------------------------------------------------------------
export type DemoOutcome = 'success' | 'failure' | 'cancel' | 'pending';

export async function completeDemoPayment(payment: PaymentRow, outcome: DemoOutcome): Promise<void> {
  if (!paymentsAreDemo() || payment.provider !== 'demo') throw forbidden('Demo payments are switched off.');
  if (outcome === 'success') await markPaymentPaid(payment.id, `demo_pay_${payment.id}`, GATEWAY);
  else if (outcome === 'failure') await markPaymentFailed(payment.id, 'DEMO: payment declined by the bank (simulated)', GATEWAY);
  else if (outcome === 'cancel') await markPaymentCancelled(payment.id, { role: 'customer' });
  else await markPaymentPending(payment.id);
}

// ---------------------------------------------------------------------------
// Refunds (always back to the customer's original payment)
// ---------------------------------------------------------------------------
interface RefundRow {
  id: number;
  orderId: number;
  paymentId: number;
  provider: PaymentProvider;
  amountCents: number;
  status: 'pending' | 'processed' | 'failed';
  providerPaymentId: string | null;
}

/** Refunds up to `amountCents` of an order's UPI payments. Returns the amount refunded. */
export async function refundOrderAmount(orderId: number, amountCents: number, reason: string, actor: Actor, { notify = true } = {}): Promise<number> {
  if (amountCents <= 0) return 0;
  const created = await withTransaction(async (client) => {
    const { rows: order } = await client.query<{ userId: number }>('SELECT user_id AS "userId" FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (!order[0]) throw notFound('Order');
    const { rows: payments } = await client.query<{ id: number; provider: PaymentProvider; amountCents: number; refunded: number }>(
      `SELECT p.id, p.provider, p.amount_cents AS "amountCents",
              COALESCE((SELECT sum(r.amount_cents) FROM refunds r WHERE r.payment_id = p.id AND r.status <> 'failed'), 0)::int AS refunded
       FROM payments p WHERE p.order_id = $1 AND p.status = 'paid' ORDER BY p.paid_at, p.id`,
      [orderId],
    );
    let remaining = amountCents;
    const ids: number[] = [];
    for (const payment of payments) {
      const take = Math.min(remaining, payment.amountCents - payment.refunded);
      if (take <= 0) continue;
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO refunds (order_id, payment_id, provider, amount_cents, reason, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [orderId, payment.id, payment.provider, take, reason, actor.id ?? null],
      );
      ids.push(rows[0].id);
      remaining -= take;
    }
    const total = amountCents - remaining;
    if (total > 0) {
      await recomputePaymentStatus(client, orderId);
      await addOrderEvent(client, orderId, actor, {
        type: 'refund_started',
        message: `Refund of ${formatMoney(total)} started: ${reason}`,
        details: { refundIds: ids },
        visibleToCustomer: true,
      });
      if (notify) await notifyCustomer(client, { userId: order[0].userId, orderId, event: 'refund_initiated', vars: { amount: formatMoney(total) } });
    }
    return { ids, total };
  });
  for (const id of created.ids) await processRefund(id);
  flushWhatsAppQueueSoon();
  return created.total;
}

/** Refunds part or all of one payment (e.g. a duplicate payment). */
async function refundPayment(paymentId: number, amountCents: number, reason: string, actor: Actor): Promise<void> {
  const { rows } = await withTransaction(async (client) => {
    const payment = await lockPayment(client, paymentId);
    return client.query<{ id: number }>(
      `INSERT INTO refunds (order_id, payment_id, provider, amount_cents, reason, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [payment.orderId, paymentId, payment.provider, amountCents, reason, actor.id ?? null],
    );
  });
  await processRefund(rows[0].id);
}

async function processRefund(refundId: number): Promise<void> {
  const { rows } = await pool.query<RefundRow>(
    `SELECT r.id, r.order_id AS "orderId", r.payment_id AS "paymentId", r.provider, r.amount_cents AS "amountCents", r.status,
            p.provider_payment_id AS "providerPaymentId"
     FROM refunds r JOIN payments p ON p.id = r.payment_id WHERE r.id = $1`,
    [refundId],
  );
  const refund = rows[0];
  if (!refund || refund.status !== 'pending') return;
  if (refund.provider === 'demo') {
    await pool.query('UPDATE refunds SET provider_refund_id = $2 WHERE id = $1', [refundId, `demo_rfnd_${refundId}`]);
    await finalizeRefund(refundId, 'processed');
    return;
  }
  try {
    const result = await razorpay.refund(refund.providerPaymentId!, refund.amountCents, {
      order_number: orderNumber(refund.orderId),
      refund_id: String(refundId),
    });
    await pool.query('UPDATE refunds SET provider_refund_id = $2 WHERE id = $1', [refundId, result.id]);
    if (result.status === 'processed') await finalizeRefund(refundId, 'processed');
    else if (result.status === 'failed') await finalizeRefund(refundId, 'failed', 'Razorpay could not process the refund');
    // "pending": Razorpay tells us later through the refund.processed / refund.failed webhook.
  } catch (err) {
    await finalizeRefund(refundId, 'failed', err instanceof Error ? err.message : String(err));
  }
}

export async function finalizeRefund(refundId: number, status: 'processed' | 'failed', failureReason?: string): Promise<void> {
  await withTransaction(async (client) => {
    const { rows } = await client.query<RefundRow & { userId: number }>(
      `SELECT r.id, r.order_id AS "orderId", r.amount_cents AS "amountCents", r.status, o.user_id AS "userId"
       FROM refunds r JOIN orders o ON o.id = r.order_id WHERE r.id = $1 FOR UPDATE OF r`,
      [refundId],
    );
    const refund = rows[0];
    if (!refund || refund.status !== 'pending') return;
    await client.query(
      `UPDATE refunds SET status = $2, failure_reason = $3, processed_at = CASE WHEN $2 = 'processed' THEN now() END WHERE id = $1`,
      [refundId, status, failureReason?.slice(0, 300) ?? null],
    );
    await recomputePaymentStatus(client, refund.orderId);
    if (status === 'processed') {
      await addOrderEvent(client, refund.orderId, GATEWAY, {
        type: 'refund_processed',
        message: `Refund of ${formatMoney(refund.amountCents)} processed`,
        details: { refundId },
        visibleToCustomer: true,
      });
      await notifyCustomer(client, { userId: refund.userId, orderId: refund.orderId, event: 'refund_processed', vars: { amount: formatMoney(refund.amountCents) } });
    } else {
      await addOrderEvent(client, refund.orderId, GATEWAY, {
        type: 'refund_failed',
        message: `Refund of ${formatMoney(refund.amountCents)} FAILED: ${failureReason ?? 'unknown reason'}. A manager can retry it from the order page.`,
        details: { refundId },
      });
    }
  });
  flushWhatsAppQueueSoon();
}

/** Managers: try a failed refund again. */
export async function retryRefund(refundId: number, actor: Actor): Promise<void> {
  const { rows } = await pool.query<{ orderId: number; amountCents: number; status: string; reason: string }>(
    'SELECT order_id AS "orderId", amount_cents AS "amountCents", status, reason FROM refunds WHERE id = $1',
    [refundId],
  );
  const refund = rows[0];
  if (!refund) throw notFound('Refund');
  if (refund.status !== 'failed') throw conflict('REFUND_NOT_FAILED', 'Only failed refunds can be retried.');
  await refundOrderAmount(refund.orderId, refund.amountCents, `${refund.reason} (retry)`, actor, { notify: false });
}

// ---------------------------------------------------------------------------
// Razorpay webhooks
// ---------------------------------------------------------------------------
interface WebhookEvent {
  event: string;
  payload: {
    payment?: { entity: RazorpayPayment };
    order?: { entity: { id: string } };
    refund?: { entity: { id: string; payment_id: string; amount: number } };
  };
}

/**
 * Handles a Razorpay webhook. The signature is checked against the raw body,
 * and each event id is processed only once (Razorpay may send it again).
 */
export async function handleRazorpayWebhook(rawBody: Buffer, signature: string | undefined, eventId: string | undefined): Promise<string> {
  if (!verifyWebhookSignature(rawBody, signature)) throw new ApiError(400, 'INVALID_SIGNATURE', 'Invalid webhook signature.');
  if (eventId) {
    const seen = await pool.query('SELECT 1 FROM processed_webhooks WHERE provider = $1 AND event_id = $2', ['razorpay', eventId]);
    if (seen.rowCount) return 'duplicate';
  }
  const event = JSON.parse(rawBody.toString('utf8')) as WebhookEvent;
  const gatewayPayment = event.payload.payment?.entity;
  const findPayment = async (providerOrderId: string | null | undefined) => {
    if (!providerOrderId) return null;
    const { rows } = await pool.query<PaymentRow>(`SELECT ${PAYMENT_COLUMNS} FROM payments p WHERE p.provider = 'razorpay' AND p.provider_order_id = $1`, [providerOrderId]);
    return rows[0] ?? null;
  };

  switch (event.event) {
    case 'payment.authorized':
    case 'payment.captured':
    case 'order.paid': {
      const payment = await findPayment(gatewayPayment?.order_id ?? event.payload.order?.entity.id);
      if (payment && gatewayPayment) await settleRazorpayPayment(payment, gatewayPayment);
      break;
    }
    case 'payment.failed': {
      const payment = await findPayment(gatewayPayment?.order_id);
      if (payment) await markPaymentFailed(payment.id, gatewayPayment?.error_description || 'The payment was declined', GATEWAY);
      break;
    }
    case 'refund.processed':
    case 'refund.failed': {
      const refundEntity = event.payload.refund?.entity;
      if (refundEntity) {
        const { rows } = await pool.query<{ id: number }>(`SELECT id FROM refunds WHERE provider = 'razorpay' AND provider_refund_id = $1`, [refundEntity.id]);
        if (rows[0]) {
          await finalizeRefund(rows[0].id, event.event === 'refund.processed' ? 'processed' : 'failed', event.event === 'refund.failed' ? 'Razorpay reported that the refund failed' : undefined);
        }
      }
      break;
    }
    default:
      break;
  }
  if (eventId) await pool.query('INSERT INTO processed_webhooks (provider, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', ['razorpay', eventId]);
  return event.event;
}
