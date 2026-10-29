// The hosted payment page (/pay/<token>), the calls it makes, and the payment
// gateway / WhatsApp webhooks.
//
// The payment page is opened from the app in a secure browser tab, so it can't
// use the app's login. Instead each payment attempt has a long random token
// that only lets someone pay for that one order.
import crypto from 'node:crypto';
import express, { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { notFound } from '../lib/errors.js';
import { formatMoney } from '../lib/money.js';
import { orderNumber } from '../lib/order-number.js';
import { parse } from '../lib/validation.js';
import { GATEWAY } from '../services/audit.service.js';
import { applyWhatsAppStatuses, verifyWhatsAppSignature } from '../services/notification.service.js';
import {
  completeDemoPayment,
  confirmRazorpayCheckout,
  findPaymentByToken,
  handleRazorpayWebhook,
  markPaymentCancelled,
  markPaymentFailed,
  type PaymentRow,
} from '../services/payment.service.js';
import { paymentPageCsp, renderPaymentPage } from '../services/payment-page.js';

// ---------------------------------------------------------------------------
// GET /pay/:token — the page
// ---------------------------------------------------------------------------
export const payPageRouter = Router();

const tokenParam = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/, 'Invalid payment link') });

payPageRouter.get('/:token', async (req, res) => {
  const { token } = parse(tokenParam, req.params);
  const payment = await findPaymentByToken(token);
  if (!payment) throw notFound('Payment');
  const { rows } = await pool.query<{ status: string; name: string; email: string; phone: string | null; lang: 'en' | 'ta' }>(
    `SELECT o.status, u.name, u.email, u.phone, u.preferred_language AS lang
     FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = $1`,
    [payment.orderId],
  );
  const order = rows[0];
  const nonce = crypto.randomBytes(16).toString('base64');
  const html = renderPaymentPage(
    {
      token,
      mode: payment.provider,
      testMode: payment.testMode,
      lang: order.lang === 'ta' ? 'ta' : 'en',
      storeName: config.STORE_NAME,
      orderNumber: orderNumber(payment.orderId),
      amountText: formatMoney(payment.amountCents),
      amountCents: payment.amountCents,
      status: payment.status,
      orderStatus: order.status,
      returnUrl: payment.returnUrl,
      razorpay:
        payment.provider === 'razorpay' && payment.providerOrderId
          ? {
              keyId: config.RAZORPAY_KEY_ID ?? '',
              orderId: payment.providerOrderId,
              prefill: { name: order.name, email: order.email, contact: order.phone ?? '' },
            }
          : undefined,
    },
    nonce,
  );
  res.setHeader('Content-Security-Policy', paymentPageCsp(nonce));
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(html);
});

// ---------------------------------------------------------------------------
// /api/payments/:token/... — results reported by the payment page
// ---------------------------------------------------------------------------
export const paymentCallbackRouter = Router();

async function paymentFromToken(token: unknown): Promise<PaymentRow> {
  const { token: valid } = parse(tokenParam, { token });
  const payment = await findPaymentByToken(valid);
  if (!payment) throw notFound('Payment');
  return payment;
}

async function currentStatus(paymentId: number): Promise<string> {
  const { rows } = await pool.query<{ status: string }>('SELECT status FROM payments WHERE id = $1', [paymentId]);
  return rows[0]?.status ?? 'failed';
}

/** Razorpay Checkout's success handler → verified on the server before anything is marked paid. */
paymentCallbackRouter.post('/:token/razorpay/verify', async (req, res) => {
  const payment = await paymentFromToken(req.params.token);
  const status = await confirmRazorpayCheckout(payment, req.body ?? {});
  res.json({ status });
});

paymentCallbackRouter.post('/:token/razorpay/failed', async (req, res) => {
  const payment = await paymentFromToken(req.params.token);
  const { reason } = parse(z.object({ reason: z.string().trim().max(300).default('Payment failed') }), req.body ?? {});
  await markPaymentFailed(payment.id, reason, GATEWAY);
  res.json({ status: await currentStatus(payment.id) });
});

paymentCallbackRouter.post('/:token/dismissed', async (req, res) => {
  const payment = await paymentFromToken(req.params.token);
  await markPaymentCancelled(payment.id, { role: 'customer' });
  res.json({ status: await currentStatus(payment.id) });
});

/** DEMO mode only: simulate an outcome. */
paymentCallbackRouter.post('/:token/demo', async (req, res) => {
  const payment = await paymentFromToken(req.params.token);
  const { outcome } = parse(z.object({ outcome: z.enum(['success', 'failure', 'cancel', 'pending']) }), req.body ?? {});
  await completeDemoPayment(payment, outcome);
  const status = await currentStatus(payment.id);
  res.json({ status: status === 'created' ? 'pending' : status });
});

// ---------------------------------------------------------------------------
// Webhooks. These need the RAW request body to check signatures, so this
// router is mounted before the JSON body parser (see app.ts).
// ---------------------------------------------------------------------------
export const webhookRouter = Router();
const rawBody = express.raw({ type: '*/*', limit: '1mb' });

/** Razorpay → payment.captured, payment.failed, order.paid, refund.processed, refund.failed */
webhookRouter.post('/razorpay', rawBody, async (req, res) => {
  const result = await handleRazorpayWebhook(
    Buffer.isBuffer(req.body) ? req.body : Buffer.from(''),
    req.get('x-razorpay-signature'),
    req.get('x-razorpay-event-id'),
  );
  res.json({ ok: true, result });
});

/** Meta → webhook verification handshake. */
webhookRouter.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const verifyToken = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && config.WHATSAPP_WEBHOOK_VERIFY_TOKEN && verifyToken === config.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    res.type('text/plain').send(String(challenge ?? ''));
    return;
  }
  res.sendStatus(403);
});

/** Meta → delivery receipts (sent / delivered / read / failed) for our WhatsApp messages. */
webhookRouter.post('/whatsapp', rawBody, async (req, res) => {
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  if (!verifyWhatsAppSignature(body, req.get('x-hub-signature-256'))) {
    res.status(401).json({ error: { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature.' } });
    return;
  }
  let payload: unknown = null;
  try {
    payload = JSON.parse(body.toString('utf8'));
  } catch {
    // ignore malformed bodies
  }
  const updated = await applyWhatsAppStatuses(payload);
  res.json({ ok: true, updated });
});
