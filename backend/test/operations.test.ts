// End-to-end tests for payments, notifications, substitutions, audit history,
// roles, store settings, shopping lists, offers, loyalty points and support.
// Razorpay and WhatsApp are replaced by small fakes, so the server-side
// verification logic is tested without real credentials or real money.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { api, baseUrl, firstAvailableSlotId, login, loginCustomer, loginStaff, productIdBySku, sql, startTestServer, stockOf, stopTestServer } from './setup.js';

after(stopTestServer);

let manager: string;
let customer: string;
let addressId: number;
const ids: Record<string, number> = {};

before(async () => {
  await startTestServer();
  manager = await loginStaff();
  customer = await loginCustomer();
  addressId = (await api('GET', '/api/addresses', { token: customer })).body.items[0].id;
  for (const sku of ['RD-001', 'RD-002', 'RD-004', 'RD-009', 'SP-005', 'SP-007', 'SP-009', 'FV-008', 'DE-001']) {
    ids[sku] = await productIdBySku(sku, manager);
  }
});

interface PlaceOptions {
  items: { productId: number; quantity: number; substitution?: { preference: string; productId?: number } }[];
  paymentMethod?: 'upi' | 'pay_on_fulfillment';
  pickup?: boolean;
  whatsappUpdates?: boolean;
  useLoyaltyPoints?: boolean;
  token?: string;
}

