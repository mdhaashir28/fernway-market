// /api/staff — store administration.
//   /users            staff accounts                (managers)
//   /settings         hours, closures, pickup slots, substitutions, loyalty, offers
//                     (everyone can view; managers change)
//   /promotions       bundle offers                 (everyone can view; managers change)
//   /support          customer help requests        (staff and managers)
//   /messages         WhatsApp message log / demo previews (staff and managers)
//   /stock-history    every stock change, all products     (staff and managers)
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { pool, withTransaction } from '../../db/pool.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { orderNumber } from '../../lib/order-number.js';
import { idParam, optionalText, parse } from '../../lib/validation.js';
import { currentUser, requireManager } from '../../middleware/auth.js';
import { addOrderEvent, STOCK_REASON_LABELS } from '../../services/audit.service.js';
import { flushWhatsAppQueue, notifyCustomer } from '../../services/notification.service.js';
import { listPromotions } from '../../services/offers.service.js';
import { refreshPickupSlots } from '../../services/pickup.service.js';
import {
  addClosure,
  getOpeningHours,
  getStoreSettings,
  listClosures,
  removeClosure,
  setOpeningHours,
  updateStoreSettings,
} from '../../services/settings.service.js';

export const staffAdminRouter = Router();

// ---------------------------------------------------------------------------
// Staff accounts (managers only)
// ---------------------------------------------------------------------------
const USER_COLUMNS = `id, name, email, phone, role, is_active AS "isActive", created_at AS "createdAt"`;

staffAdminRouter.get('/users', requireManager, async (_req, res) => {
  const { rows } = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE role IN ('staff', 'manager') ORDER BY role DESC, name`);
  res.json({ items: rows });
});

const createUserSchema = z.object({
  name: z.string({ error: 'Name is required' }).trim().min(1, 'Name is required').max(100),
  email: z.string({ error: 'Email is required' }).trim().toLowerCase().pipe(z.email('Please enter a valid email address')),
  password: z.string({ error: 'Choose a password' }).min(10, 'Use at least 10 characters').max(128),
  role: z.enum(['staff', 'manager']),
  phone: optionalText(30),
});

staffAdminRouter.post('/users', requireManager, async (req, res) => {
  const body = parse(createUserSchema, req.body);
  const exists = await pool.query('SELECT 1 FROM users WHERE lower(email) = $1', [body.email]);
  if (exists.rowCount) throw conflict('EMAIL_TAKEN', 'An account with this email already exists.');
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, phone, role) VALUES ($1, $2, $3, $4, $5) RETURNING ${USER_COLUMNS}`,
    [body.email, await bcrypt.hash(body.password, 10), body.name, body.phone ?? null, body.role],
  );
  res.status(201).json({ user: rows[0] });
});

const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(['staff', 'manager']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(10, 'Use at least 10 characters').max(128).optional(),
});

staffAdminRouter.patch('/users/:id', requireManager, async (req, res) => {
  const { id } = parse(idParam, req.params);
  const body = parse(updateUserSchema, req.body);
  const me = currentUser(req);
  if (id === me.id && (body.isActive === false || body.role === 'staff')) {
    throw badRequest("You can't deactivate or demote your own account — ask another manager.");
  }
  const { rows } = await pool.query(
    `UPDATE users SET
       name = COALESCE($2, name),
       role = COALESCE($3::user_role, role),
       is_active = COALESCE($4, is_active),
       password_hash = COALESCE($5, password_hash)
     WHERE id = $1 AND role IN ('staff', 'manager')
     RETURNING ${USER_COLUMNS}`,
    [id, body.name ?? null, body.role ?? null, body.isActive ?? null, body.password ? await bcrypt.hash(body.password, 10) : null],
  );
  if (!rows[0]) throw notFound('Staff account');
  res.json({ user: rows[0] });
});

// ---------------------------------------------------------------------------
// Store settings
// ---------------------------------------------------------------------------
async function settingsResponse() {
  const [settings, openingHours, closures] = await Promise.all([getStoreSettings(pool), getOpeningHours(pool), listClosures(pool)]);
  return { settings, openingHours, closures, timezone: config.STORE_TIMEZONE };
}

