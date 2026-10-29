// Placing orders, reading them back, and moving them through their statuses.
import { z } from 'zod';
import { logError } from '../lib/logger.js';
import { config } from '../config.js';
import { pool, withTransaction, type Db } from '../db/pool.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { formatMoney } from '../lib/money.js';
import { orderNumber } from '../lib/order-number.js';
import { optionalText } from '../lib/validation.js';
import { addOrderEvent, setStockContext, SYSTEM, type Actor, type StockReason } from './audit.service.js';
import { computeTotals, priceItems, quoteSchema, resolveFulfillment, resolveSubstitutions } from './checkout.service.js';
import { formatSlotTime, PHRASES, type NotificationEvent } from './messages.js';
import { flushWhatsAppQueue, flushWhatsAppQueueSoon, notifyCustomer } from './notification.service.js';
import { applyPromotions, getLoyaltyBalance, pointsEarnedFor } from './offers.service.js';
import { currentProvider, paymentsEnvironment, refreshOrderPayments, refundOrderAmount } from './payment.service.js';
import { releaseSlot, reserveSlot } from './pickup.service.js';
import { getStoreSettings } from './settings.service.js';

export { orderNumber };

// --------------------------------------------------------------------------
// Statuses
// --------------------------------------------------------------------------
export const ORDER_STATUSES = [
  'awaiting_payment',
  'confirmed',
  'preparing',
  'ready_for_pickup',
  'out_for_delivery',
  'completed',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type FulfillmentType = 'delivery' | 'pickup';

export const STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_payment: 'Awaiting payment',
  confirmed: 'Order confirmed',
  preparing: 'Preparing',
  ready_for_pickup: 'Ready for pickup',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_EVENTS: Partial<Record<OrderStatus, NotificationEvent>> = {
  preparing: 'order_preparing',
  ready_for_pickup: 'order_ready_for_pickup',
  out_for_delivery: 'order_out_for_delivery',
  completed: 'order_completed',
};

/**
 * The allowed order journey:
 *   (UPI only) Awaiting payment → paid → Order confirmed
 *   Order confirmed → Preparing → Ready for pickup (pickup orders) → Completed
 *                               → Out for delivery (delivery orders) → Completed
 * Open orders can also be cancelled (with a reason).
 */
export function nextStatuses(status: OrderStatus, type: FulfillmentType): OrderStatus[] {
  switch (status) {
    case 'confirmed':
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

// --------------------------------------------------------------------------
// Creating an order
// --------------------------------------------------------------------------
export const createOrderSchema = quoteSchema.extend({
  paymentMethod: z.enum(['pay_on_fulfillment', 'upi'], { error: 'Choose a payment option.' }),
  notes: optionalText(500),
  /** The customer ticked "Send me order updates on WhatsApp". */
  whatsappUpdates: z.boolean().optional(),
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
 *   lock stock rows → re-check prices, stock, offers, address/slot → book pickup
 *   slot → save order + items → take the items out of stock.
 * If any step fails, nothing is saved and no stock is taken.
 * UPI orders wait in "awaiting_payment" (stock and slot held) until paid.
 */
export async function createOrder(userId: number, input: CreateOrderInput): Promise<{ orderId: number; created: boolean }> {
  try {
    const result = await withTransaction(async (client) => {
      if (input.idempotencyKey) {
        const existingId = await findByIdempotencyKey(client, userId, input.idempotencyKey);
        if (existingId) return { orderId: existingId, created: false };
      }

      const settings = await getStoreSettings(client);
      const priced = await priceItems(client, input.items, { lockStock: true });
      const { fulfillment, issues } = await resolveFulfillment(client, userId, input.fulfillment, priced.subtotalCents);
      const substitutions = await resolveSubstitutions(client, settings, input.items);
      const totals = await computeTotals(client, settings, userId, priced, fulfillment.feeCents, Boolean(input.useLoyaltyPoints));
      const isUpi = input.paymentMethod === 'upi';
      const allIssues = [...priced.issues, ...issues, ...substitutions.issues];
      if (isUpi && totals.totalCents < 100) {
        allIssues.push({ code: 'UPI_MINIMUM', message: 'UPI payments need a total of at least ₹1. Please choose pay on delivery.' });
      }
      if (allIssues.length) throw conflict('CHECKOUT_PROBLEM', allIssues[0].message, { issues: allIssues });

      if (fulfillment.type === 'pickup') {
        const reserved = await reserveSlot(client, fulfillment.slot!.id);
        if (!reserved) {
          const message = 'That collection time just filled up. Please choose another.';
          throw conflict('CHECKOUT_PROBLEM', message, { issues: [{ code: 'PICKUP_SLOT_UNAVAILABLE', message }] });
        }
      }

      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO orders (user_id, status, fulfillment_type, payment_method, payment_status,
                             subtotal_cents, delivery_fee_cents, discount_cents, loyalty_discount_cents,
                             loyalty_points_redeemed, total_cents, notes, idempotency_key, payment_due_by, whatsapp_updates)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                 CASE WHEN $14::boolean THEN now() + make_interval(mins => $15::int) END, $16)
         RETURNING id`,
        [
          userId,
          isUpi ? 'awaiting_payment' : 'confirmed',
          fulfillment.type,
          input.paymentMethod,
          isUpi ? 'pending' : 'unpaid',
          totals.subtotalCents,
          totals.deliveryFeeCents,
          totals.discountCents,
          totals.loyalty.discountCents,
          totals.loyalty.pointsUsed,
          totals.totalCents,
          input.notes,
          input.idempotencyKey ?? null,
          isUpi,
          config.PAYMENT_TIMEOUT_MINUTES,
          Boolean(input.whatsappUpdates),
        ],
      );
      const orderId = rows[0].id;

      const items = priced.items;
      const choice = (productId: number) => substitutions.choices.get(productId) ?? { preference: 'none' as const };
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_label, unit_price_cents, quantity, line_total_cents,
                                  charged_cents, substitution_preference, preferred_substitute_id)
         SELECT $1::int, v.product_id, v.name, v.unit_label, v.price, v.qty, v.line_total, v.line_total, v.pref, v.sub_id
         FROM unnest($2::int[], $3::text[], $4::text[], $5::int[], $6::int[], $7::int[], $8::text[], $9::int[])
              AS v(product_id, name, unit_label, price, qty, line_total, pref, sub_id)`,
        [
          orderId,
          items.map((i) => i.productId),
          items.map((i) => i.name),
          items.map((i) => i.unitLabel),
          items.map((i) => i.unitPriceCents),
          items.map((i) => i.quantity),
          items.map((i) => i.lineTotalCents),
          items.map((i) => choice(i.productId).preference),
          items.map((i) => (choice(i.productId).preference === 'specific' ? (choice(i.productId).productId ?? null) : null)),
        ],
      );

      for (const promotion of totals.promotions) {
        await client.query(
          'INSERT INTO order_promotions (order_id, promotion_id, name, times_applied, discount_cents) VALUES ($1, $2, $3, $4, $5)',
          [orderId, promotion.promotionId, promotion.name, promotion.timesApplied, promotion.discountCents],
        );
      }

      if (fulfillment.type === 'delivery') {
        const a = fulfillment.address!;
        await client.query(
          `INSERT INTO order_deliveries (order_id, zone_id, zone_name, recipient_name, phone, line1, line2, city, postcode, instructions)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [orderId, fulfillment.zone!.id, fulfillment.zone!.name, a.recipientName, a.phone, a.line1, a.line2, a.city, a.postcode.toUpperCase(), a.instructions],
        );
      } else {
        const slot = fulfillment.slot!;
        await client.query('INSERT INTO order_pickups (order_id, slot_id, slot_starts_at, slot_ends_at) VALUES ($1, $2, $3, $4)', [
          orderId,
          slot.id,
          slot.startsAt,
          slot.endsAt,
        ]);
      }

      // Take the items out of stock. The rows are already locked and checked above;
      // the CHECK (quantity >= 0) constraint is a final safety net.
      await setStockContext(client, { reason: 'order_placed', orderId, userId });
      await client.query(
        `UPDATE inventory i SET quantity = i.quantity - v.qty
         FROM unnest($1::int[], $2::int[]) AS v(product_id, qty)
         WHERE i.product_id = v.product_id`,
        [items.map((i) => i.productId), items.map((i) => i.quantity)],
      );

      if (totals.loyalty.pointsUsed > 0) {
        await client.query(`INSERT INTO loyalty_ledger (user_id, order_id, points, reason) VALUES ($1, $2, $3, 'redeemed')`, [
          userId,
          orderId,
          -totals.loyalty.pointsUsed,
        ]);
      }
      if (input.whatsappUpdates) {
        await client.query(
          `UPDATE users SET whatsapp_opt_in = true, whatsapp_opt_in_at = COALESCE(whatsapp_opt_in_at, now()) WHERE id = $1`,
          [userId],
        );
      }

      await client.query(`INSERT INTO order_status_history (order_id, status, note, changed_by) VALUES ($1, $2, $3, $4)`, [
        orderId,
        isUpi ? 'awaiting_payment' : 'confirmed',
        isUpi ? 'Waiting for UPI payment' : 'Order placed',
        userId,
      ]);
      await addOrderEvent(client, orderId, { id: userId, role: 'customer' }, {
        type: 'order_placed',
        message: `Order placed: ${items.length} item${items.length === 1 ? '' : 's'}, total ${formatMoney(totals.totalCents)}, ${
          isUpi ? `UPI${{ demo: ' (DEMO)', test: ' (Razorpay TEST mode)', live: '' }[paymentsEnvironment()]}` : 'pay on delivery/collection'
        }`,
        visibleToCustomer: true,
      });
      if (!isUpi) {
        await notifyCustomer(client, { userId, orderId, event: 'order_confirmed', vars: { total: formatMoney(totals.totalCents) } });
      }
      return { orderId, created: true };
    });
    flushWhatsAppQueueSoon();
    return result;
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
  o.subtotal_cents AS "subtotalCents", o.delivery_fee_cents AS "deliveryFeeCents",
  o.discount_cents AS "discountCents", o.loyalty_discount_cents AS "loyaltyDiscountCents",
  o.loyalty_points_redeemed AS "loyaltyPointsRedeemed", o.loyalty_points_earned AS "loyaltyPointsEarned",
  o.total_cents AS "totalCents", o.refunded_cents AS "refundedCents",
  o.payment_due_by AS "paymentDueBy", o.paid_at AS "paidAt", o.whatsapp_updates AS "whatsappUpdates",
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
  discountCents: number;
  loyaltyDiscountCents: number;
  loyaltyPointsRedeemed: number;
  loyaltyPointsEarned: number;
  totalCents: number;
  refundedCents: number;
  paymentDueBy: Date | null;
  paidAt: Date | null;
  whatsappUpdates: boolean;
  notes: string | null;
  cancelReason: string | null;
  cancelledBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
}

export async function getOrderDetail(db: Db, orderId: number, options: { forCustomerId?: number; viewerRole?: 'staff' | 'manager' } = {}) {
  const params: unknown[] = [orderId];
  let ownerCheck = '';
  if (options.forCustomerId) {
    params.push(options.forCustomerId);
    ownerCheck = 'AND o.user_id = $2';
  }
  const { rows } = await db.query<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = $1 ${ownerCheck}`, params);
  const order = rows[0];
  // Customers get "not found" for other people's orders (rather than revealing they exist).
  if (!order) throw notFound('Order');
  const isStaffView = !options.forCustomerId;

  const [items, delivery, pickup, history, events, payments, refunds, promotions, support] = await Promise.all([
    db.query(
      `SELECT oi.id, oi.product_id AS "productId", oi.product_name AS "productName", p.name_ta AS "productNameTa",
              oi.unit_label AS "unitLabel", oi.unit_price_cents AS "unitPriceCents", oi.quantity,
              oi.line_total_cents AS "lineTotalCents", oi.charged_cents AS "chargedCents",
              p.image_url AS "imageUrl",
              oi.substitution_preference AS "substitutionPreference",
              oi.preferred_substitute_id AS "preferredSubstituteId", ps.name AS "preferredSubstituteName", ps.name_ta AS "preferredSubstituteNameTa",
              oi.fulfilment_status AS "fulfilmentStatus",
              oi.substitute_product_id AS "substituteProductId", oi.substitute_name AS "substituteName", sp.name_ta AS "substituteNameTa",
              oi.substitute_unit_label AS "substituteUnitLabel", oi.substitute_unit_price_cents AS "substituteUnitPriceCents",
              oi.substitute_quantity AS "substituteQuantity", sp.image_url AS "substituteImageUrl"
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       JOIN categories c ON c.id = p.category_id
       LEFT JOIN products ps ON ps.id = oi.preferred_substitute_id
       LEFT JOIN products sp ON sp.id = oi.substitute_product_id
       WHERE oi.order_id = $1 ORDER BY oi.id`,
      [orderId],
    ),
    db.query(
      `SELECT zone_name AS "zoneName", recipient_name AS "recipientName", phone, line1, line2, city, postcode, instructions
       FROM order_deliveries WHERE order_id = $1`,
      [orderId],
    ),
    db.query(`SELECT slot_id AS "slotId", slot_starts_at AS "startsAt", slot_ends_at AS "endsAt" FROM order_pickups WHERE order_id = $1`, [orderId]),
    db.query(
      `SELECT h.status, h.note, h.created_at AS "createdAt", u.role AS "changedByRole"
       FROM order_status_history h LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.order_id = $1 ORDER BY h.created_at, h.id`,
      [orderId],
    ),
    db.query(
      `SELECT e.id, e.type, e.message, e.actor_role AS "actorRole", u.name AS "actorName", e.created_at AS "createdAt"
       FROM order_events e LEFT JOIN users u ON u.id = e.actor_user_id
       WHERE e.order_id = $1 ${isStaffView ? '' : 'AND e.visible_to_customer'}
       ORDER BY e.created_at, e.id`,
      [orderId],
    ),
    db.query(
      `SELECT id, provider, test_mode AS "testMode", status, amount_cents AS "amountCents", failure_reason AS "failureReason",
              provider_payment_id AS "providerPaymentId", created_at AS "createdAt", paid_at AS "paidAt"
       FROM payments WHERE order_id = $1 ORDER BY created_at DESC, id DESC`,
      [orderId],
    ),
    db.query(
      `SELECT id, amount_cents AS "amountCents", status, reason, failure_reason AS "failureReason",
              created_at AS "createdAt", processed_at AS "processedAt"
       FROM refunds WHERE order_id = $1 ORDER BY created_at, id`,
      [orderId],
    ),
    db.query(`SELECT name, times_applied AS "timesApplied", discount_cents AS "discountCents" FROM order_promotions WHERE order_id = $1`, [orderId]),
    db.query(
      `SELECT id, topic, message, status, staff_reply AS "staffReply", created_at AS "createdAt", resolved_at AS "resolvedAt"
       FROM support_requests WHERE order_id = $1 ORDER BY created_at DESC`,
      [orderId],
    ),
  ]);

  const paidCents = payments.rows.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amountCents, 0);
  const latestPayment = payments.rows[0] ?? null;
  const paymentMode: 'demo' | 'test' | 'live' = latestPayment
    ? latestPayment.provider === 'demo'
      ? 'demo'
      : latestPayment.testMode
        ? 'test'
        : 'live'
    : paymentsEnvironment();
  const awaiting = order.status === 'awaiting_payment';
  const isPaid = ['paid', 'partially_refunded', 'refunded', 'refund_pending'].includes(order.paymentStatus) && paidCents > 0;

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
    discountCents: order.discountCents,
    loyaltyDiscountCents: order.loyaltyDiscountCents,
    loyaltyPointsRedeemed: order.loyaltyPointsRedeemed,
    loyaltyPointsEarned: order.loyaltyPointsEarned,
    totalCents: order.totalCents,
    paidCents,
    refundedCents: order.refundedCents,
    promotions: promotions.rows,
    notes: order.notes,
    cancelReason: order.cancelReason,
    cancelledBy: order.cancelledBy,
    whatsappUpdates: order.whatsappUpdates,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: items.rows,
    delivery: delivery.rows[0] ?? null,
    pickup: pickup.rows[0] ?? null,
    history: history.rows,
    events: events.rows,
    payment: {
      // demo = practice page · test = Razorpay test keys · live = real money. Only "live" moves real money.
      mode: paymentMode,
      isDemo: order.paymentMethod === 'upi' && paymentMode !== 'live',
      dueBy: awaiting ? order.paymentDueBy : null,
      paidAt: order.paidAt,
      latestAttempt: latestPayment && {
        status: latestPayment.status,
        failureReason: latestPayment.failureReason,
        createdAt: latestPayment.createdAt,
      },
      attempts: isStaffView ? payments.rows : undefined,
    },
    refunds: refunds.rows.map((r) => (isStaffView ? r : { ...r, failureReason: undefined })),
    supportRequests: support.rows,
    customer: isStaffView ? { id: order.userId, name: order.customerName, email: order.customerEmail, phone: order.customerPhone } : undefined,
    allowedNextStatuses: isStaffView ? nextStatuses(order.status, order.fulfillmentType) : undefined,
    canPay: !isStaffView && awaiting,
    canSwitchToPayOnDelivery: !isStaffView && awaiting,
    // Customers may cancel until the store starts preparing. Cancelling a paid order
    // gives the money back automatically.
    canCancel: isStaffView
      ? isOpen(order.status) && (options.viewerRole === 'manager' || !isPaid)
      : order.status === 'awaiting_payment' || order.status === 'confirmed',
    canResolveItems: isStaffView && (order.status === 'confirmed' || order.status === 'preparing'),
    cancelNeedsManager: isStaffView && isOpen(order.status) && isPaid && options.viewerRole !== 'manager',
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

  const { rows } = await db.query<
    OrderRow & {
      itemCount: number;
      itemPreview: string | null;
      deliveryPostcode: string | null;
      pickupStartsAt: Date | null;
      pickupEndsAt: Date | null;
      openSupport: number;
      totalCount: number;
    }
  >(
    `SELECT ${ORDER_COLUMNS},
            (SELECT COALESCE(sum(quantity), 0) FROM order_items WHERE order_id = o.id) AS "itemCount",
            (SELECT string_agg(product_name, ', ' ORDER BY id)
               FROM (SELECT id, product_name FROM order_items WHERE order_id = o.id ORDER BY id LIMIT 3) first_items
            ) AS "itemPreview",
            d.postcode AS "deliveryPostcode",
            pk.slot_starts_at AS "pickupStartsAt", pk.slot_ends_at AS "pickupEndsAt",
            (SELECT count(*) FROM support_requests s WHERE s.order_id = o.id AND s.status = 'open') AS "openSupport",
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
      paymentDueBy: row.status === 'awaiting_payment' ? row.paymentDueBy : null,
      openSupportRequests: row.openSupport,
      createdAt: row.createdAt,
      customer: filters.userId ? undefined : { id: row.userId, name: row.customerName, email: row.customerEmail },
    })),
    total: rows[0]?.totalCount ?? 0,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

// --------------------------------------------------------------------------
// Changing status
// --------------------------------------------------------------------------
export async function changeOrderStatus(orderId: number, next: OrderStatus, actor: Actor, note?: string | null) {
  if (next === 'cancelled') throw badRequest('To cancel an order use the cancel action, which needs a reason.');

  await withTransaction(async (client) => {
    const { rows } = await client.query<{
      userId: number;
      status: OrderStatus;
      fulfillmentType: FulfillmentType;
      paymentMethod: string;
      totalCents: number;
      refundedCents: number;
    }>(
      `SELECT user_id AS "userId", status, fulfillment_type AS "fulfillmentType", payment_method AS "paymentMethod",
              total_cents AS "totalCents", refunded_cents AS "refundedCents"
       FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId],
    );
    const order = rows[0];
    if (!order) throw notFound('Order');

    const allowed = nextStatuses(order.status, order.fulfillmentType);
    if (!allowed.includes(next)) {
      throw conflict(
        'INVALID_STATUS_CHANGE',
        order.status === 'awaiting_payment'
          ? 'This order is waiting for the customer’s UPI payment. It moves on by itself once the payment is confirmed.'
          : `An order that is "${STATUS_LABELS[order.status]}" can't be changed to "${STATUS_LABELS[next]}".`,
        { currentStatus: order.status, allowedNextStatuses: allowed },
      );
    }

    await client.query(
      `UPDATE orders
       SET status = $2,
           payment_status = CASE WHEN $2::order_status = 'completed' AND payment_method = 'pay_on_fulfillment'
                                 THEN 'paid'::payment_status ELSE payment_status END,
           paid_at = CASE WHEN $2::order_status = 'completed' AND payment_method = 'pay_on_fulfillment' THEN now() ELSE paid_at END
       WHERE id = $1`,
      [orderId, next],
    );
    await client.query('INSERT INTO order_status_history (order_id, status, note, changed_by) VALUES ($1, $2, $3, $4)', [orderId, next, note ?? null, actor.id ?? null]);
    await addOrderEvent(client, orderId, actor, {
      type: 'status_changed',
      message: `Status changed to ${STATUS_LABELS[next]}${note ? `: ${note}` : ''}`,
      visibleToCustomer: true,
    });

    const event = STATUS_EVENTS[next];
    if (event) {
      let pickup: { startsAt: Date; endsAt: Date } | undefined;
      if (next === 'ready_for_pickup') {
        const { rows: p } = await client.query<{ startsAt: Date; endsAt: Date }>(
          'SELECT slot_starts_at AS "startsAt", slot_ends_at AS "endsAt" FROM order_pickups WHERE order_id = $1',
          [orderId],
        );
        pickup = p[0];
      }
      await notifyCustomer(client, {
        userId: order.userId,
        orderId,
        event,
        vars: (lang) => ({ pickupTime: pickup ? formatSlotTime(pickup.startsAt, pickup.endsAt, lang) : '' }),
      });
    }

    // Loyalty points for a completed order (when switched on).
    if (next === 'completed') {
      const settings = await getStoreSettings(client);
      const points = pointsEarnedFor(settings, order.totalCents - order.refundedCents);
      if (points > 0) {
        await client.query(`INSERT INTO loyalty_ledger (user_id, order_id, points, reason) VALUES ($1, $2, $3, 'earned')`, [order.userId, orderId, points]);
        await client.query('UPDATE orders SET loyalty_points_earned = $2 WHERE id = $1', [orderId, points]);
        const balance = await getLoyaltyBalance(client, order.userId);
        await notifyCustomer(client, { userId: order.userId, orderId, event: 'points_earned', vars: { points: String(points), balance: String(balance) } });
      }
    }
  });
  flushWhatsAppQueueSoon();
}

// --------------------------------------------------------------------------
// Cancelling
// --------------------------------------------------------------------------
interface ReservedLine {
  productId: number;
  quantity: number;
}

/** What is actually held in stock for an order: substitutes instead of missing items; nothing for removed ones. */
async function reservedStock(db: Db, orderId: number): Promise<ReservedLine[]> {
  const { rows } = await db.query<ReservedLine>(
    `SELECT CASE fulfilment_status WHEN 'substituted' THEN substitute_product_id ELSE product_id END AS "productId",
            sum(CASE fulfilment_status WHEN 'substituted' THEN substitute_quantity ELSE quantity END)::int AS quantity
     FROM order_items WHERE order_id = $1 AND fulfilment_status <> 'unavailable'
     GROUP BY 1 ORDER BY 1`,
    [orderId],
  );
  return rows;
}

/**
 * Cancels an order: puts its items back in stock, frees its pickup slot, gives
 * back loyalty points, and refunds any UPI payment to the customer's original
 * payment method.
 *   Customers: while the order is awaiting payment or confirmed (not yet being prepared).
 *   Staff: any open order that hasn't been paid online. Managers: any open order.
 *   System: unpaid UPI orders whose payment time ran out.
 */
export async function cancelOrder(orderId: number, actor: Actor, reason: string) {
  const outcome = await withTransaction(async (client) => {
    const { rows } = await client.query<{ userId: number; status: OrderStatus; paymentStatus: string; pointsRedeemed: number }>(
      `SELECT user_id AS "userId", status, payment_status AS "paymentStatus", loyalty_points_redeemed AS "pointsRedeemed"
       FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId],
    );
    const order = rows[0];
    if (!order || (actor.role === 'customer' && order.userId !== actor.id)) throw notFound('Order');
    if (order.status === 'cancelled') throw conflict('ALREADY_CANCELLED', 'This order has already been cancelled.');
    if (order.status === 'completed') throw conflict('ORDER_COMPLETED', 'Completed orders cannot be cancelled.');
    if (actor.role === 'customer' && order.status !== 'awaiting_payment' && order.status !== 'confirmed') {
      throw conflict(
        'CANNOT_CANCEL',
        'The store has already started preparing this order, so it can no longer be cancelled in the app. Please call the store.',
      );
    }
    if (actor.role === 'system' && order.status !== 'awaiting_payment') throw conflict('CANNOT_CANCEL', 'Only unpaid orders are cancelled automatically.');

    const { rows: paidRows } = await client.query<{ paid: number; refunded: number }>(
      `SELECT COALESCE((SELECT sum(amount_cents) FROM payments WHERE order_id = $1 AND status = 'paid'), 0)::int AS paid,
              COALESCE((SELECT sum(amount_cents) FROM refunds WHERE order_id = $1 AND status <> 'failed'), 0)::int AS refunded`,
      [orderId],
    );
    const refundable = paidRows[0].paid - paidRows[0].refunded;
    if (refundable > 0 && actor.role === 'staff') {
      throw forbidden('This order was paid online. Only a manager can cancel it, because cancelling refunds the payment.');
    }

    // Put the items back on the shelf. Lock stock rows in id order (same as checkout).
    const lines = await reservedStock(client, orderId);
    const ids = lines.map((l) => l.productId);
    await client.query('SELECT product_id FROM inventory WHERE product_id = ANY($1::int[]) ORDER BY product_id FOR UPDATE', [ids]);
    const stockReason: StockReason = actor.role === 'system' ? 'payment_expired' : 'order_cancelled';
    await setStockContext(client, { reason: stockReason, orderId, userId: actor.id ?? null });
    await client.query(
      `UPDATE inventory i SET quantity = i.quantity + v.qty
       FROM unnest($1::int[], $2::int[]) AS v(product_id, qty)
       WHERE i.product_id = v.product_id`,
      [ids, lines.map((l) => l.quantity)],
    );

    const { rows: pickup } = await client.query<{ slotId: number }>('SELECT slot_id AS "slotId" FROM order_pickups WHERE order_id = $1', [orderId]);
    if (pickup[0]) await releaseSlot(client, pickup[0].slotId);

    await client.query(
      `UPDATE payments SET status = CASE WHEN $2 THEN 'expired' ELSE 'cancelled' END, cancelled_at = now()
       WHERE order_id = $1 AND status IN ('created', 'pending')`,
      [orderId, actor.role === 'system'],
    );

    if (order.pointsRedeemed > 0) {
      await client.query(`INSERT INTO loyalty_ledger (user_id, order_id, points, reason) VALUES ($1, $2, $3, 'redeem_reversed')`, [
        order.userId,
        orderId,
        order.pointsRedeemed,
      ]);
    }

    await client.query(
      `UPDATE orders
       SET status = 'cancelled', cancel_reason = $2, cancelled_by = $3, payment_due_by = NULL,
           payment_status = CASE WHEN payment_status IN ('pending', 'failed') THEN 'unpaid'::payment_status ELSE payment_status END
       WHERE id = $1`,
      [orderId, reason, actor.role === 'customer' || actor.role === 'staff' || actor.role === 'manager' ? actor.role : null],
    );
    await client.query(`INSERT INTO order_status_history (order_id, status, note, changed_by) VALUES ($1, 'cancelled', $2, $3)`, [orderId, reason, actor.id ?? null]);
    await addOrderEvent(client, orderId, actor, { type: 'order_cancelled', message: `Order cancelled: ${reason}`, visibleToCustomer: true });
    await notifyCustomer(client, {
      userId: order.userId,
      orderId,
      event: 'order_cancelled',
      vars: (lang) => ({
        reason: actor.role === 'system' ? PHRASES.paymentNotCompleted[lang] : reason,
        refundNote: refundable > 0 ? PHRASES.refundNote[lang](formatMoney(refundable)) : '',
      }),
    });
    return { refundable };
  });

  if (outcome.refundable > 0) await refundOrderAmount(orderId, outcome.refundable, `Order cancelled: ${reason}`, actor, { notify: false });
  flushWhatsAppQueueSoon();
}

// --------------------------------------------------------------------------
// Substitutions (staff, while picking the order)
// --------------------------------------------------------------------------
export type ItemResolution =
  | { type: 'unavailable'; setStockToZero?: boolean }
  | {
      type: 'substitute';
      productId: number;
      quantity: number;
      setStockToZero?: boolean;
      /** Staff phoned the customer and they agreed to a substitute they hadn't asked for. */
      customerAgreed?: boolean;
    };

/**
 * When an item can't be found on the shelf: remove it (the customer isn't
 * charged), or replace it with another product. A substitute never costs the
 * customer more than the item they ordered. If the order was paid online, the
 * difference is refunded automatically.
 * The customer's choice is respected: "don't replace" items (and "replace
 * with X" items, for any other product) are only substituted if the customer
 * agreed when staff phoned them.
 */
export async function resolveOrderItem(orderId: number, itemId: number, resolution: ItemResolution, actor: Actor) {
  const outcome = await withTransaction(async (client) => {
    const { rows } = await client.query<{
      userId: number;
      status: OrderStatus;
      deliveryFeeCents: number;
      loyaltyDiscountCents: number;
      loyaltyPointsRedeemed: number;
    }>(
      `SELECT user_id AS "userId", status, delivery_fee_cents AS "deliveryFeeCents",
              loyalty_discount_cents AS "loyaltyDiscountCents", loyalty_points_redeemed AS "loyaltyPointsRedeemed"
       FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId],
    );
    const order = rows[0];
    if (!order) throw notFound('Order');
    if (order.status !== 'confirmed' && order.status !== 'preparing') {
      throw conflict('CANNOT_CHANGE_ITEMS', 'Items can only be changed while the order is confirmed or being prepared.');
    }

    const { rows: itemRows } = await client.query<{
      productId: number;
      name: string;
      quantity: number;
      lineTotalCents: number;
      fulfilmentStatus: string;
      preference: 'none' | 'similar' | 'specific';
      preferredId: number | null;
    }>(
      `SELECT product_id AS "productId", product_name AS name, quantity, line_total_cents AS "lineTotalCents", fulfilment_status AS "fulfilmentStatus",
              substitution_preference AS preference, preferred_substitute_id AS "preferredId"
       FROM order_items WHERE id = $1 AND order_id = $2 FOR UPDATE`,
      [itemId, orderId],
    );
    const item = itemRows[0];
    if (!item) throw notFound('Order item');
    if (item.fulfilmentStatus !== 'ordered') throw conflict('ITEM_ALREADY_CHANGED', 'This item has already been substituted or removed.');

    if (resolution.setStockToZero) {
      await setStockContext(client, { reason: 'item_unavailable', orderId, userId: actor.id ?? null, note: `${item.name} not found on the shelf` });
      await client.query('UPDATE inventory SET quantity = 0 WHERE product_id = $1 AND quantity > 0', [item.productId]);
    }

    let details: { en: string; ta: string };
    if (resolution.type === 'unavailable') {
      await client.query(`UPDATE order_items SET fulfilment_status = 'unavailable', charged_cents = 0 WHERE id = $1`, [itemId]);
      details = { en: PHRASES.unavailable.en(item.name), ta: PHRASES.unavailable.ta(item.name) };
      await addOrderEvent(client, orderId, actor, {
        type: 'item_unavailable',
        message: `${item.name} was unavailable and has been removed (not charged)`,
        details: { itemId },
        visibleToCustomer: true,
      });
    } else {
      if (resolution.productId === item.productId) throw badRequest('Choose a different product as the substitute.');
      const againstWishes = item.preference === 'none' || (item.preference === 'specific' && item.preferredId !== resolution.productId);
      if (againstWishes && !resolution.customerAgreed) {
        throw conflict(
          'CUSTOMER_CHOICE',
          item.preference === 'none'
            ? 'The customer asked not to replace this item. Remove it instead, or phone the customer and tick "Customer agreed".'
            : 'The customer chose a specific replacement. Use that product, or phone the customer and tick "Customer agreed".',
        );
      }
      const { rows: subRows } = await client.query<{ name: string; unitLabel: string; priceCents: number; stock: number; isActive: boolean }>(
        `SELECT p.name, p.unit_label AS "unitLabel", p.price_cents AS "priceCents", i.quantity AS stock, (p.is_active AND c.is_active) AS "isActive"
         FROM products p JOIN categories c ON c.id = p.category_id JOIN inventory i ON i.product_id = p.id
         WHERE p.id = $1 FOR UPDATE OF i`,
        [resolution.productId],
      );
      const sub = subRows[0];
      if (!sub || !sub.isActive) throw badRequest('That substitute product is not available.');
      if (sub.stock < resolution.quantity) throw conflict('INSUFFICIENT_STOCK', `Only ${sub.stock} × ${sub.name} in stock.`);
      const charged = Math.min(sub.priceCents * resolution.quantity, item.lineTotalCents);
      await client.query(
        `UPDATE order_items SET fulfilment_status = 'substituted', substitute_product_id = $2, substitute_name = $3,
                substitute_unit_label = $4, substitute_unit_price_cents = $5, substitute_quantity = $6, charged_cents = $7
         WHERE id = $1`,
        [itemId, resolution.productId, sub.name, sub.unitLabel, sub.priceCents, resolution.quantity, charged],
      );
      await setStockContext(client, { reason: 'substitution', orderId, userId: actor.id ?? null, note: `Instead of ${item.name}` });
      await client.query('UPDATE inventory SET quantity = quantity - $2 WHERE product_id = $1', [resolution.productId, resolution.quantity]);
      const subLabel = `${resolution.quantity} × ${sub.name} (${sub.unitLabel})`;
      details = { en: PHRASES.substituted.en(item.name, subLabel), ta: PHRASES.substituted.ta(item.name, subLabel) };
      await addOrderEvent(client, orderId, actor, {
        type: 'item_substituted',
        message: `${item.name} was replaced with ${subLabel}, charged ${formatMoney(charged)}`,
        details: { itemId, substituteProductId: resolution.productId },
        visibleToCustomer: true,
      });
    }

    // New totals: bundle offers only count items still supplied as ordered.
    const settings = await getStoreSettings(client);
    const { rows: lines } = await client.query<{ productId: number; quantity: number; unitPriceCents: number; chargedCents: number; fulfilmentStatus: string }>(
      `SELECT product_id AS "productId", quantity, unit_price_cents AS "unitPriceCents", charged_cents AS "chargedCents",
              fulfilment_status AS "fulfilmentStatus" FROM order_items WHERE order_id = $1`,
      [orderId],
    );
    const subtotal = lines.reduce((sum, l) => sum + l.chargedCents, 0);
    const promotions = await applyPromotions(client, settings, lines.filter((l) => l.fulfilmentStatus === 'ordered'));
    const discount = Math.min(promotions.discountCents, subtotal);
    let loyaltyDiscount = order.loyaltyDiscountCents;
    let pointsRedeemed = order.loyaltyPointsRedeemed;
    const maxLoyalty = Math.max(0, subtotal + order.deliveryFeeCents - discount);
    if (loyaltyDiscount > maxLoyalty && pointsRedeemed > 0) {
      const perPoint = loyaltyDiscount / pointsRedeemed;
      const keepPoints = Math.floor(maxLoyalty / perPoint);
      await client.query(`INSERT INTO loyalty_ledger (user_id, order_id, points, reason) VALUES ($1, $2, $3, 'redeem_reversed')`, [
        order.userId,
        orderId,
        pointsRedeemed - keepPoints,
      ]);
      pointsRedeemed = keepPoints;
      loyaltyDiscount = Math.round(keepPoints * perPoint);
    }
    const total = subtotal + order.deliveryFeeCents - discount - loyaltyDiscount;
    await client.query('DELETE FROM order_promotions WHERE order_id = $1', [orderId]);
    for (const p of promotions.applied) {
      await client.query('INSERT INTO order_promotions (order_id, promotion_id, name, times_applied, discount_cents) VALUES ($1, $2, $3, $4, $5)', [
        orderId,
        p.promotionId,
        p.name,
        p.timesApplied,
        p.discountCents,
      ]);
    }
    await client.query(
      `UPDATE orders SET subtotal_cents = $2, discount_cents = $3, loyalty_discount_cents = $4, loyalty_points_redeemed = $5, total_cents = $6 WHERE id = $1`,
      [orderId, subtotal, discount, loyaltyDiscount, pointsRedeemed, total],
    );
    await notifyCustomer(client, {
      userId: order.userId,
      orderId,
      event: 'order_updated',
      vars: (lang) => ({ details: details[lang], total: formatMoney(total) }),
    });

    const { rows: paidRows } = await client.query<{ paid: number; refunded: number }>(
      `SELECT COALESCE((SELECT sum(amount_cents) FROM payments WHERE order_id = $1 AND status = 'paid'), 0)::int AS paid,
              COALESCE((SELECT sum(amount_cents) FROM refunds WHERE order_id = $1 AND status <> 'failed'), 0)::int AS refunded`,
      [orderId],
    );
    return { refundDue: paidRows[0].paid - paidRows[0].refunded - total };
  });

  if (outcome.refundDue > 0) {
    await refundOrderAmount(orderId, outcome.refundDue, resolution.type === 'unavailable' ? 'Item unavailable' : 'Cheaper substitute', actor);
  }
}

// --------------------------------------------------------------------------
// UPI orders: switch to pay on delivery, expire unpaid orders
// --------------------------------------------------------------------------
export async function switchToPayOnDelivery(orderId: number, userId: number) {
  await refreshOrderPayments(orderId).catch(() => {});
  await withTransaction(async (client) => {
    const { rows } = await client.query<{ userId: number; status: OrderStatus; totalCents: number }>(
      'SELECT user_id AS "userId", status, total_cents AS "totalCents" FROM orders WHERE id = $1 FOR UPDATE',
      [orderId],
    );
    const order = rows[0];
    if (!order || order.userId !== userId) throw notFound('Order');
    if (order.status !== 'awaiting_payment') throw conflict('PAYMENT_NOT_NEEDED', 'This order is no longer waiting for a payment.');
    await client.query(`UPDATE payments SET status = 'cancelled', cancelled_at = now() WHERE order_id = $1 AND status IN ('created', 'pending')`, [orderId]);
    await client.query(
      `UPDATE orders SET status = 'confirmed', payment_method = 'pay_on_fulfillment', payment_status = 'unpaid', payment_due_by = NULL WHERE id = $1`,
      [orderId],
    );
    await client.query(`INSERT INTO order_status_history (order_id, status, note, changed_by) VALUES ($1, 'confirmed', 'Changed to pay on delivery/collection', $2)`, [
      orderId,
      userId,
    ]);
    await addOrderEvent(client, orderId, { id: userId, role: 'customer' }, {
      type: 'payment_method_changed',
      message: 'Customer chose to pay on delivery/collection instead of UPI',
      visibleToCustomer: true,
    });
    await notifyCustomer(client, { userId, orderId, event: 'order_confirmed', vars: { total: formatMoney(order.totalCents) } });
  });
  flushWhatsAppQueueSoon();
}

/** Cancels UPI orders that weren't paid in time (after checking with the gateway one last time). */
export async function expireUnpaidOrders(): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM orders WHERE status = 'awaiting_payment' AND payment_due_by < now() ORDER BY payment_due_by LIMIT 20`,
  );
  let expired = 0;
  for (const { id } of rows) {
    try {
      await refreshOrderPayments(id);
      await cancelOrder(id, SYSTEM, 'Payment was not completed in time');
      expired++;
    } catch {
      // Paid at the last moment, or cancelled by someone else meanwhile — nothing to do.
    }
  }
  return expired;
}

let lastMaintenance = 0;

/**
 * Housekeeping that also runs on hosts without background jobs (e.g. Vercel):
 * cancels expired unpaid orders and sends queued WhatsApp messages. Called
 * from busy routes, at most once every 30 seconds per server instance.
 */
export async function runMaintenance({ force = false } = {}): Promise<void> {
  if (!force && Date.now() - lastMaintenance < 30_000) return;
  lastMaintenance = Date.now();
  try {
    await expireUnpaidOrders();
    await flushWhatsAppQueue();
  } catch (err) {
    logError('Maintenance (expiring unpaid orders, sending WhatsApp messages)', err);
  }
}

// --------------------------------------------------------------------------
// Reorder
// --------------------------------------------------------------------------
/** The products from a past order, with today's prices and stock, ready to add to the cart. */
export async function reorderItems(db: Db, orderId: number, customerId: number) {
  const { rows: owner } = await db.query('SELECT 1 FROM orders WHERE id = $1 AND user_id = $2', [orderId, customerId]);
  if (!owner.length) throw notFound('Order');
  const { rows } = await db.query<{ productId: number; quantity: number; isActive: boolean; stock: number }>(
    `SELECT oi.product_id AS "productId", oi.quantity, (p.is_active AND c.is_active) AS "isActive", i.quantity AS stock
     FROM order_items oi JOIN products p ON p.id = oi.product_id JOIN categories c ON c.id = p.category_id
     JOIN inventory i ON i.product_id = p.id
     WHERE oi.order_id = $1 ORDER BY oi.id`,
    [orderId],
  );
  return rows.map((r) => ({
    productId: r.productId,
    quantity: Math.min(r.quantity, Math.max(r.isActive ? r.stock : 0, 0)),
    requestedQuantity: r.quantity,
    available: r.isActive && r.stock > 0,
  }));
}

export const paymentProviderLabel = () => (currentProvider() === 'razorpay' ? 'Razorpay' : 'DEMO');
