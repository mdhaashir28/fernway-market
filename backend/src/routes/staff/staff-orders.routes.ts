// /api/staff/orders — view, filter and progress orders.
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { idParam, optionalText, parse } from '../../lib/validation.js';
import { currentUser } from '../../middleware/auth.js';
import {
  ORDER_STATUSES,
  cancelOrder,
  changeOrderStatus,
  getOrderDetail,
  listOrders,
} from '../../services/order.service.js';

export const staffOrdersRouter = Router();

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');

const listQuery = z.object({
  status: z.enum([...ORDER_STATUSES, 'open']).optional(),
  fulfillmentType: z.enum(['delivery', 'pickup']).optional(),
  search: z.string().trim().max(100).optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

staffOrdersRouter.get('/', async (req, res) => {
  const query = parse(listQuery, req.query);
  res.json(await listOrders(pool, { ...query, search: query.search || undefined }));
});

staffOrdersRouter.get('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  res.json({ order: await getOrderDetail(pool, id) });
});

const statusBody = z.object({
  status: z.enum(ORDER_STATUSES, { error: 'Choose a valid status' }),
  note: optionalText(300),
});

staffOrdersRouter.patch('/:id/status', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const body = parse(statusBody, req.body);
  await changeOrderStatus(id, body.status, currentUser(req).id, body.note);
  res.json({ order: await getOrderDetail(pool, id) });
});

const cancelBody = z.object({
  reason: z
    .string({ error: 'Please give a reason for cancelling' })
    .trim()
    .min(3, 'Please give a reason for cancelling (at least 3 characters)')
    .max(300),
});

staffOrdersRouter.post('/:id/cancel', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { reason } = parse(cancelBody, req.body ?? {});
  await cancelOrder(id, currentUser(req), reason);
  res.json({ order: await getOrderDetail(pool, id) });
});