staffAdminRouter.get('/settings', async (_req, res) => {
  res.json(await settingsResponse());
});

const settingsSchema = z
  .object({
    pickupSlotMinutes: z.number().int().min(15).max(240),
    pickupSlotCapacity: z.number().int().min(1).max(500),
    pickupDaysAhead: z.number().int().min(0).max(14),
    pickupLeadTimeMinutes: z.number().int().min(0).max(1440),
    substitutionsEnabled: z.boolean(),
    loyaltyEnabled: z.boolean(),
    loyaltyPointsPer100: z.number().int().min(0).max(100),
    loyaltyPointValueCents: z.number().int().min(1).max(10000),
    loyaltyMinRedeemPoints: z.number().int().min(0).max(1_000_000),
    loyaltyMaxRedeemPercent: z.number().int().min(0).max(100),
    promotionsEnabled: z.boolean(),
  })
  .partial();

staffAdminRouter.put('/settings', requireManager, async (req, res) => {
  const body = parse(settingsSchema, req.body);
  await updateStoreSettings(pool, body, currentUser(req).id);
  if (body.pickupSlotMinutes !== undefined || body.pickupSlotCapacity !== undefined || body.pickupDaysAhead !== undefined) {
    await refreshPickupSlots(pool);
  }
  res.json(await settingsResponse());
});

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the 24-hour format HH:MM, e.g. 09:00');
const hoursSchema = z.object({
  openingHours: z
    .array(z.object({ weekday: z.number().int().min(0).max(6), opensAt: time, closesAt: time, isClosed: z.boolean() }))
    .length(7, 'Send all 7 days')
    .refine((days) => days.every((d) => d.isClosed || d.closesAt > d.opensAt), 'Closing time must be after opening time')
    .refine((days) => new Set(days.map((d) => d.weekday)).size === 7, 'Each day once'),
});

staffAdminRouter.put('/settings/hours', requireManager, async (req, res) => {
  const { openingHours } = parse(hoursSchema, req.body);
  await withTransaction(async (client) => {
    await setOpeningHours(client, openingHours);
    await refreshPickupSlots(client);
  });
  res.json(await settingsResponse());
});

const closureSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD'),
  reason: z.string({ error: 'Say why the store is closed' }).trim().min(2, 'Say why the store is closed').max(100),
});

staffAdminRouter.post('/settings/closures', requireManager, async (req, res) => {
  const body = parse(closureSchema, req.body);
  await withTransaction(async (client) => {
    await addClosure(client, body);
    await refreshPickupSlots(client);
  });
  res.status(201).json(await settingsResponse());
});

staffAdminRouter.delete('/settings/closures/:date', requireManager, async (req, res) => {
  const { date } = parse(closureSchema.pick({ date: true }), req.params);
  await withTransaction(async (client) => {
    if (!(await removeClosure(client, date))) throw notFound('Closure');
    await refreshPickupSlots(client);
  });
  res.json(await settingsResponse());
});

// ---------------------------------------------------------------------------
// Bundle offers
// ---------------------------------------------------------------------------
staffAdminRouter.get('/promotions', async (_req, res) => {
  const settings = await getStoreSettings(pool);
  res.json({ enabled: settings.promotionsEnabled, items: await listPromotions(pool, { runningOnly: false }) });
});

const promotionSchema = z.object({
  name: z.string({ error: 'Give the offer a name' }).trim().min(1, 'Give the offer a name').max(80),
  nameTa: optionalText(80),
  description: z.string().trim().max(300).default(''),
  discountCents: z.number({ error: 'Enter the saving' }).int().min(100, 'The saving must be at least ₹1').max(10_000_000),
  isActive: z.boolean().default(true),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  items: z
    .array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(50) }))
    .min(2, 'A bundle needs at least 2 products')
    .max(10)
    .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, 'Each product only once'),
});

