// Placing orders, reading them back, and moving them through their statuses.
import { z } from 'zod';
import { config } from '../config.js';
import { pool, withTransaction, type Db } from '../db/pool.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { optionalText } from '../lib/validation.js';
import type { AuthUser } from '../middleware/auth.js';
import { priceItems, quoteSchema, resolveFulfillment } from './checkout.service.js';
import { releaseSlot, reserveSlot } from './pickup.service.js';

// --------------------------------------------------------------------------
// Statuses
// --------------------------------------------------------------------------
export const ORDER_STATUSES = ['pending', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'completed', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type FulfillmentType = 'delivery' | 'pickup';

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  preparing: 'Preparing',
  ready_for_pickup: 'Ready for pickup',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/**
 * The allowed order journey:
 *   Pending → Preparing → Ready for pickup (pickup orders) → Completed
 *                       → Out for delivery (delivery orders) → Completed
 * Any order that isn't completed can also be cancelled (with a reason).
 */
export function nextStatuses(status: OrderStatus, type: FulfillmentType): OrderStatus[] {
  switch (status) {
    case 'pending':
      return ['preparing'];
    case 'preparing':
      return [type === 'pickup' ? 'ready_for_pickup' : 'out_for_delivery'];
    case 'ready_for_pickup':
    case 'out_for_delivery':
      return ['completed'];
    default:
      return [];
  }
}

const isOpen = (status: OrderStatus) => status !== 'completed' && status !== 'cancelled';

// Shown to customers, e.g. MS-00012 (MS = Meeranji Supermarket).
export const orderNumber = (id: number) => `MS-${String(id).padStart(5, '0')}`;

// --------------------------------------------------------------------------
// Creating an order
// --------------------------------------------------------------------------
export const createOrderSchema = quoteSchema.extend({
  paymentMethod: z.enum(['pay_on_fulfillment', 'demo_card'], {
    error: 'Choose a payment option.',
  }),
  notes: optionalText(500),
  /** A random id created by the app for each checkout. Sending it again returns the same order. */
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
});
export type CreateOrderInput = z.output<typeof createOrderSchema>;

function isUniqueViolation(err: unknown, constraint: string) {
  const e = err as { code?: string; constraint?: string };
  return e?.code === '23505' && e.constraint === constraint;
}

async function findByIdempotencyKey(db: Db, userId: number, key: string): Promise<number | null> {
  const { rows } = await db.query<{ id: number }>('SELECT id FROM orders WHERE user_id = $1 AND idempotency_key = $2', [userId, key]);
  return rows[0]?.id ?? null;
}

/**
 * Places an order in ONE database transaction:
 *   lock stock rows → re-check prices, stock, address/slot → book pickup slot →
 *   save order + items → subtract stock.
 * If any step fails, nothing is saved and no stock is taken.
 */
export async function createOrder(userId: number, input: CreateOrderInput): Promise<{ orderId: number; created: boolean }> {
  try {
    return await withTransaction(async (client) => {
      if (input.idempotencyKey) {
        const existingId = await findByIdempotencyKey(client, userId, input.idempotencyKey);
        if (existingId) return { orderId: existingId, created: false };
      }

      const priced = await priceItems(client, input.items, { lockStock: true });
      const { fulfillment, issues } = await resolveFulfillment(client, userId, input.fulfillment, priced.subtotalCents);
      const allIssues = [...priced.issues, ...issues];
      if (allIssues.length) throw conflict('CHECKOUT_PROBLEM', allIssues[0].message, { issues: allIssues });

      if (fulfillment.type === 'pickup') {
        const reserved = await reserveSlot(client, fulfillment.slot!.id);
        if (!reserved) {
          const message = 'That collection time just filled up. Please choose another.';
          throw conflict('CHECKOUT_PROBLEM', message, { issues: [{ code: 'PICKUP_SLOT_UNAVAILABLE', message }] });
        }
      }

      const deliveryFeeCents = fulfillment.feeCents;
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO orders (user_id, fulfillment_type, payment_method, payment_status,
                             subtotal_cents, delivery_fee_cents, total_cents, notes, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          userId,
          fulfillment.type,
          input.paymentMethod,
          // DEMO payment: no card details are collected; we simply mark it paid.
          input.paymentMethod === 'demo_card' ? 'paid' : 'unpaid',
          priced.subtotalCents,
          deliveryFeeCents,
          priced.subtotalCents + deliveryFeeCents,
          input.notes,
          input.idempotencyKey ?? null,
        ],
      );
      const orderId = rows[0].id;

      const items = priced.items;
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_label, unit_price_cents, quantity, line_total_cents)
         SELECT $1::int, * FROM unnest($2::int[], $3::text[], $4::text[], $5::int[], $6::int[], $7::int[])`,
        [
          orderId,
          items.map((i) => i.productId),
          items.map((i) => i.name),
          items.map((i) => i.unitLabel),
          items.map((i) => i.unitPriceCents),
          items.map((i) => i.quantity),
          items.map((i) => i.lineTotalCents),
        ],
      );

      if (fulfillment.type === 'delivery') {
        const a = fulfillment.address!;
        await client.query(
          `INSERT INTO order_deliveries (order_id, zone_id, zone_name, recipient_name, phone, line1, line2, city, postcode, instructions)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [orderId, fulfillment.zone!.id, fulfillment.zone!.name, a.recipientName, a.phone, a.line1, a.line2, a.city, a.postcode.toUpperCase(), a.instructions],
        );
      } else {
        const slot = fulfillment.slot!;
        await client.query(
          'INSERT INTO order_pickups (order_id, slot_id, slot_starts_at, slot_ends_at) VALUES ($1, $2, $3, $4)',
          [orderId, slot.id, slot.startsAt, slot.endsAt],
        );
      }

      // Take the items out of stock. The rows are already locked and checked above;
      // the CHECK (quantity >= 0) constraint is a final safety net.
      await client.query(
        `UPDATE inventory i SET quantity = i.quantity - v.qty
         FROM unnest($1::int[], $2::int[]) AS v(product_id, qty)
         WHERE i.product_id = v.product_id`,
        [items.map((i) => i.productId), items.map((i) => i.quantity)],
      );

      await client.query(
        `INSERT INTO order_status_history (order_id, status, note, changed_by) VALUES ($1, 'pending', 'Order placed', $2)`,
        [orderId, userId],
      );

      return { orderId, created: true };
    });
  } catch (err) {
    // Two identical requests at the very same moment: the second one hits the
    // unique index, so hand back the order the first one created.
    if (input.idempotencyKey && isUniqueViolation(err, 'orders_idempotency_unique')) {
      const existingId = await findByIdempotencyKey(pool, userId, input.idempotencyKey);
      if (existingId) return { orderId: existingId, created: false };
    }
    throw err;
  }
}

