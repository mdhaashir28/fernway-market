// /api/staff/categories and /api/staff/delivery-zones
// Everyone on the staff can view them; only managers can change them.
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { notFound } from '../../lib/errors.js';
import { idParam, optionalText, parse } from '../../lib/validation.js';
import { imageCredit } from '../../services/image-credits.js';
import { requireManager } from '../../middleware/auth.js';
import { ZONE_COLUMNS, normalizePostcode } from '../../services/delivery.service.js';
import { deleteImage, saveImage } from '../../services/image.service.js';
import { imageUpload, readUploadedImage } from './staff-products.routes.js';

export const staffCatalogRouter = Router();

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
const CATEGORY_COLUMNS = `
  c.id, c.name, c.name_ta AS "nameTa", c.slug, c.description, c.image_url AS "imageUrl", c.image_source AS "imageSource",
  c.sort_order AS "sortOrder", c.is_active AS "isActive",
  (SELECT count(*) FROM products p WHERE p.category_id = c.id) AS "productCount"`;

/** One category as JSON, with the credit for its photo. */
async function loadCategory(id: number) {
  const { rows } = await pool.query<{ imageUrl: string | null; imageSource: string | null }>(`SELECT ${CATEGORY_COLUMNS} FROM categories c WHERE c.id = $1`, [id]);
  if (!rows[0]) throw notFound('Category');
  return withCredit(rows[0]);
}
const withCredit = <T extends { imageUrl: string | null; imageSource: string | null }>(row: T) => ({ ...row, imageCredit: imageCredit(row.imageUrl, row.imageSource) });

/** Where an uploaded photo came from (multipart field "source"), e.g. "Taken in our shop". */
const photoSource = z.object({ source: optionalText(200) });

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'category';

const categoryFields = {
  name: z.string({ error: 'Name is required' }).trim().min(1, 'Name is required').max(60),
  nameTa: optionalText(60),
  description: z.string().trim().max(300),
  sortOrder: z.number().int().min(0).max(10_000),
  isActive: z.boolean(),
};
const createCategory = z.object(categoryFields).partial({ nameTa: true, description: true, sortOrder: true, isActive: true });
const updateCategory = z.object(categoryFields).partial();

staffCatalogRouter.get('/categories', async (_req, res) => {
  const { rows } = await pool.query<{ imageUrl: string | null; imageSource: string | null }>(
    `SELECT ${CATEGORY_COLUMNS} FROM categories c ORDER BY c.sort_order, c.name`,
  );
  res.json({ items: rows.map(withCredit) });
});

staffCatalogRouter.post('/categories', requireManager, async (req, res) => {
  const body = parse(createCategory, req.body);
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO categories (name, name_ta, slug, description, sort_order, is_active)
     VALUES ($1, $6, $2, $3, COALESCE($4, (SELECT COALESCE(max(sort_order), 0) + 1 FROM categories)), $5)
     RETURNING id`,
    [body.name, slugify(body.name), body.description ?? '', body.sortOrder ?? null, body.isActive ?? true, body.nameTa ?? null],
  );
  res.status(201).json({ category: await loadCategory(rows[0].id) });
});

// Deactivating a category ({ "isActive": false }) hides it and its products from customers.
// The slug (used in links and by the sample data) stays the same when a category is renamed.
staffCatalogRouter.patch('/categories/:id', requireManager, async (req, res) => {
  const { id } = parse(idParam, req.params);
  const body = parse(updateCategory, req.body);
  const { rowCount } = await pool.query(
    `UPDATE categories SET
       name = COALESCE($2, name),
       name_ta = CASE WHEN $7::boolean THEN $3 ELSE name_ta END,
       description = COALESCE($4, description),
       sort_order = COALESCE($5, sort_order),
       is_active = COALESCE($6, is_active)
     WHERE id = $1`,
    [id, body.name ?? null, body.nameTa ?? null, body.description ?? null, body.sortOrder ?? null, body.isActive ?? null, body.nameTa !== undefined],
  );
  if (!rowCount) throw notFound('Category');
  res.json({ category: await loadCategory(id) });
});

/** Category photo (shown on the category tiles in the app). */
staffCatalogRouter.post('/categories/:id/image', requireManager, imageUpload.single('image'), async (req, res) => {
  const { id } = parse(idParam, req.params);
  const data = await readUploadedImage(req.file);
  const { source } = parse(photoSource, req.body ?? {});
  const { rows } = await pool.query<{ imageUrl: string | null }>('SELECT image_url AS "imageUrl" FROM categories WHERE id = $1', [id]);
  if (!rows[0]) throw notFound('Category');
  const imageUrl = await saveImage(data, 'categories');
  await pool.query('UPDATE categories SET image_url = $2, image_source = $3 WHERE id = $1', [id, imageUrl, source ?? null]);
  await deleteImage(rows[0].imageUrl);
  res.json({ category: await loadCategory(id) });
});

staffCatalogRouter.delete('/categories/:id/image', requireManager, async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { rows } = await pool.query<{ imageUrl: string | null }>('SELECT image_url AS "imageUrl" FROM categories WHERE id = $1', [id]);
  if (!rows[0]) throw notFound('Category');
  await pool.query('UPDATE categories SET image_url = NULL, image_source = NULL WHERE id = $1', [id]);
  await deleteImage(rows[0].imageUrl);
  res.json({ category: await loadCategory(id) });
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

staffCatalogRouter.post('/delivery-zones', requireManager, async (req, res) => {
  const body = parse(createZone, req.body);
  const { rows } = await pool.query(
    `INSERT INTO delivery_zones (name, postcode_prefixes, fee_cents, free_delivery_threshold_cents, min_order_cents, is_active)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${ZONE_COLUMNS}`,
    [body.name, body.postcodePrefixes, body.feeCents, body.freeDeliveryThresholdCents ?? null, body.minOrderCents ?? 0, body.isActive ?? true],
  );
  res.status(201).json({ zone: rows[0] });
});

staffCatalogRouter.patch('/delivery-zones/:id', requireManager, async (req, res) => {
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
