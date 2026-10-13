// /api/staff/categories and /api/staff/delivery-zones
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { notFound } from '../../lib/errors.js';
import { idParam, optionalIcon, parse } from '../../lib/validation.js';
import { ZONE_COLUMNS, normalizePostcode } from '../../services/delivery.service.js';

export const staffCatalogRouter = Router();

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
const CATEGORY_COLUMNS = `
  c.id, c.name, c.slug, c.description, c.icon, c.sort_order AS "sortOrder", c.is_active AS "isActive",
  (SELECT count(*) FROM products p WHERE p.category_id = c.id) AS "productCount"`;

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'category';

const categoryFields = {
  name: z.string({ error: 'Name is required' }).trim().min(1, 'Name is required').max(60),
  description: z.string().trim().max(300),
  icon: optionalIcon,
  sortOrder: z.number().int().min(0).max(10_000),
  isActive: z.boolean(),
};
const createCategory = z.object(categoryFields).partial({ description: true, icon: true, sortOrder: true, isActive: true });
const updateCategory = z.object(categoryFields).partial();

staffCatalogRouter.get('/categories', async (_req, res) => {
  const { rows } = await pool.query(`SELECT ${CATEGORY_COLUMNS} FROM categories c ORDER BY c.sort_order, c.name`);
  res.json({ items: rows });
});

staffCatalogRouter.post('/categories', async (req, res) => {
  const body = parse(createCategory, req.body);
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO categories (name, slug, description, icon, sort_order, is_active)
     VALUES ($1, $2, $3, COALESCE($4, '🛒'), COALESCE($5, (SELECT COALESCE(max(sort_order), 0) + 1 FROM categories)), $6)
     RETURNING id`,
    [body.name, slugify(body.name), body.description ?? '', body.icon ?? null, body.sortOrder ?? null, body.isActive ?? true],
  );
  const result = await pool.query(`SELECT ${CATEGORY_COLUMNS} FROM categories c WHERE c.id = $1`, [rows[0].id]);
  res.status(201).json({ category: result.rows[0] });
});

// Deactivating a category ({ "isActive": false }) hides it and its products from customers.
staffCatalogRouter.patch('/categories/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const body = parse(updateCategory, req.body);
  const { rowCount } = await pool.query(
    `UPDATE categories SET
       name = COALESCE($2, name),
       slug = COALESCE($3, slug),
       description = COALESCE($4, description),
       icon = COALESCE($5, icon),
       sort_order = COALESCE($6, sort_order),
       is_active = COALESCE($7, is_active)
     WHERE id = $1`,
    [id, body.name ?? null, body.name ? slugify(body.name) : null, body.description ?? null, body.icon ?? null, body.sortOrder ?? null, body.isActive ?? null],
  );
  if (!rowCount) throw notFound('Category');
  const result = await pool.query(`SELECT ${CATEGORY_COLUMNS} FROM categories c WHERE c.id = $1`, [id]);
  res.json({ category: result.rows[0] });
});

// ---------------------------------------------------------------------------
// Delivery zones (the delivery service area)
// ---------------------------------------------------------------------------
const zoneFields = {
  name: z.string({ error: 'Name is required' }).trim().min(1, 'Name is required').max(60),
  postcodePrefixes: z
    .array(z.string().trim().regex(/^[A-Za-z0-9 ]{1,10}$/, 'Postcode prefixes can only contain letters and numbers'))
    .min(1, 'Add at least one postcode prefix')
    .max(200)
    .transform((list) => [...new Set(list.map(normalizePostcode).filter(Boolean))]),
  feeCents: z.number({ error: 'Delivery fee is required' }).int().min(0).max(100_000),
  freeDeliveryThresholdCents: z.number().int().positive().nullable(),
  minOrderCents: z.number().int().min(0).max(10_000_000),
  isActive: z.boolean(),
};
const createZone = z.object(zoneFields).partial({ freeDeliveryThresholdCents: true, minOrderCents: true, isActive: true });
const updateZone = z.object(zoneFields).partial();

staffCatalogRouter.get('/delivery-zones', async (_req, res) => {
  const { rows } = await pool.query(`SELECT ${ZONE_COLUMNS} FROM delivery_zones ORDER BY name`);
  res.json({ items: rows });
});

staffCatalogRouter.post('/delivery-zones', async (req, res) => {
  const body = parse(createZone, req.body);
  const { rows } = await pool.query(
    `INSERT INTO delivery_zones (name, postcode_prefixes, fee_cents, free_delivery_threshold_cents, min_order_cents, is_active)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${ZONE_COLUMNS}`,
    [body.name, body.postcodePrefixes, body.feeCents, body.freeDeliveryThresholdCents ?? null, body.minOrderCents ?? 0, body.isActive ?? true],
  );
  res.status(201).json({ zone: rows[0] });
});

staffCatalogRouter.patch('/delivery-zones/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const body = parse(updateZone, req.body);
  const { rows } = await pool.query(
    `UPDATE delivery_zones SET
       name = COALESCE($2, name),
       postcode_prefixes = COALESCE($3, postcode_prefixes),
       fee_cents = COALESCE($4, fee_cents),
       free_delivery_threshold_cents = CASE WHEN $5::boolean THEN $6::int ELSE free_delivery_threshold_cents END,
       min_order_cents = COALESCE($7, min_order_cents),
       is_active = COALESCE($8, is_active)
     WHERE id = $1
     RETURNING ${ZONE_COLUMNS}`,
    [
      id,
      body.name ?? null,
      body.postcodePrefixes ?? null,
      body.feeCents ?? null,
      body.freeDeliveryThresholdCents !== undefined, // null means "remove free delivery"
      body.freeDeliveryThresholdCents ?? null,
      body.minOrderCents ?? null,
      body.isActive ?? null,
    ],
  );
  if (!rows[0]) throw notFound('Delivery zone');
  res.json({ zone: rows[0] });
});