async function savePromotion(id: number | null, body: z.output<typeof promotionSchema>) {
  return withTransaction(async (client) => {
    if (body.startsAt && body.endsAt && body.endsAt <= body.startsAt) throw badRequest('The end date must be after the start date.');
    const { rowCount: products } = await client.query('SELECT 1 FROM products WHERE id = ANY($1::int[])', [body.items.map((i) => i.productId)]);
    if (products !== body.items.length) throw badRequest('One of the products could not be found.');
    let promotionId = id;
    if (promotionId === null) {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO promotions (name, name_ta, description, discount_cents, is_active, starts_at, ends_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [body.name, body.nameTa ?? null, body.description, body.discountCents, body.isActive, body.startsAt ?? null, body.endsAt ?? null],
      );
      promotionId = rows[0].id;
    } else {
      const { rowCount } = await client.query(
        `UPDATE promotions SET name = $2, name_ta = $3, description = $4, discount_cents = $5, is_active = $6, starts_at = $7, ends_at = $8 WHERE id = $1`,
        [promotionId, body.name, body.nameTa ?? null, body.description, body.discountCents, body.isActive, body.startsAt ?? null, body.endsAt ?? null],
      );
      if (!rowCount) throw notFound('Offer');
      await client.query('DELETE FROM promotion_items WHERE promotion_id = $1', [promotionId]);
    }
    for (const item of body.items) {
      await client.query('INSERT INTO promotion_items (promotion_id, product_id, quantity) VALUES ($1, $2, $3)', [promotionId, item.productId, item.quantity]);
    }
    return promotionId;
  });
}

const promotionById = async (id: number) => (await listPromotions(pool, { runningOnly: false })).find((p) => p.id === id);

staffAdminRouter.post('/promotions', requireManager, async (req, res) => {
  const id = await savePromotion(null, parse(promotionSchema, req.body));
  res.status(201).json({ promotion: await promotionById(id) });
});

staffAdminRouter.put('/promotions/:id', requireManager, async (req, res) => {
  const { id } = parse(idParam, req.params);
  await savePromotion(id, parse(promotionSchema, req.body));
  res.json({ promotion: await promotionById(id) });
});

staffAdminRouter.delete('/promotions/:id', requireManager, async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { rowCount } = await pool.query('DELETE FROM promotions WHERE id = $1', [id]);
  if (!rowCount) throw notFound('Offer');
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Customer help requests
// ---------------------------------------------------------------------------
staffAdminRouter.get('/support', async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['open', 'resolved', 'all']).default('open') }), req.query);
  const { rows } = await pool.query<{ orderId: number | null }>(
    `SELECT s.id, s.order_id AS "orderId", s.topic, s.message, s.status, s.staff_reply AS "staffReply",
            s.created_at AS "createdAt", s.resolved_at AS "resolvedAt",
            u.name AS "customerName", u.email AS "customerEmail", u.phone AS "customerPhone", r.name AS "resolvedByName"
     FROM support_requests s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN users r ON r.id = s.resolved_by
     WHERE ($1 = 'all' OR s.status = $1)
     ORDER BY (s.status = 'open') DESC, s.created_at DESC
     LIMIT 100`,
    [status],
  );
  res.json({ items: rows.map((r) => ({ ...r, orderNumber: r.orderId ? orderNumber(r.orderId) : null })) });
});

const replySchema = z.object({
  reply: z.string().trim().max(1000).optional(),
  status: z.enum(['open', 'resolved']).optional(),
});

