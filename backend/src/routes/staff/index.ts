// /api/staff — everything here requires a logged-in STAFF account.
import { Router } from 'express';
import { config } from '../../config.js';
import { pool } from '../../db/pool.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { staffCatalogRouter } from './staff-catalog.routes.js';
import { staffOrdersRouter } from './staff-orders.routes.js';
import { staffProductsRouter } from './staff-products.routes.js';

export const staffRouter = Router();
staffRouter.use(requireAuth, requireRole('staff'));

/** Numbers for the dashboard overview tiles. */
staffRouter.get('/summary', async (_req, res) => {
  const [orders, stock] = await Promise.all([
    pool.query(
      `WITH today AS (SELECT (date_trunc('day', now() AT TIME ZONE $1)) AT TIME ZONE $1 AS start)
       SELECT
         count(*) FILTER (WHERE status = 'pending')          AS pending,
         count(*) FILTER (WHERE status = 'preparing')        AS preparing,
         count(*) FILTER (WHERE status = 'ready_for_pickup') AS "readyForPickup",
         count(*) FILTER (WHERE status = 'out_for_delivery') AS "outForDelivery",
         count(*) FILTER (WHERE created_at >= today.start)   AS "ordersToday",
         COALESCE(sum(total_cents) FILTER (WHERE created_at >= today.start AND status <> 'cancelled'), 0) AS "salesTodayCents"
       FROM orders, today`,
      [config.STORE_TIMEZONE],
    ),
    pool.query(
      `SELECT
         count(*) FILTER (WHERE i.quantity <= i.low_stock_threshold) AS "lowStock",
         count(*) FILTER (WHERE i.quantity = 0)                      AS "outOfStock"
       FROM products p JOIN inventory i ON i.product_id = p.id
       WHERE p.is_active`,
    ),
  ]);
  res.json({ orders: orders.rows[0], stock: stock.rows[0], currency: config.CURRENCY, timezone: config.STORE_TIMEZONE });
});

staffRouter.use('/orders', staffOrdersRouter);
staffRouter.use('/products', staffProductsRouter);
staffRouter.use('/', staffCatalogRouter);
