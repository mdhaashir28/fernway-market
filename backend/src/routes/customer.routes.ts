// Customer features (login required unless noted):
//   /api/notifications  in-app order updates
//   /api/lists          saved shopping lists
//   /api/support        "Report a problem" / help requests
//   /api/loyalty        points balance and history (when loyalty is switched on)
//   /api/promotions     bundle offers (public; when offers are switched on)
import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db/pool.js';
import { conflict, notFound } from '../lib/errors.js';
import { idParam, parse } from '../lib/validation.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { addOrderEvent } from '../services/audit.service.js';
import { findProducts, toPublicProduct } from '../services/catalog.service.js';
import { getLoyaltyBalance, listPromotions } from '../services/offers.service.js';
import { getStoreSettings } from '../services/settings.service.js';

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export const notificationRouter = Router();
notificationRouter.use(requireAuth);

notificationRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const { limit, orderId } = parse(
    z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), orderId: z.coerce.number().int().positive().optional() }),
    req.query,
  );
  const [items, unread] = await Promise.all([
    pool.query(
      `SELECT n.id, n.order_id AS "orderId", n.event, n.title, n.body, n.created_at AS "createdAt", n.read_at AS "readAt"
       FROM notifications n WHERE n.user_id = $1 AND ($3::int IS NULL OR n.order_id = $3)
       ORDER BY n.created_at DESC, n.id DESC LIMIT $2`,
      [user.id, limit, orderId ?? null],
    ),
    pool.query<{ count: number }>('SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL', [user.id]),
  ]);
  res.json({ items: items.rows, unreadCount: unread.rows[0].count });
});

/** Mark updates as read: { "ids": [1, 2] }, or {} for all of them. */
notificationRouter.post('/read', async (req, res) => {
  const user = currentUser(req);
  const { ids } = parse(z.object({ ids: z.array(z.number().int().positive()).max(200).optional() }), req.body ?? {});
  await pool.query(
    `UPDATE notifications SET read_at = now()
     WHERE user_id = $1 AND read_at IS NULL AND ($2::int[] IS NULL OR id = ANY($2::int[]))`,
    [user.id, ids ?? null],
  );
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Shopping lists
// ---------------------------------------------------------------------------
export const listRouter = Router();
listRouter.use(requireAuth);

const MAX_LISTS = 20;
const MAX_LIST_ITEMS = 100;

const listItemSchema = z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(50) });
const createListSchema = z.object({
  name: z.string({ error: 'Please give the list a name' }).trim().min(1, 'Please give the list a name').max(60),
  items: z.array(listItemSchema).max(MAX_LIST_ITEMS).optional(),
});

async function ownList(listId: number, userId: number) {
  const { rows } = await pool.query<{ id: number; name: string }>('SELECT id, name FROM shopping_lists WHERE id = $1 AND user_id = $2', [listId, userId]);
  if (!rows[0]) throw notFound('Shopping list');
  return rows[0];
}

async function listDetail(listId: number, userId: number) {
  const list = await ownList(listId, userId);
  const { rows: entries } = await pool.query<{ productId: number; quantity: number }>(
    'SELECT product_id AS "productId", quantity FROM shopping_list_items WHERE list_id = $1 ORDER BY added_at, product_id',
    [listId],
  );
  const ids = entries.map((e) => e.productId);
  const products = ids.length ? (await findProducts(pool, { ids, status: 'all', page: 1, pageSize: MAX_LIST_ITEMS })).rows : [];
  const byId = new Map(products.map((p) => [p.id, p]));
  return {
    id: list.id,
    name: list.name,
    items: entries
      .filter((e) => byId.has(e.productId))
      .map((e) => {
        const row = byId.get(e.productId)!;
        const product = toPublicProduct(row);
        const sellable = row.isActive && row.categoryIsActive;
        return {
          quantity: e.quantity,
          product: sellable ? product : { ...product, availableQuantity: 0, stockStatus: 'out_of_stock' as const },
          available: sellable && row.stockQuantity > 0,
        };
      }),
  };
}

