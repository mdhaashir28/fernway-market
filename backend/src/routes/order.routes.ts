// /api/orders — a customer's own orders (login required).
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { idParam, parse } from '../lib/validation.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { cancelOrder, createOrder, createOrderSchema, getOrderDetail, listOrders } from '../services/order.service.js';

export const orderRouter = Router();
orderRouter.use(requireAuth);

orderRouter.post('/', async (req, res) => {
  const user = currentUser(req);
  const input = parse(createOrderSchema, req.body);
  const { orderId, created } = await createOrder(user.id, input);
  const order = await getOrderDetail(pool, orderId, { forCustomerId: user.id });
  // 201 = new order; 200 = the same request was sent twice and we returned the original order.
  res.status(created ? 201 : 200).json({ order, created });
});

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

orderRouter.get('/', async (req, res) => {
  const query = parse(listQuery, req.query);
  res.json(await listOrders(pool, { userId: currentUser(req).id, ...query }));
});

orderRouter.get('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  res.json({ order: await getOrderDetail(pool, id, { forCustomerId: currentUser(req).id }) });
});

const cancelBody = z.object({
  reason: z.string().trim().max(300).optional(),
});

orderRouter.post('/:id/cancel', async (req, res) => {
  const user = currentUser(req);
  const { id } = parse(idParam, req.params);
  const { reason } = parse(cancelBody, req.body ?? {});
  await cancelOrder(id, user, reason || 'Cancelled by customer');
  res.json({ order: await getOrderDetail(pool, id, { forCustomerId: user.id }) });
});
