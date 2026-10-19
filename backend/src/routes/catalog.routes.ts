// Public catalogue: store info, categories, products. No login needed.
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { notFound } from '../lib/errors.js';
import { parsePhoneList } from '../lib/phone.js';
import { idParam, parse, queryBoolean } from '../lib/validation.js';
import { findProducts, getProductRow, toPublicProduct } from '../services/catalog.service.js';
import { listZones } from '../services/delivery.service.js';

export const catalogRouter = Router();

catalogRouter.get('/store', async (_req, res) => {
  const zones = await listZones(pool, { activeOnly: true });
  const phones = parsePhoneList(config.STORE_PHONE);
  res.json({
    name: config.STORE_NAME,
    address: config.STORE_ADDRESS,
    phone: phones[0]?.display ?? '', // the first number (kept for older app versions)
    phones,
    currency: config.CURRENCY,
    timezone: config.STORE_TIMEZONE,
    pickup: {
      openHour: config.PICKUP_OPEN_HOUR,
      closeHour: config.PICKUP_CLOSE_HOUR,
      slotMinutes: config.PICKUP_SLOT_MINUTES,
      leadTimeMinutes: config.PICKUP_LEAD_TIME_MINUTES,
    },
    deliveryZones: zones.map((zone) => ({
      name: zone.name,
      postcodePrefixes: zone.postcodePrefixes,
      feeCents: zone.feeCents,
      freeDeliveryThresholdCents: zone.freeDeliveryThresholdCents,
      minOrderCents: zone.minOrderCents,
    })),
    paymentMethods: [
      {
        id: 'pay_on_fulfillment',
        label: 'Pay on delivery or collection',
        description: 'Pay by card or cash when you receive your order.',
        isDemo: false,
      },
      {
        id: 'demo_card',
        label: 'Demo card payment',
        description: 'DEMO ONLY — no card details are collected and no money is taken.',
        isDemo: true,
      },
    ],
  });
});

catalogRouter.get('/categories', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.slug, c.description, c.icon,
            count(p.id) FILTER (WHERE p.is_active) AS "productCount"
     FROM categories c
     LEFT JOIN products p ON p.category_id = c.id
     WHERE c.is_active
     GROUP BY c.id
     ORDER BY c.sort_order, c.name`,
  );
  res.json({ items: rows });
});

const productQuery = z.object({
  search: z.string().trim().max(100).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  ids: z
    .string()
    .regex(/^\d+(,\d+)*$/, 'ids must look like 1,2,3')
    .transform((value) => value.split(',').map(Number))
    .optional(),
  inStock: queryBoolean.optional(),
  minPriceCents: z.coerce.number().int().min(0).optional(),
  maxPriceCents: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['relevance', 'name', 'price_asc', 'price_desc', 'newest']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

catalogRouter.get('/products', async (req, res) => {
  const query = parse(productQuery, req.query);
  const { rows, total } = await findProducts(pool, { ...query, search: query.search || undefined, status: 'active' });
  res.json({ items: rows.map(toPublicProduct), total, page: query.page, pageSize: query.pageSize });
});

catalogRouter.get('/products/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const row = await getProductRow(pool, id);
  if (!row.isActive || !row.categoryIsActive) throw notFound('Product');
  res.json({ product: toPublicProduct(row) });
});
