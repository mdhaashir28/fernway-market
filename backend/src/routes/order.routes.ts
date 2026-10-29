// /api/orders — a customer's own orders (login required).
import { Router, type Request } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { idParam, parse } from '../lib/validation.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import {
  cancelOrder,
  createOrder,
  createOrderSchema,
  getOrderDetail,
  listOrders,
  reorderItems,
  runMaintenance,
  switchToPayOnDelivery,
} from '../services/order.service.js';
import { refreshOrderPayments, startPayment } from '../services/payment.service.js';

export const orderRouter = Router();
orderRouter.use(requireAuth);

/** The API's own address, used to build payment page links. */
export const publicBaseUrl = (req: Request) => config.PUBLIC_API_URL ?? `${req.protocol}://${req.get('host')}`;

const paymentBody = z.object({
  /**
   * Where the payment page sends the customer afterwards (the app, or the shop
   * website). When placing an order, "__ORDER_ID__" is replaced with the new
   * order's id, e.g. "fernway://order/__ORDER_ID__".
   */
  returnUrl: z.string().max(500).optional(),
});

orderRouter.post('/', async (req, res) => {
  const user = currentUser(req);
  const input = parse(createOrderSchema, req.body);
  const { returnUrl } = parse(paymentBody, req.body);
  const { orderId, created } = await createOrder(user.id, input);
  let order = await getOrderDetail(pool, orderId, { forCustomerId: user.id });
  // UPI: create the first payment attempt straight away.
  let payment: { checkoutUrl: string } | null = null;
  if (order.status === 'awaiting_payment') {
    try {
      const returnTo = returnUrl ? returnUrl.split('__ORDER_ID__').join(String(orderId)) : null;
      payment = await startPayment(orderId, user.id, returnTo, publicBaseUrl(req));
    } catch {
      // The order is saved; the app shows "Pay now" so the customer can try again.
    }
    order = await getOrderDetail(pool, orderId, { forCustomerId: user.id });
  }
  // 201 = new order; 200 = the same request was sent twice and we returned the original order.
  res.status(created ? 201 : 200).json({ order, created, payment });
});

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

orderRouter.get('/', async (req, res) => {
  const query = parse(listQuery, req.query);
  await runMaintenance();
  res.json(await listOrders(pool, { userId: currentUser(req).id, ...query }));
});

orderRouter.get('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  await runMaintenance();
  res.json({ order: await getOrderDetail(pool, id, { forCustomerId: currentUser(req).id }) });
});

/** Pay (again) for a UPI order that is waiting for payment. */
orderRouter.post('/:id/payments', async (req, res) => {
  const user = currentUser(req);
  const { id } = parse(idParam, req.params);
  const { returnUrl } = parse(paymentBody, req.body ?? {});
  const payment = await startPayment(id, user.id, returnUrl ?? null, publicBaseUrl(req));
  res.status(201).json({ payment, order: await getOrderDetail(pool, id, { forCustomerId: user.id }) });
});

/** "Check payment status": asks the payment gateway what happened. */
orderRouter.post('/:id/payments/refresh', async (req, res) => {
  const user = currentUser(req);
  const { id } = parse(idParam, req.params);
  await getOrderDetail(pool, id, { forCustomerId: user.id }); // 404 for other people's orders
  await refreshOrderPayments(id);
  await runMaintenance({ force: true });
  res.json({ order: await getOrderDetail(pool, id, { forCustomerId: user.id }) });
});

/** Give up on UPI and pay when the order is delivered or collected. */
orderRouter.post('/:id/pay-on-delivery', async (req, res) => {
  const user = currentUser(req);
  const { id } = parse(idParam, req.params);
  await switchToPayOnDelivery(id, user.id);
  res.json({ order: await getOrderDetail(pool, id, { forCustomerId: user.id }) });
});

const cancelBody = z.object({
  reason: z.string().trim().max(300).optional(),
});

orderRouter.post('/:id/cancel', async (req, res) => {
  const user = currentUser(req);
  const { id } = parse(idParam, req.params);
  const { reason } = parse(cancelBody, req.body ?? {});
  await cancelOrder(id, { id: user.id, role: 'customer' }, reason || 'Cancelled by customer');
  res.json({ order: await getOrderDetail(pool, id, { forCustomerId: user.id }) });
});

/** "Order again": the past order's products with today's stock. */
orderRouter.get('/:id/reorder', async (req, res) => {
  const { id } = parse(idParam, req.params);
  res.json({ items: await reorderItems(pool, id, currentUser(req).id) });
});