// --------------------------------------------------------------------------
// Reading orders
// --------------------------------------------------------------------------
const ORDER_COLUMNS = `
  o.id, o.user_id AS "userId", o.status, o.fulfillment_type AS "fulfillmentType",
  o.payment_method AS "paymentMethod", o.payment_status AS "paymentStatus",
  o.subtotal_cents AS "subtotalCents", o.delivery_fee_cents AS "deliveryFeeCents", o.total_cents AS "totalCents",
  o.notes, o.cancel_reason AS "cancelReason", o.cancelled_by AS "cancelledBy",
  o.created_at AS "createdAt", o.updated_at AS "updatedAt",
  u.name AS "customerName", u.email AS "customerEmail", u.phone AS "customerPhone"`;

interface OrderRow {
  id: number;
  userId: number;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  paymentMethod: string;
  paymentStatus: string;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  notes: string | null;
  cancelReason: string | null;
  cancelledBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
}

export async function getOrderDetail(db: Db, orderId: number, options: { forCustomerId?: number } = {}) {
  const params: unknown[] = [orderId];
  let ownerCheck = '';
  if (options.forCustomerId) {
    params.push(options.forCustomerId);
    ownerCheck = 'AND o.user_id = $2';
  }
  const { rows } = await db.query<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = $1 ${ownerCheck}`,
    params,
  );
  const order = rows[0];
  // Customers get "not found" for other people's orders (rather than revealing they exist).
  if (!order) throw notFound('Order');

  const [items, delivery, pickup, history] = await Promise.all([
    db.query(
      `SELECT oi.id, oi.product_id AS "productId", oi.product_name AS "productName", oi.unit_label AS "unitLabel",
              oi.unit_price_cents AS "unitPriceCents", oi.quantity, oi.line_total_cents AS "lineTotalCents",
              p.image_url AS "imageUrl", COALESCE(p.icon, c.icon) AS icon
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       JOIN categories c ON c.id = p.category_id
       WHERE oi.order_id = $1 ORDER BY oi.id`,
      [orderId],
    ),
    db.query(
      `SELECT zone_name AS "zoneName", recipient_name AS "recipientName", phone, line1, line2, city, postcode, instructions
       FROM order_deliveries WHERE order_id = $1`,
      [orderId],
    ),
    db.query(
      `SELECT slot_id AS "slotId", slot_starts_at AS "startsAt", slot_ends_at AS "endsAt" FROM order_pickups WHERE order_id = $1`,
      [orderId],
    ),
    db.query(
      `SELECT h.status, h.note, h.created_at AS "createdAt", u.role AS "changedByRole"
       FROM order_status_history h LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.order_id = $1 ORDER BY h.created_at, h.id`,
      [orderId],
    ),
  ]);

  const isStaffView = !options.forCustomerId;
  return {
    id: order.id,
    orderNumber: orderNumber(order.id),
    status: order.status,
    statusLabel: STATUS_LABELS[order.status],
    fulfillmentType: order.fulfillmentType,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    subtotalCents: order.subtotalCents,
    deliveryFeeCents: order.deliveryFeeCents,
    totalCents: order.totalCents,
    notes: order.notes,
    cancelReason: order.cancelReason,
    cancelledBy: order.cancelledBy,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: items.rows,
    delivery: delivery.rows[0] ?? null,
    pickup: pickup.rows[0] ?? null,
    history: history.rows,
    customer: isStaffView
      ? { id: order.userId, name: order.customerName, email: order.customerEmail, phone: order.customerPhone }
      : undefined,
    allowedNextStatuses: isStaffView ? nextStatuses(order.status, order.fulfillmentType) : undefined,
    // Customers may only cancel before the store starts preparing the order.
    canCancel: isStaffView ? isOpen(order.status) : order.status === 'pending',
  };
}

export interface OrderListFilters {
  userId?: number;
  status?: OrderStatus | 'open';
  fulfillmentType?: FulfillmentType;
  search?: string;
  from?: string; // YYYY-MM-DD, in the store's time zone
  to?: string;
  page: number;
  pageSize: number;
}

export async function listOrders(db: Db, filters: OrderListFilters) {
  const where: string[] = [];
  const params: unknown[] = [];
  const param = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.userId) where.push(`o.user_id = ${param(filters.userId)}`);
  if (filters.status === 'open') where.push(`o.status NOT IN ('completed', 'cancelled')`);
  else if (filters.status) where.push(`o.status = ${param(filters.status)}`);
  if (filters.fulfillmentType) where.push(`o.fulfillment_type = ${param(filters.fulfillmentType)}`);
  if (filters.search) {
    const digits = filters.search.replace(/\D/g, '');
    const text = param(`%${filters.search.replace(/[\\%_]/g, '\\$&')}%`);
    const byId = digits && digits.length < 9 ? ` OR o.id = ${param(Number(digits))}` : '';
    where.push(`(u.name ILIKE ${text} OR u.email ILIKE ${text}${byId})`);
  }
  if (filters.from || filters.to) {
    const tz = param(config.STORE_TIMEZONE);
    if (filters.from) where.push(`o.created_at >= (${param(filters.from)}::date)::timestamp AT TIME ZONE ${tz}`);
    if (filters.to) where.push(`o.created_at < (${param(filters.to)}::date + 1)::timestamp AT TIME ZONE ${tz}`);
  }

  const { rows } = await db.query<OrderRow & {
    itemCount: number;
    itemPreview: string | null;
    deliveryPostcode: string | null;
    pickupStartsAt: Date | null;
    pickupEndsAt: Date | null;
    totalCount: number;
  }>(
    `SELECT ${ORDER_COLUMNS},
            (SELECT COALESCE(sum(quantity), 0) FROM order_items WHERE order_id = o.id) AS "itemCount",
            (SELECT string_agg(product_name, ', ' ORDER BY id)
               FROM (SELECT id, product_name FROM order_items WHERE order_id = o.id ORDER BY id LIMIT 3) first_items
            ) AS "itemPreview",
            d.postcode AS "deliveryPostcode",
            pk.slot_starts_at AS "pickupStartsAt", pk.slot_ends_at AS "pickupEndsAt",
            count(*) OVER () AS "totalCount"
     FROM orders o
     JOIN users u ON u.id = o.user_id
     LEFT JOIN order_deliveries d ON d.order_id = o.id
     LEFT JOIN order_pickups pk ON pk.order_id = o.id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY o.created_at DESC, o.id DESC
     LIMIT ${param(filters.pageSize)} OFFSET ${param((filters.page - 1) * filters.pageSize)}`,
    params,
  );

  return {
    items: rows.map((row) => ({
      id: row.id,
      orderNumber: orderNumber(row.id),
      status: row.status,
      statusLabel: STATUS_LABELS[row.status],
      fulfillmentType: row.fulfillmentType,
      paymentMethod: row.paymentMethod,
      paymentStatus: row.paymentStatus,
      totalCents: row.totalCents,
      itemCount: row.itemCount,
      itemPreview: row.itemPreview,
      deliveryPostcode: row.deliveryPostcode,
      pickupStartsAt: row.pickupStartsAt,
      pickupEndsAt: row.pickupEndsAt,
      createdAt: row.createdAt,
      customer: filters.userId ? undefined : { id: row.userId, name: row.customerName, email: row.customerEmail },
    })),
    total: rows[0]?.totalCount ?? 0,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

// --------------------------------------------------------------------------
// Changing status / cancelling
// --------------------------------------------------------------------------
export async function changeOrderStatus(orderId: number, next: OrderStatus, staffUserId: number, note?: string | null) {
  if (next === 'cancelled') throw badRequest('To cancel an order use the cancel action, which needs a reason.');

  await withTransaction(async (client) => {
    const { rows } = await client.query<{ status: OrderStatus; fulfillmentType: FulfillmentType }>(
      'SELECT status, fulfillment_type AS "fulfillmentType" FROM orders WHERE id = $1 FOR UPDATE',
      [orderId],
    );
    const order = rows[0];
    if (!order) throw notFound('Order');

    const allowed = nextStatuses(order.status, order.fulfillmentType);
    if (!allowed.includes(next)) {
      throw conflict(
        'INVALID_STATUS_CHANGE',
        `An order that is "${STATUS_LABELS[order.status]}" can't be changed to "${STATUS_LABELS[next]}".`,
        { currentStatus: order.status, allowedNextStatuses: allowed },
      );
    }

    await client.query(
      `UPDATE orders
       SET status = $2,
           payment_status = CASE WHEN $2::order_status = 'completed' AND payment_method = 'pay_on_fulfillment'
                                 THEN 'paid'::payment_status ELSE payment_status END
       WHERE id = $1`,
      [orderId, next],
    );
    await client.query('INSERT INTO order_status_history (order_id, status, note, changed_by) VALUES ($1, $2, $3, $4)', [
      orderId,
      next,
      note ?? null,
      staffUserId,
    ]);
  });
}