async function placeOrder(options: PlaceOptions) {
  const fulfillment = options.pickup ? { type: 'pickup', pickupSlotId: await firstAvailableSlotId() } : { type: 'delivery', addressId };
  const res = await api('POST', '/api/orders', {
    token: options.token ?? customer,
    body: {
      items: options.items,
      fulfillment,
      paymentMethod: options.paymentMethod ?? 'pay_on_fulfillment',
      whatsappUpdates: options.whatsappUpdates ?? false,
      useLoyaltyPoints: options.useLoyaltyPoints ?? false,
      returnUrl: 'http://localhost:8081/order/1',
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body as { order: any; payment: { checkoutUrl: string; paymentId: number } | null };
}

const tokenOf = (checkoutUrl: string) => checkoutUrl.split('/pay/')[1];
const getOrder = async (id: number, token = customer) => (await api('GET', `/api/orders/${id}`, { token })).body.order;
const staffOrder = async (id: number) => (await api('GET', `/api/staff/orders/${id}`, { token: manager })).body.order;
const notifications = async (token = customer) => (await api('GET', '/api/notifications', { token })).body;
const demoPay = (checkoutUrl: string, outcome: string) => api('POST', `/api/payments/${tokenOf(checkoutUrl)}/demo`, { body: { outcome } });
const setStatus = (orderId: number, status: string) => api('PATCH', `/api/staff/orders/${orderId}/status`, { token: manager, body: { status } });

async function withConfig<T>(changes: Record<string, unknown>, run: () => Promise<T>): Promise<T> {
  const { config } = await import('../src/config.js');
  const target = config as unknown as Record<string, unknown>;
  const saved = Object.fromEntries(Object.keys(changes).map((k) => [k, target[k]]));
  Object.assign(target, changes);
  try {
    return await run();
  } finally {
    Object.assign(target, saved);
  }
}

/** Replaces calls to one external host with a fake; everything else goes to the real fetch. */
async function withFakeHost<T>(host: string, handler: (method: string, path: string, body: any) => { status: number; body: unknown }, run: () => Promise<T>) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(host)) return realFetch(input, init);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const result = handler(method, url.slice(host.length), body);
    return new Response(JSON.stringify(result.body), { status: result.status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ---------------------------------------------------------------------------
describe('roles', () => {
  it('lets managers add staff; staff run orders and stock but cannot change prices or settings', async () => {
    const created = await api('POST', '/api/staff/users', {
      token: manager,
      body: { name: 'Picker Priya', email: 'picker@test.local', password: 'picker-password-1', role: 'staff' },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const picker = await login('picker@test.local', 'picker-password-1');

    assert.equal((await api('GET', '/api/staff/orders', { token: picker })).status, 200);
    assert.equal((await api('GET', '/api/staff/settings', { token: picker })).status, 200, 'staff can view settings');
    const stock = await api('POST', `/api/staff/products/${ids['FV-008']}/stock`, { token: picker, body: { adjustBy: 5, reason: 'delivery_received' } });
    assert.equal(stock.status, 200);

    assert.equal((await api('PATCH', `/api/staff/products/${ids['FV-008']}`, { token: picker, body: { priceCents: 1 } })).status, 403);
    assert.equal((await api('POST', '/api/staff/products', { token: picker, body: { name: 'X', categoryId: 1, priceCents: 100 } })).status, 403);
    assert.equal((await api('PUT', '/api/staff/settings', { token: picker, body: { loyaltyEnabled: true } })).status, 403);
    assert.equal((await api('GET', '/api/staff/users', { token: picker })).status, 403);
    assert.equal((await api('GET', '/api/staff/summary', { token: customer })).status, 403);

    const me = (await api('GET', '/api/auth/me', { token: manager })).body.user;
    const selfDemote = await api('PATCH', `/api/staff/users/${me.id}`, { token: manager, body: { role: 'staff' } });
    assert.equal(selfDemote.status, 400, "managers can't lock themselves out");
  });
});

// ---------------------------------------------------------------------------
describe('UPI payments (demo mode)', () => {
  it('holds stock for an unpaid UPI order and confirms it only after a successful payment', async () => {
    const stockBefore = await stockOf(ids['RD-001'], manager);
    const { order, payment } = await placeOrder({ items: [{ productId: ids['RD-001'], quantity: 2 }], paymentMethod: 'upi', whatsappUpdates: true });
    assert.equal(order.status, 'awaiting_payment');
    assert.equal(order.paymentStatus, 'pending');
    assert.ok(payment?.checkoutUrl.includes('/pay/'));
    assert.equal(await stockOf(ids['RD-001'], manager), stockBefore - 2, 'stock is held while waiting');

    const page = await fetch(payment!.checkoutUrl);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /DEMO PAYMENT/);
    assert.match(page.headers.get('content-security-policy') ?? '', /script-src 'nonce-/);

    const failed = await demoPay(payment!.checkoutUrl, 'failure');
    assert.equal(failed.body.status, 'failed');
    let current = await getOrder(order.id);
    assert.equal(current.status, 'awaiting_payment', 'a failed payment leaves the order waiting');
    assert.equal(current.paymentStatus, 'failed');
    assert.equal(current.payment.latestAttempt.status, 'failed');
    assert.ok((await notifications()).items.some((n: { event: string; orderId: number }) => n.event === 'payment_failed' && n.orderId === order.id));

    const retry = await api('POST', `/api/orders/${order.id}/payments`, { token: customer, body: { returnUrl: 'http://localhost:8081/order/1' } });
    assert.equal(retry.status, 201);
    const paid = await demoPay(retry.body.payment.checkoutUrl, 'success');
    assert.equal(paid.body.status, 'paid');
    current = await getOrder(order.id);
    assert.equal(current.status, 'confirmed');
    assert.equal(current.paymentStatus, 'paid');
    assert.ok((await notifications()).items.some((n: { event: string; orderId: number }) => n.event === 'order_confirmed' && n.orderId === order.id));

    const whatsapp = await sql(`SELECT status, preview_text FROM whatsapp_messages WHERE order_id = $1 AND event = 'order_confirmed'`, [order.id]);
    assert.equal(whatsapp.length, 1);
    assert.equal(whatsapp[0].status, 'demo_recorded', 'demo mode only records WhatsApp messages');
    assert.match(whatsapp[0].preview_text, new RegExp(current.orderNumber));

    const again = await api('POST', `/api/orders/${order.id}/payments`, { token: customer, body: {} });
    assert.equal(again.status, 409, 'a paid order cannot be paid again');
  });

  it('lets the customer switch to pay on delivery when the payment is still pending', async () => {
    const { order, payment } = await placeOrder({ items: [{ productId: ids['FV-008'], quantity: 1 }], paymentMethod: 'upi', pickup: true });
    const pending = await demoPay(payment!.checkoutUrl, 'pending');
    assert.equal(pending.body.status, 'pending');
    assert.equal((await getOrder(order.id)).status, 'awaiting_payment');

    const switched = await api('POST', `/api/orders/${order.id}/pay-on-delivery`, { token: customer });
    assert.equal(switched.status, 200);
    assert.equal(switched.body.order.status, 'confirmed');
    assert.equal(switched.body.order.paymentMethod, 'pay_on_fulfillment');
  });

  it('cancels unpaid UPI orders when time runs out and puts the stock back', async () => {
    const stockBefore = await stockOf(ids['DE-001'], manager);
    const { order } = await placeOrder({ items: [{ productId: ids['DE-001'], quantity: 3 }], paymentMethod: 'upi' });
    assert.equal(await stockOf(ids['DE-001'], manager), stockBefore - 3);

    await sql(`UPDATE orders SET payment_due_by = now() - interval '1 minute' WHERE id = $1`, [order.id]);
    const { runMaintenance } = await import('../src/services/order.service.js');
    await runMaintenance({ force: true });

    const current = await getOrder(order.id);
    assert.equal(current.status, 'cancelled');
    assert.equal(current.cancelReason, 'Payment was not completed in time');
    assert.equal(await stockOf(ids['DE-001'], manager), stockBefore);
    const moves = await sql(`SELECT reason FROM inventory_movements WHERE order_id = $1 ORDER BY id`, [order.id]);
    assert.deepEqual(moves.map((m) => m.reason), ['order_placed', 'payment_expired']);
  });

  it('refunds a paid order when it is cancelled — and only a manager can cancel it on the store side', async () => {
    const { order, payment } = await placeOrder({ items: [{ productId: ids['RD-002'], quantity: 1 }], paymentMethod: 'upi' });
    await demoPay(payment!.checkoutUrl, 'success');

    const picker = await login('picker@test.local', 'picker-password-1');
    const byPicker = await api('POST', `/api/staff/orders/${order.id}/cancel`, { token: picker, body: { reason: 'Out of stock' } });
    assert.equal(byPicker.status, 403, 'refunds need a manager');

    const cancelled = await api('POST', `/api/orders/${order.id}/cancel`, { token: customer, body: {} });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.order.status, 'cancelled');
    assert.equal(cancelled.body.order.paymentStatus, 'refunded');
    assert.equal(cancelled.body.order.refunds.length, 1);
    assert.equal(cancelled.body.order.refunds[0].status, 'processed');
    assert.equal(cancelled.body.order.refunds[0].amountCents, cancelled.body.order.totalCents);
    assert.ok((await notifications()).items.some((n: { event: string; orderId: number }) => n.event === 'refund_processed' && n.orderId === order.id));
  });

  it('automatically refunds a payment that arrives after the order was cancelled', async () => {
    const { order, payment } = await placeOrder({ items: [{ productId: ids['SP-005'], quantity: 1 }], paymentMethod: 'upi' });
    await api('POST', `/api/orders/${order.id}/cancel`, { token: customer, body: {} });
    const late = await demoPay(payment!.checkoutUrl, 'success');
    assert.equal(late.status, 200);
    const current = await staffOrder(order.id);
    assert.equal(current.status, 'cancelled', 'the order stays cancelled');
    assert.equal(current.refunds.length, 1);
    assert.equal(current.refunds[0].status, 'processed');
    assert.equal(current.paymentStatus, 'refunded');
  });

  it('only sends customers back to our own apps after paying', async () => {
    const { safeReturnUrl } = await import('../src/services/payment.service.js');
    assert.equal(safeReturnUrl('https://evil.example.com/steal'), null);
    assert.equal(safeReturnUrl('javascript:alert(1)'), null);
    assert.equal(safeReturnUrl('fernway://order/12'), 'fernway://order/12');
    assert.equal(safeReturnUrl('http://localhost:8081/order/12'), 'http://localhost:8081/order/12');
  });

  it('fills in the new order number in the return address, and lists updates for one order', async () => {
    const res = await api('POST', '/api/orders', {
      token: customer,
      body: {
        items: [{ productId: ids['RD-002'], quantity: 1 }],
        fulfillment: { type: 'delivery', addressId },
        paymentMethod: 'upi',
        returnUrl: 'fernway://order/__ORDER_ID__',
      },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const { order, payment } = res.body;
    const saved = await sql(`SELECT return_url FROM payments WHERE order_id = $1`, [order.id]);
    assert.equal(saved[0].return_url, `fernway://order/${order.id}`);
    await demoPay(payment.checkoutUrl, 'success');

    const forOrder = (await api('GET', `/api/notifications?orderId=${order.id}`, { token: customer })).body.items;
    assert.ok(forOrder.length > 0);
    assert.ok(forOrder.every((n: { orderId: number }) => n.orderId === order.id));
  });
});

// ---------------------------------------------------------------------------
describe('Razorpay (server-side verification against a fake Razorpay)', () => {
  const KEY_SECRET = 'fake_key_secret_for_tests';
  const WEBHOOK_SECRET = 'fake_webhook_secret_for_tests';
  // TEST keys → Razorpay test mode (paymentsEnvironment is normally worked out once at startup).
  const razorpayConfig = {
    PAYMENTS_MODE: 'razorpay',
    paymentsEnvironment: 'test',
    RAZORPAY_KEY_ID: 'rzp_test_FAKEKEY',
    RAZORPAY_KEY_SECRET: KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
  };
  const fake = { orders: 0, payments: new Map<string, any>(), refunds: [] as any[] };
  const handler = (method: string, path: string, body: any) => {
    let m: RegExpMatchArray | null;
    if (method === 'POST' && path === '/v1/orders') return { status: 200, body: { id: `order_FAKE${++fake.orders}`, status: 'created' } };
    if (method === 'GET' && (m = path.match(/^\/v1\/payments\/([^/]+)$/))) {
      const p = fake.payments.get(m[1]);
      return p ? { status: 200, body: p } : { status: 400, body: { error: { description: 'The id provided does not exist' } } };
    }
    if ((m = path.match(/^\/v1\/orders\/([^/]+)\/payments$/))) return { status: 200, body: { items: [...fake.payments.values()].filter((p) => p.order_id === m![1]) } };
    if ((m = path.match(/^\/v1\/payments\/([^/]+)\/capture$/))) {
      const p = fake.payments.get(m[1]);
      p.status = 'captured';
      return { status: 200, body: p };
    }
    if ((m = path.match(/^\/v1\/payments\/([^/]+)\/refund$/))) {
      const refund = { id: `rfnd_FAKE${fake.refunds.length + 1}`, payment_id: m[1], amount: body.amount, status: 'pending' };
      fake.refunds.push(refund);
      return { status: 200, body: refund };
    }
    return { status: 404, body: { error: { description: 'unknown fake route' } } };
  };
  const inRazorpayMode = <T>(run: () => Promise<T>) => withConfig(razorpayConfig, () => withFakeHost('https://api.razorpay.com', handler, run));
  const sign = (text: string, secret: string) => crypto.createHmac('sha256', secret).update(text).digest('hex');

  it('marks an order paid only after checking the signature AND the payment with Razorpay', () =>
    inRazorpayMode(async () => {
      const { order, payment } = await placeOrder({ items: [{ productId: ids['RD-009'], quantity: 1 }], paymentMethod: 'upi' });
      const [row] = await sql(`SELECT provider, provider_order_id, test_mode FROM payments WHERE id = $1`, [payment!.paymentId]);
      assert.equal(row.provider, 'razorpay');
      assert.equal(row.test_mode, true, 'test-key payments are marked as test payments');
      assert.match(row.provider_order_id, /^order_FAKE/);
      assert.equal(order.payment.mode, 'test');

      // Test mode is labelled for customers (store info, payment page) and for staff (the order).
      const store = (await api('GET', '/api/store')).body;
      assert.equal(store.paymentsMode, 'test');
      assert.match(store.paymentMethods.find((m: { id: string }) => m.id === 'upi').label, /TEST mode/);
      assert.equal((await staffOrder(order.id)).payment.mode, 'test');

      const html = await (await fetch(payment!.checkoutUrl)).text();
      assert.match(html, /RAZORPAY TEST MODE/);
      assert.match(html, /success@razorpay/);
      assert.match(html, /checkout\.razorpay\.com\/v1\/checkout\.js/);
      assert.match(html, /rzp_test_FAKEKEY/, 'only the public key id is on the page');
      assert.doesNotMatch(html, new RegExp(KEY_SECRET), 'the secret never reaches the browser');

      const verify = (body: unknown) => api('POST', `/api/payments/${tokenOf(payment!.checkoutUrl)}/razorpay/verify`, { body });
      const forged = await verify({ razorpay_order_id: row.provider_order_id, razorpay_payment_id: 'pay_FAKE1', razorpay_signature: 'not-a-real-signature' });
      assert.equal(forged.status, 400);
      assert.equal(forged.body.error.code, 'INVALID_SIGNATURE');
      assert.equal((await getOrder(order.id)).status, 'awaiting_payment');

      // A correctly signed result for a payment Razorpay says is for a DIFFERENT amount is not accepted.
      fake.payments.set('pay_WRONGAMT', { id: 'pay_WRONGAMT', order_id: row.provider_order_id, status: 'captured', amount: 100, currency: 'INR' });
      const wrongAmount = await verify({
        razorpay_order_id: row.provider_order_id,
        razorpay_payment_id: 'pay_WRONGAMT',
        razorpay_signature: sign(`${row.provider_order_id}|pay_WRONGAMT`, KEY_SECRET),
      });
      assert.equal(wrongAmount.body.status, 'failed');
      assert.equal((await getOrder(order.id)).status, 'awaiting_payment');
      fake.payments.delete('pay_WRONGAMT');

      fake.payments.set('pay_FAKE1', { id: 'pay_FAKE1', order_id: row.provider_order_id, status: 'captured', amount: order.totalCents, currency: 'INR', method: 'upi' });
      const ok = await verify({
        razorpay_order_id: row.provider_order_id,
        razorpay_payment_id: 'pay_FAKE1',
        razorpay_signature: sign(`${row.provider_order_id}|pay_FAKE1`, KEY_SECRET),
      });
      assert.equal(ok.body.status, 'paid');
      const current = await getOrder(order.id);
      assert.equal(current.status, 'confirmed');
      assert.equal(current.paymentStatus, 'paid');
      const stored = await sql(`SELECT * FROM payments WHERE id = $1`, [payment!.paymentId]);
      assert.equal(stored[0].provider_payment_id, 'pay_FAKE1', 'only references are stored');
      assert.deepEqual(
        Object.keys(stored[0]).filter((k) => /vpa|upi_id|card|bank|pin/i.test(k)),
        [],
        'no UPI ids, card or bank details are stored',
      );
    }));

  it('handles signed webhooks once, rejects unsigned ones, and tracks refunds to completion', () =>
    inRazorpayMode(async () => {
      const { order, payment } = await placeOrder({ items: [{ productId: ids['RD-009'], quantity: 1 }], paymentMethod: 'upi' });
      const [row] = await sql(`SELECT provider_order_id FROM payments WHERE id = $1`, [payment!.paymentId]);
      const entity = { id: 'pay_FAKE2', order_id: row.provider_order_id, status: 'captured', amount: order.totalCents, currency: 'INR' };
      fake.payments.set('pay_FAKE2', entity);

      const send = (event: unknown, eventId: string, signature?: string) => {
        const raw = JSON.stringify(event);
        return api('POST', '/api/webhooks/razorpay', {
          raw,
          headers: { 'Content-Type': 'application/json', 'x-razorpay-event-id': eventId, 'x-razorpay-signature': signature ?? sign(raw, WEBHOOK_SECRET) },
        });
      };
      const captured = { event: 'payment.captured', payload: { payment: { entity } } };
      assert.equal((await send(captured, 'evt_1', 'bad-signature')).status, 400, 'unsigned webhooks are rejected');
      assert.equal((await getOrder(order.id)).status, 'awaiting_payment');

      const first = await send(captured, 'evt_1');
      assert.equal(first.status, 200);
      assert.equal((await getOrder(order.id)).status, 'confirmed', 'paid even though the app never reported back');
      const duplicate = await send(captured, 'evt_1');
      assert.equal(duplicate.body.result, 'duplicate', 'each webhook event is processed once');

      const cancelled = await api('POST', `/api/staff/orders/${order.id}/cancel`, { token: manager, body: { reason: 'Customer asked to cancel' } });
      assert.equal(cancelled.body.order.paymentStatus, 'refund_pending', 'Razorpay is still processing the refund');
      const refund = fake.refunds.at(-1);
      assert.equal(refund.amount, order.totalCents);

      const processed = { event: 'refund.processed', payload: { refund: { entity: { id: refund.id, payment_id: 'pay_FAKE2', amount: refund.amount } } } };
      assert.equal((await send(processed, 'evt_2')).status, 200);
      const current = await staffOrder(order.id);
      assert.equal(current.paymentStatus, 'refunded');
      assert.equal(current.refunds[0].status, 'processed');
    }));
});

// ---------------------------------------------------------------------------
describe('order updates and WhatsApp', () => {
  it('updates the customer at every step, in their language, and records WhatsApp messages in demo mode', async () => {
    await api('PATCH', '/api/auth/me', { token: customer, body: { preferredLanguage: 'ta' } });
    try {
      const { order } = await placeOrder({ items: [{ productId: ids['FV-008'], quantity: 1 }], pickup: true, whatsappUpdates: true });
      for (const status of ['preparing', 'ready_for_pickup', 'completed']) assert.equal((await setStatus(order.id, status)).status, 200);

      const updates = (await notifications()).items.filter((n: { orderId: number }) => n.orderId === order.id);
      assert.deepEqual(
        updates.map((n: { event: string }) => n.event).reverse(),
        ['order_confirmed', 'order_preparing', 'order_ready_for_pickup', 'order_completed'],
      );
      assert.equal(updates.at(-1).title, 'ஆர்டர் உறுதிசெய்யப்பட்டது', 'Tamil for a Tamil-speaking customer');

      const messages = await sql(`SELECT event, status, language, preview_text FROM whatsapp_messages WHERE order_id = $1 ORDER BY id`, [order.id]);
      assert.deepEqual(messages.map((m) => m.event), ['order_confirmed', 'order_preparing', 'order_ready_for_pickup', 'order_completed']);
      for (const m of messages) {
        assert.equal(m.status, 'demo_recorded');
        assert.equal(m.language, 'ta');
        assert.match(m.preview_text, /வணக்கம்/);
      }

      const log = await api('GET', '/api/staff/messages', { token: manager });
      assert.equal(log.body.mode, 'demo');
      assert.match(log.body.items[0].toPhone, /^••••\d{4}$/, 'staff only see the last 4 digits');

      await api('POST', '/api/notifications/read', { token: customer, body: {} });
      assert.equal((await notifications()).unreadCount, 0);
    } finally {
      await api('PATCH', '/api/auth/me', { token: customer, body: { preferredLanguage: 'en' } });
    }
  });

  it("doesn't use WhatsApp for orders where the customer didn't ask for it", async () => {
    const { order } = await placeOrder({ items: [{ productId: ids['FV-008'], quantity: 1 }], whatsappUpdates: false });
    assert.equal((await sql(`SELECT 1 FROM whatsapp_messages WHERE order_id = $1`, [order.id])).length, 0);
    assert.ok((await notifications()).items.some((n: { orderId: number }) => n.orderId === order.id), 'in-app updates still appear');
  });

  it('sends approved templates through the WhatsApp Cloud API and applies delivery receipts', async () => {
    const sent: any[] = [];
    await withConfig(
      {
        WHATSAPP_MODE: 'cloud_api',
        WHATSAPP_ACCESS_TOKEN: 'fake-access-token',
        WHATSAPP_PHONE_NUMBER_ID: '1234567890',
        WHATSAPP_APP_SECRET: 'fake-app-secret',
        WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'verify-me',
      },
      () =>
        withFakeHost(
          'https://graph.facebook.com',
          (_method, path, body) => {
            sent.push({ path, body });
            return { status: 200, body: { messaging_product: 'whatsapp', messages: [{ id: `wamid.FAKE${sent.length}` }] } };
          },
          async () => {
            const { order } = await placeOrder({ items: [{ productId: ids['FV-008'], quantity: 1 }], whatsappUpdates: true });
            const { flushWhatsAppQueue } = await import('../src/services/notification.service.js');
            await flushWhatsAppQueue();
            // The order also starts a send in the background; wait for whichever got there first.
            let message: { status: string; provider_message_id: string } | undefined;
            for (let i = 0; i < 40; i++) {
              [message] = await sql(`SELECT status, provider_message_id FROM whatsapp_messages WHERE order_id = $1`, [order.id]);
              if (message?.status !== 'queued') break;
              await new Promise((r) => setTimeout(r, 50));
            }
            assert.ok(message);
            assert.equal(message.status, 'sent');
            const request = sent.find((s) => s.body.template.name === 'order_confirmed');
            assert.equal(request.path, '/v26.0/1234567890/messages');
            assert.equal(request.body.to, '919876501234');
            assert.equal(request.body.template.language.code, 'en');
            assert.equal(request.body.template.components[0].parameters.length, 4);

            const challenge = await fetch(`${baseUrl()}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345`);
            assert.equal(await challenge.text(), '12345');
            const wrongToken = await fetch(`${baseUrl()}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1`);
            assert.equal(wrongToken.status, 403);

            const receipt = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: message.provider_message_id, status: 'delivered' }] } }] }] });
            const unsigned = await api('POST', '/api/webhooks/whatsapp', { raw: receipt, headers: { 'Content-Type': 'application/json' } });
            assert.equal(unsigned.status, 401);
            const signature = `sha256=${crypto.createHmac('sha256', 'fake-app-secret').update(receipt).digest('hex')}`;
            const signed = await api('POST', '/api/webhooks/whatsapp', { raw: receipt, headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signature } });
            assert.equal(signed.status, 200);
            const [after] = await sql(`SELECT status FROM whatsapp_messages WHERE order_id = $1`, [order.id]);
            assert.equal(after.status, 'delivered');
          },
        ),
    );
  });
});

