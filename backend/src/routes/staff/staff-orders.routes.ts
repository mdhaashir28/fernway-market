// /api/staff/orders — view, filter and progress orders; substitutions, notes and refunds.
import { Router, type Request } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { idParam, optionalText, parse } from '../../lib/validation.js';
import { currentUser, requireManager } from '../../middleware/auth.js';
import { addOrderEvent, type Actor } from '../../services/audit.service.js';
import {
  ORDER_STATUSES,
  cancelOrder,
  changeOrderStatus,
  getOrderDetail,
  listOrders,
  resolveOrderItem,
  runMaintenance,
} from '../../services/order.service.js';
import { refreshOrderPayments, retryRefund } from '../../services/payment.service.js';

export const staffOrdersRouter = Router();

const actorOf = (req: Request): Actor => {
  const user = currentUser(req);
  return { id: user.id, role: user.role === 'manager' ? 'manager' : 'staff' };
};
const detail = (req: Request, id: number) => getOrderDetail(pool, id, { viewerRole: currentUser(req).role === 'manager' ? 'manager' : 'staff' });

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
  await runMaintenance();
  res.json(await listOrders(pool, { ...query, search: query.search || undefined }));
});

staffOrdersRouter.get('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  res.json({ order: await detail(req, id) });
});

const statusBody = z.object({
  status: z.enum(ORDER_STATUSES, { error: 'Choose a valid status' }),
  note: optionalText(300),
});

staffOrdersRouter.patch('/:id/status', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const body = parse(statusBody, req.body);
  await changeOrderStatus(id, body.status, actorOf(req), body.note);
  res.json({ order: await detail(req, id) });
});

const cancelBody = z.object({
  reason: z
    .string({ error: 'Please give a reason for cancelling' })
    .trim()
    .min(3, 'Please give a reason for cancelling (at least 3 characters)')
    .max(300),
});

/** Staff can cancel unpaid orders; orders paid online (which need a refund) need a manager. */
staffOrdersRouter.post('/:id/cancel', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { reason } = parse(cancelBody, req.body ?? {});
  await cancelOrder(id, actorOf(req), reason);
  res.json({ order: await detail(req, id) });
});

const resolveBody = z.discriminatedUnion('type', [
  z.object({ type: z.literal('unavailable'), setStockToZero: z.boolean().optional() }),
  z.object({
    type: z.literal('substitute'),
    productId: z.number({ error: 'Choose the substitute product' }).int().positive(),
    quantity: z.number().int().min(1).max(50),
    setStockToZero: z.boolean().optional(),
    customerAgreed: z.boolean().optional(),
  }),
]);

/** An item can't be found on the shelf: remove it, or replace it with another product. */
staffOrdersRouter.post('/:id/items/:itemId/resolve', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { itemId } = parse(z.object({ itemId: z.coerce.number().int().positive() }), req.params);
  const body = parse(resolveBody, req.body);
  await resolveOrderItem(id, itemId, body, actorOf(req));
  res.json({ order: await detail(req, id) });
});

/** A note on the order's history (only staff see it). */
staffOrdersRouter.post('/:id/notes', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { note } = parse(z.object({ note: z.string().trim().min(1, 'Write a note first').max(500) }), req.body ?? {});
  await detail(req, id); // 404 if it doesn't exist
  await addOrderEvent(pool, id, actorOf(req), { type: 'staff_note', message: note });
  res.json({ order: await detail(req, id) });
});

/** Ask the payment gateway again about a UPI order's payment. */
staffOrdersRouter.post('/:id/payments/refresh', async (req, res) => {
  const { id } = parse(idParam, req.params);
  await refreshOrderPayments(id);
  res.json({ order: await detail(req, id) });
});

/** Managers: try a failed refund again. */
staffOrdersRouter.post('/:id/refunds/:refundId/retry', requireManager, async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { refundId } = parse(z.object({ refundId: z.coerce.number().int().positive() }), req.params);
  await retryRefund(refundId, actorOf(req));
  res.json({ order: await detail(req, id) });
});
