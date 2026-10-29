// /api/staff — everything here requires a logged-in STAFF or MANAGER account.
// Routes that only managers may use say so with requireManager.
import { Router } from 'express';
import { config } from '../../config.js';
import { pool } from '../../db/pool.js';
import { requireAuth, requireStaff } from '../../middleware/auth.js';
import { runMaintenance } from '../../services/order.service.js';
import { staffAdminRouter } from './staff-admin.routes.js';
import { staffCatalogRouter } from './staff-catalog.routes.js';
import { staffOrdersRouter } from './staff-orders.routes.js';
import { staffProductsRouter } from './staff-products.routes.js';

export const staffRouter = Router();
staffRouter.use(requireAuth, requireStaff);

/** Numbers for the dashboard overview tiles. */
staffRouter.get('/summary', async (_req, res) => {
  await runMaintenance();
  const [orders, stock, other] = await Promise.all([
    pool.query(
      `WITH today AS (SELECT (date_trunc('day', now() AT TIME ZONE $1)) AT TIME ZONE $1 AS start)
       SELECT
         count(*) FILTER (WHERE status = 'awaiting_payment') AS "awaitingPayment",
         count(*) FILTER (WHERE status = 'confirmed')        AS confirmed,
         count(*) FILTER (WHERE status = 'preparing')        AS preparing,
         count(*) FILTER (WHERE status = 'ready_for_pickup') AS "readyForPickup",
         count(*) FILTER (WHERE status = 'out_for_delivery') AS "outForDelivery",
         count(*) FILTER (WHERE created_at >= today.start AND status <> 'awaiting_payment') AS "ordersToday",
         COALESCE(sum(total_cents - refunded_cents) FILTER (
           WHERE created_at >= today.start AND status NOT IN ('cancelled', 'awaiting_payment')), 0) AS "salesTodayCents"
       FROM orders, today`,
      [config.STORE_TIMEZONE],
    ),
    pool.query(
      `SELECT
         count(*) FILTER (WHERE i.quantity <= i.low_stock_threshold) AS "lowStock",
         count(*) FILTER (WHERE i.quantity = 0)                      AS "outOfStock",
         count(*) FILTER (WHERE p.image_url IS NULL)                 AS "missingPhoto"
       FROM products p JOIN inventory i ON i.product_id = p.id
       WHERE p.is_active`,
    ),
    pool.query(
      `SELECT
         (SELECT count(*) FROM support_requests WHERE status = 'open') AS "openSupportRequests",
         (SELECT count(*) FROM refunds WHERE status = 'failed'
            AND NOT EXISTS (SELECT 1 FROM refunds r2 WHERE r2.order_id = refunds.order_id AND r2.created_at > refunds.created_at)) AS "failedRefunds",
         (SELECT count(*) FROM whatsapp_messages WHERE status = 'failed' AND created_at > now() - interval '7 days') AS "failedWhatsApp"`,
    ),
  ]);
  res.json({
    orders: { ...orders.rows[0], pending: orders.rows[0].confirmed },
    stock: stock.rows[0],
    attention: other.rows[0],
    currency: config.CURRENCY,
    timezone: config.STORE_TIMEZONE,
    // demo (practice page) · test (Razorpay test keys, no real money) · live (real money)
    paymentsMode: config.paymentsEnvironment,
    whatsappMode: config.WHATSAPP_MODE,
  });
});

staffRouter.use('/orders', staffOrdersRouter);
staffRouter.use('/products', staffProductsRouter);
staffRouter.use('/', staffAdminRouter);
staffRouter.use('/', staffCatalogRouter);
