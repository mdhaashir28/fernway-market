// /api/staff/products — create, edit, deactivate products; stock and images.
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { pool, withTransaction, type Db } from '../../db/pool.js';
import { badRequest } from '../../lib/errors.js';
import { idParam, optionalIcon, optionalText, parse, queryBoolean } from '../../lib/validation.js';
import { findProducts, getProductRow, toStaffProduct } from '../../services/catalog.service.js';
import { ALLOWED_IMAGE_TYPES, deleteImage, looksLikeImage, saveImage } from '../../services/image.service.js';

export const staffProductsRouter = Router();

// ---------------------------------------------------------------------------
// List / read
// ---------------------------------------------------------------------------
const listQuery = z.object({
  search: z.string().trim().max(100).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  status: z.enum(['active', 'inactive', 'all']).default('all'),
  lowStock: queryBoolean.optional(),
  missingPhoto: queryBoolean.optional(),
  sort: z.enum(['name', 'price_asc', 'price_desc', 'newest', 'stock_asc']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

staffProductsRouter.get('/', async (req, res) => {
  const query = parse(listQuery, req.query);
  const { rows, total } = await findProducts(pool, { ...query, search: query.search || undefined });
  res.json({ items: rows.map(toStaffProduct), total, page: query.page, pageSize: query.pageSize });
});

staffProductsRouter.get('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  res.json({ product: toStaffProduct(await getProductRow(pool, id)) });
});

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------
const productFields = {
  name: z.string({ error: 'Name is required' }).trim().min(1, 'Name is required').max(120),
  categoryId: z.number({ error: 'Choose a category' }).int().positive('Choose a category'),
  brand: optionalText(60),
  description: z.string().trim().max(2000),
  priceCents: z
    .number({ error: 'Price is required' })
    .int('Price must be a whole number of cents')
    .min(1, 'Price must be more than zero')
    .max(10_000_000),
  unitLabel: z.string().trim().min(1, 'Unit is required, e.g. "each" or "1 kg"').max(40),
  sku: optionalText(40),
  icon: optionalIcon,
  isActive: z.boolean(),
  stockQuantity: z.number().int('Stock must be a whole number').min(0, 'Stock cannot be negative').max(1_000_000),
  lowStockThreshold: z.number().int().min(0, 'Threshold cannot be negative').max(100_000),
};

const createSchema = z.object(productFields).partial({
  brand: true,
  description: true,
  unitLabel: true,
  sku: true,
  icon: true,
  isActive: true,
  stockQuantity: true,
  lowStockThreshold: true,
});
const updateSchema = z.object(productFields).partial();

async function assertCategoryExists(db: Db, categoryId: number) {
  const { rowCount } = await db.query('SELECT 1 FROM categories WHERE id = $1', [categoryId]);
  if (!rowCount) throw badRequest('That category does not exist.');
}

staffProductsRouter.post('/', async (req, res) => {
  const body = parse(createSchema, req.body);

  const productId = await withTransaction(async (client) => {
    await assertCategoryExists(client, body.categoryId);
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO products (category_id, sku, name, brand, description, price_cents, unit_label, icon, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        body.categoryId,
        body.sku ?? null,
        body.name,
        body.brand ?? null,
        body.description ?? '',
        body.priceCents,
        body.unitLabel ?? 'each',
        body.icon ?? null,
        body.isActive ?? true,
      ],
    );
    await client.query('INSERT INTO inventory (product_id, quantity, low_stock_threshold) VALUES ($1, $2, $3)', [
      rows[0].id,
      body.stockQuantity ?? 0,
      body.lowStockThreshold ?? 10,
    ]);
    return rows[0].id;
  });

  res.status(201).json({ product: toStaffProduct(await getProductRow(pool, productId)) });
});

/** Builds "col1 = $2, col2 = $3" for only the fields that were sent. */
function buildSet(body: Record<string, unknown>, columns: Record<string, string>, params: unknown[]) {
  const sets: string[] = [];
  for (const [field, column] of Object.entries(columns)) {
    if (body[field] !== undefined) {
      params.push(body[field]);
      sets.push(`${column} = $${params.length}`);
    }
  }
  return sets;
}

// PATCH: send only the fields you want to change. "Deactivate" = { "isActive": false }.
staffProductsRouter.patch('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const body = parse(updateSchema, req.body);

  await withTransaction(async (client) => {
    await getProductRow(client, id); // 404 if it doesn't exist
    if (body.categoryId) await assertCategoryExists(client, body.categoryId);

    const productParams: unknown[] = [id];
    const productSets = buildSet(
      body,
      {
        name: 'name',
        categoryId: 'category_id',
        brand: 'brand',
        description: 'description',
        priceCents: 'price_cents',
        unitLabel: 'unit_label',
        sku: 'sku',
        icon: 'icon',
        isActive: 'is_active',
      },
      productParams,
    );
    if (productSets.length) await client.query(`UPDATE products SET ${productSets.join(', ')} WHERE id = $1`, productParams);

    const stockParams: unknown[] = [id];
    const stockSets = buildSet(body, { stockQuantity: 'quantity', lowStockThreshold: 'low_stock_threshold' }, stockParams);
    if (stockSets.length) await client.query(`UPDATE inventory SET ${stockSets.join(', ')} WHERE product_id = $1`, stockParams);
  });

  res.json({ product: toStaffProduct(await getProductRow(pool, id)) });
});