listRouter.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT l.id, l.name, l.updated_at AS "updatedAt",
            (SELECT count(*)::int FROM shopping_list_items i WHERE i.list_id = l.id) AS "itemCount"
     FROM shopping_lists l WHERE l.user_id = $1 ORDER BY l.updated_at DESC`,
    [currentUser(req).id],
  );
  res.json({ items: rows });
});

listRouter.post('/', async (req, res) => {
  const user = currentUser(req);
  const body = parse(createListSchema, req.body);
  const listId = await withTransaction(async (client) => {
    const { rows: count } = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM shopping_lists WHERE user_id = $1', [user.id]);
    if (count[0].count >= MAX_LISTS) throw conflict('TOO_MANY_LISTS', `You can keep up to ${MAX_LISTS} lists. Delete one to make room.`);
    const { rows } = await client.query<{ id: number }>('INSERT INTO shopping_lists (user_id, name) VALUES ($1, $2) RETURNING id', [user.id, body.name]);
    for (const item of body.items ?? []) {
      await client.query(
        `INSERT INTO shopping_list_items (list_id, product_id, quantity)
         SELECT $1, id, $3 FROM products WHERE id = $2
         ON CONFLICT (list_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
        [rows[0].id, item.productId, item.quantity],
      );
    }
    return rows[0].id;
  });
  res.status(201).json({ list: await listDetail(listId, user.id) });
});

listRouter.get('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  res.json({ list: await listDetail(id, currentUser(req).id) });
});

listRouter.patch('/:id', async (req, res) => {
  const user = currentUser(req);
  const { id } = parse(idParam, req.params);
  const { name } = parse(createListSchema.pick({ name: true }), req.body);
  await ownList(id, user.id);
  await pool.query('UPDATE shopping_lists SET name = $2 WHERE id = $1', [id, name]);
  res.json({ list: await listDetail(id, user.id) });
});

listRouter.delete('/:id', async (req, res) => {
  const user = currentUser(req);
  const { id } = parse(idParam, req.params);
  await ownList(id, user.id);
  await pool.query('DELETE FROM shopping_lists WHERE id = $1', [id]);
  res.status(204).end();
});