// ---------------------------------------------------------------------------
describe('substitutions and audit history', () => {
  it('removes or replaces unavailable items, charges correctly and records why stock changed', async () => {
    const { order } = await placeOrder({
      items: [
        { productId: ids['RD-001'], quantity: 2, substitution: { preference: 'specific', productId: ids['RD-004'] } },
        { productId: ids['SP-007'], quantity: 1, substitution: { preference: 'none' } },
        { productId: ids['SP-005'], quantity: 1, substitution: { preference: 'similar' } },
      ],
    });
    const detail = await staffOrder(order.id);
    const item = (productId: number) => detail.items.find((i: { productId: number }) => i.productId === productId);
    assert.equal(item(ids['RD-001']).substitutionPreference, 'specific');
    assert.equal(item(ids['RD-001']).preferredSubstituteId, ids['RD-004']);

    // Sambar powder can't be found: remove it and correct the shelf count.
    const removed = await api('POST', `/api/staff/orders/${order.id}/items/${item(ids['SP-007']).id}/resolve`, {
      token: manager,
      body: { type: 'unavailable', setStockToZero: true },
    });
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    assert.equal(removed.body.order.totalCents, order.totalCents - 7200);
    assert.equal(await stockOf(ids['SP-007'], manager), 0);

    // The customer's choice is respected: a different substitute needs their agreement first.
    const notTheirChoice = await api('POST', `/api/staff/orders/${order.id}/items/${item(ids['RD-001']).id}/resolve`, {
      token: manager,
      body: { type: 'substitute', productId: ids['RD-002'], quantity: 1 },
    });
    assert.equal(notTheirChoice.status, 409);
    assert.equal(notTheirChoice.body.error.code, 'CUSTOMER_CHOICE');

    // Toor dal is replaced with the customer's chosen moong dal (cheaper → charged at its own price).
    const rd004Before = await stockOf(ids['RD-004'], manager);
    const replaced = await api('POST', `/api/staff/orders/${order.id}/items/${item(ids['RD-001']).id}/resolve`, {
      token: manager,
      body: { type: 'substitute', productId: ids['RD-004'], quantity: 2 },
    });
    assert.equal(replaced.status, 200, JSON.stringify(replaced.body));
    const subLine = replaced.body.order.items.find((i: { productId: number }) => i.productId === ids['RD-001']);
    assert.equal(subLine.fulfilmentStatus, 'substituted');
    assert.equal(subLine.chargedCents, 12800 * 2);
    assert.equal(await stockOf(ids['RD-004'], manager), rd004Before - 2);

    const customerView = await getOrder(order.id);
    assert.ok(customerView.events.some((e: { type: string }) => e.type === 'item_substituted'));
    assert.ok(!customerView.events.some((e: { type: string }) => e.type === 'staff_note'));
    assert.ok((await notifications()).items.some((n: { event: string; orderId: number }) => n.event === 'order_updated' && n.orderId === order.id));

    const history = await api('GET', `/api/staff/products/${ids['RD-004']}/history`, { token: manager });
    assert.equal(history.body.items[0].reason, 'substitution');
    assert.equal(history.body.items[0].reasonLabel, 'Used as a substitute');
    assert.equal(history.body.items[0].orderNumber, customerView.orderNumber);

    // Cancelling puts back what was actually reserved: the substitute, not the missing item.
    await api('POST', `/api/staff/orders/${order.id}/cancel`, { token: manager, body: { reason: 'Customer changed their mind' } });
    assert.equal(await stockOf(ids['RD-004'], manager), rd004Before);
  });

  it('refunds the difference when a paid order gets cheaper', async () => {
    await api('POST', `/api/staff/products/${ids['SP-007']}/stock`, { token: manager, body: { quantity: 20 } });
    const { order, payment } = await placeOrder({
      items: [
        { productId: ids['SP-007'], quantity: 1 },
        { productId: ids['SP-009'], quantity: 1 },
      ],
      paymentMethod: 'upi',
    });
    await demoPay(payment!.checkoutUrl, 'success');
    const line = (await staffOrder(order.id)).items.find((i: { productId: number }) => i.productId === ids['SP-007']);
    const res = await api('POST', `/api/staff/orders/${order.id}/items/${line.id}/resolve`, { token: manager, body: { type: 'unavailable' } });
    assert.equal(res.body.order.paymentStatus, 'partially_refunded');
    assert.equal(res.body.order.refunds[0].amountCents, 7200);
    assert.equal(res.body.order.refunds[0].status, 'processed');
  });

  it('records who changed stock, why, and with what note', async () => {
    const picker = await login('picker@test.local', 'picker-password-1');
    await api('POST', `/api/staff/products/${ids['RD-009']}/stock`, {
      token: picker,
      body: { adjustBy: 10, reason: 'delivery_received', note: 'Invoice 42' },
    });
    const history = await api('GET', `/api/staff/products/${ids['RD-009']}/history`, { token: picker });
    const latest = history.body.items[0];
    assert.equal(latest.change, 10);
    assert.equal(latest.reason, 'delivery_received');
    assert.equal(latest.userName, 'Picker Priya');
    assert.equal(latest.note, 'Invoice 42');
    const all = await api('GET', `/api/staff/stock-history?productId=${ids['RD-009']}`, { token: picker });
    assert.ok(all.body.items.some((m: { reason: string }) => m.reason === 'sample_data'), 'the history starts with the sample stock');
  });
});