// ---------------------------------------------------------------------------
// Stock adjustments: { "adjustBy": 24 } to receive a delivery, { "adjustBy": -2 }
// for breakages, or { "quantity": 40 } after a stock count.
// "adjustBy" is safest while customers are ordering, because it never
// overwrites stock that was just sold.
// ---------------------------------------------------------------------------
const stockBody = z
  .object({
    quantity: z.number().int().min(0, 'Stock cannot be negative').optional(),
    adjustBy: z.number().int().optional(),
  })
  .refine((body) => (body.quantity === undefined) !== (body.adjustBy === undefined), {
    message: 'Send either "quantity" or "adjustBy", not both.',
  });

staffProductsRouter.post('/:id/stock', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const body = parse(stockBody, req.body);
  await getProductRow(pool, id);
  if (body.adjustBy !== undefined) {
    // The CHECK (quantity >= 0) constraint rejects adjustments that would go below zero.
    await pool.query('UPDATE inventory SET quantity = quantity + $2 WHERE product_id = $1', [id, body.adjustBy]);
  } else {
    await pool.query('UPDATE inventory SET quantity = $2 WHERE product_id = $1', [id, body.quantity]);
  }
  res.json({ product: toStaffProduct(await getProductRow(pool, id)) });
});

// ---------------------------------------------------------------------------
// Product images. Where they are kept depends on IMAGE_STORAGE: files in
// backend/uploads/products/ ("disk"), or inside the database ("database").
// ---------------------------------------------------------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES[file.mimetype]) cb(null, true);
    else cb(badRequest('Please upload a JPG, PNG or WebP image.'));
  },
});

staffProductsRouter.post('/:id/image', upload.single('image'), async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('Please choose an image to upload (form field "image").');
  const { id } = parse(idParam, req.params);
  if (!looksLikeImage(file.buffer)) throw badRequest('That file does not look like a JPG, PNG or WebP image.');

  const before = await getProductRow(pool, id); // 404 before anything is saved
  const imageUrl = await saveImage(file.buffer, file.mimetype);
  await pool.query('UPDATE products SET image_url = $2 WHERE id = $1', [id, imageUrl]);
  await deleteImage(before.imageUrl);
  res.json({ product: toStaffProduct(await getProductRow(pool, id)) });
});

staffProductsRouter.delete('/:id/image', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const before = await getProductRow(pool, id);
  await pool.query('UPDATE products SET image_url = NULL WHERE id = $1', [id]);
  await deleteImage(before.imageUrl);
  res.json({ product: toStaffProduct(await getProductRow(pool, id)) });
});