/** Add a product to a list, or change its quantity. */
listRouter.put('/:id/items/:productId', async (req, res) => {
  const user = currentUser(req);
  const { id } = parse(idParam, req.params);
  const { productId } = parse(z.object({ productId: z.coerce.number().int().positive() }), req.params);
  const { quantity } = parse(listItemSchema.pick({ quantity: true }), req.body);
  await ownList(id, user.id);
  const { rows: count } = await pool.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM shopping_list_items WHERE list_id = $1 AND product_id <> $2',
    [id, productId],
  );
  if (count[0].count >= MAX_LIST_ITEMS) throw conflict('LIST_FULL', `A list can hold up to ${MAX_LIST_ITEMS} products.`);
  const { rowCount } = await pool.query(
    `INSERT INTO shopping_list_items (list_id, product_id, quantity)
     SELECT $1, id, $3 FROM products WHERE id = $2
     ON CONFLICT (list_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
    [id, productId, quantity],
  );
  if (!rowCount) throw notFound('Product');
  await pool.query('UPDATE shopping_lists SET updated_at = now() WHERE id = $1', [id]);
  res.json({ list: await listDetail(id, user.id) });
});

listRouter.delete('/:id/items/:productId', async (req, res) => {
  const user = currentUser(req);
  const { id } = parse(idParam, req.params);
  const { productId } = parse(z.object({ productId: z.coerce.number().int().positive() }), req.params);
  await ownList(id, user.id);
  await pool.query('DELETE FROM shopping_list_items WHERE list_id = $1 AND product_id = $2', [id, productId]);
  await pool.query('UPDATE shopping_lists SET updated_at = now() WHERE id = $1', [id]);
  res.json({ list: await listDetail(id, user.id) });
});

// ---------------------------------------------------------------------------
// Support requests
// ---------------------------------------------------------------------------
export const supportRouter = Router();
supportRouter.use(requireAuth);

export const SUPPORT_TOPICS = ['missing_item', 'damaged_item', 'wrong_item', 'late', 'payment', 'refund', 'other'] as const;

const supportSchema = z.object({
  orderId: z.number().int().positive().optional(),
  topic: z.enum(SUPPORT_TOPICS, { error: 'Choose what the problem is about' }),
  message: z.string({ error: 'Please describe the problem' }).trim().min(5, 'Please describe the problem (at least 5 characters)').max(1000),
});

supportRouter.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, order_id AS "orderId", topic, message, status, staff_reply AS "staffReply",
            created_at AS "createdAt", resolved_at AS "resolvedAt"
     FROM support_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [currentUser(req).id],
  );
  res.json({ items: rows });
});

supportRouter.post('/', async (req, res) => {
  const user = currentUser(req);
  const body = parse(supportSchema, req.body);
  const request = await withTransaction(async (client) => {
    if (body.orderId) {
      const { rowCount } = await client.query('SELECT 1 FROM orders WHERE id = $1 AND user_id = $2', [body.orderId, user.id]);
      if (!rowCount) throw notFound('Order');
    }
    const { rows: open } = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM support_requests WHERE user_id = $1 AND status = 'open'`,
      [user.id],
    );
    if (open[0].count >= 10) throw conflict('TOO_MANY_REQUESTS', 'You already have several open requests. The store will reply soon — or call the store.');
    const { rows } = await client.query(
      `INSERT INTO support_requests (user_id, order_id, topic, message) VALUES ($1, $2, $3, $4)
       RETURNING id, order_id AS "orderId", topic, message, status, staff_reply AS "staffReply", created_at AS "createdAt", resolved_at AS "resolvedAt"`,
      [user.id, body.orderId ?? null, body.topic, body.message],
    );
    if (body.orderId) {
      await addOrderEvent(client, body.orderId, { id: user.id, role: 'customer' }, {
        type: 'support_request',
        message: `Customer reported a problem (${body.topic.replace('_', ' ')}): ${body.message}`,
        details: { supportRequestId: rows[0].id },
        visibleToCustomer: true,
      });
    }
    return rows[0];
  });
  res.status(201).json({ request });
});

// ---------------------------------------------------------------------------
// Loyalty points
// ---------------------------------------------------------------------------
export const loyaltyRouter = Router();
loyaltyRouter.use(requireAuth);

loyaltyRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const settings = await getStoreSettings(pool);
  const [balance, history] = await Promise.all([
    getLoyaltyBalance(pool, user.id),
    pool.query(
      `SELECT l.points, l.reason, l.order_id AS "orderId", l.created_at AS "createdAt"
       FROM loyalty_ledger l WHERE l.user_id = $1 ORDER BY l.created_at DESC, l.id DESC LIMIT 30`,
      [user.id],
    ),
  ]);
  res.json({
    enabled: settings.loyaltyEnabled,
    balance,
    pointsPer100: settings.loyaltyPointsPer100,
    pointValueCents: settings.loyaltyPointValueCents,
    minRedeemPoints: settings.loyaltyMinRedeemPoints,
    maxRedeemPercent: settings.loyaltyMaxRedeemPercent,
    history: history.rows,
  });
});

// ---------------------------------------------------------------------------
// Bundle offers (public)
// ---------------------------------------------------------------------------
export const promotionRouter = Router();

promotionRouter.get('/', async (_req, res) => {
  const settings = await getStoreSettings(pool);
  if (!settings.promotionsEnabled) {
    res.json({ enabled: false, items: [] });
    return;
  }
  const promotions = await listPromotions(pool, { runningOnly: true });
  res.json({
    enabled: true,
    items: promotions.map(({ isActive: _a, isRunning: _r, ...p }) => p),
  });
});