/** Reply to a customer (they see it in the app) and/or mark the request resolved. */
staffAdminRouter.patch('/support/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const body = parse(replySchema, req.body);
  const user = currentUser(req);
  await withTransaction(async (client) => {
    const { rows } = await client.query<{ userId: number; orderId: number | null }>(
      'SELECT user_id AS "userId", order_id AS "orderId" FROM support_requests WHERE id = $1 FOR UPDATE',
      [id],
    );
    const request = rows[0];
    if (!request) throw notFound('Help request');
    await client.query(
      `UPDATE support_requests SET
         staff_reply = COALESCE($2, staff_reply),
         status = COALESCE($3, status),
         resolved_by = CASE WHEN $3 = 'resolved' THEN $4 WHEN $3 = 'open' THEN NULL ELSE resolved_by END,
         resolved_at = CASE WHEN $3 = 'resolved' THEN now() WHEN $3 = 'open' THEN NULL ELSE resolved_at END
       WHERE id = $1`,
      [id, body.reply || null, body.status ?? null, user.id],
    );
    if (body.reply) {
      await notifyCustomer(client, { userId: request.userId, orderId: request.orderId, event: 'support_reply', vars: { reply: body.reply } });
      if (request.orderId) {
        await addOrderEvent(client, request.orderId, { id: user.id, role: user.role === 'manager' ? 'manager' : 'staff' }, {
          type: 'support_reply',
          message: `Store replied to the customer: ${body.reply}`,
          visibleToCustomer: true,
        });
      }
    }
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// WhatsApp message log (in DEMO mode: the previews of what would be sent)
// ---------------------------------------------------------------------------
staffAdminRouter.get('/messages', async (req, res) => {
  const { page, pageSize, status } = parse(
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(30),
      status: z.enum(['demo_recorded', 'queued', 'sent', 'delivered', 'read', 'failed', 'skipped']).optional(),
    }),
    req.query,
  );
  const { rows } = await pool.query<{ orderId: number | null; toPhone: string | null; totalCount: number }>(
    `SELECT m.id, m.order_id AS "orderId", m.event, m.to_phone AS "toPhone", m.language, m.template_name AS "templateName",
            m.preview_text AS "previewText", m.mode, m.status, m.skip_reason AS "skipReason", m.error, m.attempts,
            m.created_at AS "createdAt", m.updated_at AS "updatedAt", u.name AS "customerName", count(*) OVER () AS "totalCount"
     FROM whatsapp_messages m LEFT JOIN users u ON u.id = m.user_id
     WHERE ($1::text IS NULL OR m.status = $1)
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT $2 OFFSET $3`,
    [status ?? null, pageSize, (page - 1) * pageSize],
  );
  res.json({
    mode: config.WHATSAPP_MODE,
    items: rows.map(({ totalCount: _t, ...m }) => ({
      ...m,
      orderNumber: m.orderId ? orderNumber(m.orderId) : null,
      // Show only the end of the number to staff.
      toPhone: m.toPhone ? `••••${m.toPhone.slice(-4)}` : null,
    })),
    total: rows[0]?.totalCount ?? 0,
    page,
    pageSize,
  });
});

/** Managers: send a failed WhatsApp message again (Cloud API mode). */
staffAdminRouter.post('/messages/:id/retry', requireManager, async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { rowCount } = await pool.query(
    `UPDATE whatsapp_messages SET status = 'queued', attempts = 0, error = NULL WHERE id = $1 AND status = 'failed' AND mode = 'cloud_api'`,
    [id],
  );
  if (!rowCount) throw conflict('CANNOT_RETRY', 'Only failed messages sent through the WhatsApp Cloud API can be retried.');
  await flushWhatsAppQueue();
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Stock history (all products)
// ---------------------------------------------------------------------------
staffAdminRouter.get('/stock-history', async (req, res) => {
  const query = parse(
    z.object({
      productId: z.coerce.number().int().positive().optional(),
      reason: z.string().max(40).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    }),
    req.query,
  );
  const { rows } = await pool.query<{ reason: keyof typeof STOCK_REASON_LABELS; orderId: number | null; totalCount: number }>(
    `SELECT m.id, m.product_id AS "productId", p.name AS "productName", p.sku, m.change, m.quantity_after AS "quantityAfter",
            m.reason, m.order_id AS "orderId", m.note, u.name AS "userName", m.created_at AS "createdAt",
            count(*) OVER () AS "totalCount"
     FROM inventory_movements m
     JOIN products p ON p.id = m.product_id
     LEFT JOIN users u ON u.id = m.user_id
     WHERE ($1::int IS NULL OR m.product_id = $1) AND ($2::text IS NULL OR m.reason = $2)
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT $3 OFFSET $4`,
    [query.productId ?? null, query.reason ?? null, query.pageSize, (query.page - 1) * query.pageSize],
  );
  res.json({
    items: rows.map(({ totalCount: _t, ...m }) => ({
      ...m,
      reasonLabel: STOCK_REASON_LABELS[m.reason] ?? m.reason,
      orderNumber: m.orderId ? orderNumber(m.orderId) : null,
    })),
    total: rows[0]?.totalCount ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  });
});