/** Cancels an order, puts its items back in stock and frees its pickup slot. */
export async function cancelOrder(orderId: number, actor: AuthUser, reason: string) {
  await withTransaction(async (client) => {
    const { rows } = await client.query<{ userId: number; status: OrderStatus }>(
      'SELECT user_id AS "userId", status FROM orders WHERE id = $1 FOR UPDATE',
      [orderId],
    );
    const order = rows[0];
    if (!order || (actor.role === 'customer' && order.userId !== actor.id)) throw notFound('Order');
    if (order.status === 'cancelled') throw conflict('ALREADY_CANCELLED', 'This order has already been cancelled.');
    if (order.status === 'completed') throw conflict('ORDER_COMPLETED', 'Completed orders cannot be cancelled.');
    if (actor.role === 'customer' && order.status !== 'pending') {
      throw conflict(
        'CANNOT_CANCEL',
        'The store has already started preparing this order, so it can no longer be cancelled in the app. Please call the store.',
      );
    }

    // Put the items back on the shelf. Lock stock rows in id order (same as checkout).
    const { rows: items } = await client.query<{ productId: number; quantity: number }>(
      'SELECT product_id AS "productId", quantity FROM order_items WHERE order_id = $1 ORDER BY product_id',
      [orderId],
    );
    const ids = items.map((i) => i.productId);
    await client.query('SELECT product_id FROM inventory WHERE product_id = ANY($1::int[]) ORDER BY product_id FOR UPDATE', [ids]);
    await client.query(
      `UPDATE inventory i SET quantity = i.quantity + v.qty
       FROM unnest($1::int[], $2::int[]) AS v(product_id, qty)
       WHERE i.product_id = v.product_id`,
      [ids, items.map((i) => i.quantity)],
    );

    const { rows: pickup } = await client.query<{ slotId: number }>('SELECT slot_id AS "slotId" FROM order_pickups WHERE order_id = $1', [orderId]);
    if (pickup[0]) await releaseSlot(client, pickup[0].slotId);

    await client.query(
      `UPDATE orders
       SET status = 'cancelled', cancel_reason = $2, cancelled_by = $3,
           payment_status = CASE WHEN payment_status = 'paid' THEN 'refunded'::payment_status ELSE payment_status END
       WHERE id = $1`,
      [orderId, reason, actor.role],
    );
    await client.query(`INSERT INTO order_status_history (order_id, status, note, changed_by) VALUES ($1, 'cancelled', $2, $3)`, [
      orderId,
      reason,
      actor.id,
    ]);
  });
}