// ---------------------------------------------------------------------------
describe('store settings, lists, offers, loyalty and support', () => {
  it('uses the opening hours and closures for pickup slots', async () => {
    const { config } = await import('../src/config.js');
    const tz = config.STORE_TIMEZONE;
    const dayOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso));
    const hourOf = (iso: string) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date(iso)));
    const weekdayOf = (iso: string) => new Date(`${dayOf(iso)}T12:00:00Z`).getUTCDay();

    const hours = Array.from({ length: 7 }, (_, weekday) => ({ weekday, opensAt: '09:00', closesAt: '12:00', isClosed: weekday === 0 }));
    assert.equal((await api('PUT', '/api/staff/settings/hours', { token: manager, body: { openingHours: hours } })).status, 200);
    const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(Date.now() + 24 * 3600 * 1000));
    assert.equal((await api('POST', '/api/staff/settings/closures', { token: manager, body: { date: tomorrow, reason: 'Festival holiday' } })).status, 201);

    try {
      const slots = (await api('GET', '/api/pickup-slots')).body.items as { startsAt: string }[];
      assert.ok(slots.length > 0);
      for (const slot of slots) {
        assert.ok([9, 10, 11].includes(hourOf(slot.startsAt)), 'only within opening hours');
        assert.notEqual(weekdayOf(slot.startsAt), 0, 'closed on Sundays');
        assert.notEqual(dayOf(slot.startsAt), tomorrow, 'closed on the holiday');
      }
      const store = (await api('GET', '/api/store')).body;
      assert.equal(store.closures[0].reason, 'Festival holiday');
    } finally {
      await api('DELETE', `/api/staff/settings/closures/${tomorrow}`, { token: manager });
      const open = Array.from({ length: 7 }, (_, weekday) => ({ weekday, opensAt: '07:00', closesAt: '22:00', isClosed: false }));
      await api('PUT', '/api/staff/settings/hours', { token: manager, body: { openingHours: open } });
    }
  });

  it('saves shopping lists and re-orders past orders', async () => {
    const created = await api('POST', '/api/lists', {
      token: customer,
      body: { name: 'Monthly groceries', items: [{ productId: ids['RD-001'], quantity: 2 }] },
    });
    assert.equal(created.status, 201);
    const listId = created.body.list.id;
    await api('PUT', `/api/lists/${listId}/items/${ids['SP-007']}`, { token: customer, body: { quantity: 1 } });
    const list = (await api('GET', `/api/lists/${listId}`, { token: customer })).body.list;
    assert.deepEqual(list.items.map((i: { product: { id: number } }) => i.product.id).sort(), [ids['RD-001'], ids['SP-007']].sort());
    const other = await loginStaff();
    assert.equal((await api('GET', `/api/lists/${listId}`, { token: other })).status, 404, "other people's lists are private");

    const { order } = await placeOrder({ items: [{ productId: ids['FV-008'], quantity: 2 }] });
    const reorder = await api('GET', `/api/orders/${order.id}/reorder`, { token: customer });
    assert.deepEqual(reorder.body.items, [{ productId: ids['FV-008'], quantity: 2, requestedQuantity: 2, available: true }]);
  });

  it('applies bundle offers only when offers are switched on', async () => {
    const items = [
      { productId: ids['RD-001'], quantity: 1 },
      { productId: ids['SP-007'], quantity: 1 },
      { productId: ids['SP-009'], quantity: 1 },
    ];
    const quote = () => api('POST', '/api/checkout/quote', { token: customer, body: { items, fulfillment: { type: 'delivery', addressId } } });
    assert.equal((await quote()).body.discountCents, 0, 'offers start switched off');
    assert.equal((await api('GET', '/api/promotions')).body.enabled, false);

    await api('PUT', '/api/staff/settings', { token: manager, body: { promotionsEnabled: true } });
    try {
      const withOffer = (await quote()).body;
      assert.equal(withOffer.discountCents, 2000);
      assert.equal(withOffer.promotions[0].name, 'Sambar combo');
      assert.equal(withOffer.totalCents, withOffer.subtotalCents + withOffer.deliveryFeeCents - 2000);
      assert.equal((await api('GET', '/api/promotions')).body.items.length, 2);
    } finally {
      await api('PUT', '/api/staff/settings', { token: manager, body: { promotionsEnabled: false } });
    }
  });

  it('earns and spends loyalty points when switched on, and gives them back on cancellation', async () => {
    await api('PUT', '/api/staff/settings', {
      token: manager,
      body: { loyaltyEnabled: true, loyaltyPointsPer100: 2, loyaltyPointValueCents: 100, loyaltyMinRedeemPoints: 0, loyaltyMaxRedeemPercent: 50 },
    });
    try {
      const { order } = await placeOrder({ items: [{ productId: ids['RD-002'], quantity: 4 }] }); // ₹600
      for (const status of ['preparing', 'out_for_delivery', 'completed']) await setStatus(order.id, status);
      const earned = (await api('GET', '/api/loyalty', { token: customer })).body;
      assert.equal(earned.balance, Math.floor(order.totalCents / 10000) * 2);

      const quote = await api('POST', '/api/checkout/quote', {
        token: customer,
        body: { items: [{ productId: ids['FV-008'], quantity: 1 }], fulfillment: { type: 'delivery', addressId }, useLoyaltyPoints: true },
      });
      assert.ok(quote.body.loyalty.pointsUsed > 0);
      assert.ok(quote.body.loyalty.discountCents <= 3000 * 0.5, 'at most 50% of the goods');

      const { order: withPoints } = await placeOrder({ items: [{ productId: ids['FV-008'], quantity: 1 }], useLoyaltyPoints: true });
      assert.ok(withPoints.loyaltyDiscountCents > 0);
      const afterSpending = (await api('GET', '/api/loyalty', { token: customer })).body.balance;
      assert.equal(afterSpending, earned.balance - withPoints.loyaltyPointsRedeemed);
      await api('POST', `/api/orders/${withPoints.id}/cancel`, { token: customer, body: {} });
      assert.equal((await api('GET', '/api/loyalty', { token: customer })).body.balance, earned.balance, 'points come back');
    } finally {
      await api('PUT', '/api/staff/settings', { token: manager, body: { loyaltyEnabled: false } });
    }
  });

  it('lets customers report a problem and see the store’s reply', async () => {
    const { order } = await placeOrder({ items: [{ productId: ids['FV-008'], quantity: 1 }] });
    const report = await api('POST', '/api/support', {
      token: customer,
      body: { orderId: order.id, topic: 'damaged_item', message: 'One lemon was squashed.' },
    });
    assert.equal(report.status, 201);
    const open = await api('GET', '/api/staff/support', { token: manager });
    const request = open.body.items.find((r: { id: number }) => r.id === report.body.request.id);
    assert.equal(request.orderNumber, (await getOrder(order.id)).orderNumber);

    await api('PATCH', `/api/staff/support/${request.id}`, { token: manager, body: { reply: 'Sorry! We will refund ₹7.50.', status: 'resolved' } });
    const mine = (await api('GET', '/api/support', { token: customer })).body.items[0];
    assert.equal(mine.status, 'resolved');
    assert.equal(mine.staffReply, 'Sorry! We will refund ₹7.50.');
    assert.ok((await notifications()).items.some((n: { event: string }) => n.event === 'support_reply'));
  });

  it('finds products by their Tamil names and has a real photo for every category', async () => {
    const results = (await api('GET', `/api/products?search=${encodeURIComponent('துவரம்')}`)).body.items;
    assert.ok(results.some((p: { id: number }) => p.id === ids['RD-001']));

    const categories = (await api('GET', '/api/categories')).body.items as { slug: string; imageUrl: string; nameTa: string | null }[];
    for (const category of categories) {
      assert.match(category.imageUrl ?? '', /^\/sample-images\/categories\/[a-z-]+\.jpg$/, `${category.slug} has a photo`);
      assert.ok(category.nameTa, `${category.slug} has a Tamil name`);
    }
    const photo = await fetch(`${baseUrl()}${categories[0].imageUrl}`);
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get('content-type'), 'image/jpeg');
  });
});
