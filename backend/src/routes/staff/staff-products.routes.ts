// /api/staff/products — products, stock, photos and stock history.
//   Staff and managers: view, adjust stock (with a reason), upload photos, see stock history.
//   Managers only: create products and change details or prices.
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { pool, withTransaction, type Db } from '../../db/pool.js';
import { badRequest } from '../../lib/errors.js';
import { orderNumber } from '../../lib/order-number.js';
import { idParam, optionalText, parse, queryBoolean } from '../../lib/validation.js';
import { currentUser, requireManager } from '../../middleware/auth.js';
import { setStockContext, STOCK_REASON_LABELS } from '../../services/audit.service.js';
import { findProducts, getProductRow, toStaffProduct } from '../../services/catalog.service.js';
import { ALLOWED_IMAGE_TYPES, deleteImage, looksLikeImage, optimizeImage, saveImage } from '../../services/image.service.js';

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

/** Every change to this product's stock: when, how much, why and by whom. */
staffProductsRouter.get('/:id/history', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { page, pageSize } = parse(
    z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(30) }),
    req.query,
  );
  await getProductRow(pool, id); // 404 if it doesn't exist
  const { rows } = await pool.query<{ reason: keyof typeof STOCK_REASON_LABELS; orderId: number | null; totalCount: number }>(
    `SELECT m.id, m.change, m.quantity_after AS "quantityAfter", m.reason, m.order_id AS "orderId", m.note,
            u.name AS "userName", u.role AS "userRole", m.created_at AS "createdAt", count(*) OVER () AS "totalCount"
     FROM inventory_movements m LEFT JOIN users u ON u.id = m.user_id
     WHERE m.product_id = $1
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT $2 OFFSET $3`,
    [id, pageSize, (page - 1) * pageSize],
  );
  res.json({
    items: rows.map(({ totalCount: _t, ...m }) => ({
      ...m,
      reasonLabel: STOCK_REASON_LABELS[m.reason] ?? m.reason,
      orderNumber: m.orderId ? orderNumber(m.orderId) : null,
    })),
    total: rows[0]?.totalCount ?? 0,
    page,
    pageSize,
  });
});

// ---------------------------------------------------------------------------
// Create / update (managers)
// ---------------------------------------------------------------------------
const productFields = {
  name: z.string({ error: 'Name is required' }).trim().min(1, 'Name is required').max(120),
  nameTa: optionalText(120),
  categoryId: z.number({ error: 'Choose a category' }).int().positive('Choose a category'),
  brand: optionalText(60),
  description: z.string().trim().max(2000),
  priceCents: z
    .number({ error: 'Price is required' })
    .int('Price must be a whole number of paise')
    .min(1, 'Price must be more than zero')
    .max(10_000_000),
  unitLabel: z.string().trim().min(1, 'Pack size is required, e.g. "1 kg" or "each"').max(40),
  sku: optionalText(40),
  isActive: z.boolean(),
  stockQuantity: z.number().int('Stock must be a whole number').min(0, 'Stock cannot be negative').max(1_000_000),
  lowStockThreshold: z.number().int().min(0, 'Threshold cannot be negative').max(100_000),
};

const createSchema = z.object(productFields).partial({
  nameTa: true,
  brand: true,
  description: true,
  unitLabel: true,
  sku: true,
  isActive: true,
  stockQuantity: true,
  lowStockThreshold: true,
});
// Stock is changed with POST /:id/stock (with a reason), not here.
const updateSchema = z.object(productFields).omit({ stockQuantity: true }).partial();

async function assertCategoryExists(db: Db, categoryId: number) {
  const { rowCount } = await db.query('SELECT 1 FROM categories WHERE id = $1', [categoryId]);
  if (!rowCount) throw badRequest('That category does not exist.');
}

staffProductsRouter.post('/', requireManager, async (req, res) => {
  const body = parse(createSchema, req.body);
  const user = currentUser(req);

  const productId = await withTransaction(async (client) => {
    await assertCategoryExists(client, body.categoryId);
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO products (category_id, sku, name, name_ta, brand, description, price_cents, unit_label, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        body.categoryId,
        body.sku ?? null,
        body.name,
        body.nameTa ?? null,
        body.brand ?? null,
        body.description ?? '',
        body.priceCents,
        body.unitLabel ?? 'each',
        body.isActive ?? true,
      ],
    );
    await setStockContext(client, { reason: 'new_product', userId: user.id });
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
staffProductsRouter.patch('/:id', requireManager, async (req, res) => {
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
        nameTa: 'name_ta',
        categoryId: 'category_id',
        brand: 'brand',
        description: 'description',
        priceCents: 'price_cents',
        unitLabel: 'unit_label',
        sku: 'sku',
        isActive: 'is_active',
      },
      productParams,
    );
    if (productSets.length) await client.query(`UPDATE products SET ${productSets.join(', ')} WHERE id = $1`, productParams);

    if (body.lowStockThreshold !== undefined) {
      await client.query('UPDATE inventory SET low_stock_threshold = $2 WHERE product_id = $1', [id, body.lowStockThreshold]);
    }
  });

  res.json({ product: toStaffProduct(await getProductRow(pool, id)) });
});

// ---------------------------------------------------------------------------
// Stock adjustments (staff and managers), always with a reason:
//   { "adjustBy": 24, "reason": "delivery_received" }   a delivery arrived
//   { "adjustBy": -2, "reason": "damaged" }              broken / expired
//   { "quantity": 40 }                                   exact count after a stock check
// "adjustBy" is safest while customers are ordering, because it never
// overwrites stock that was just sold.
// ---------------------------------------------------------------------------
const stockBody = z
  .object({
    quantity: z.number().int().min(0, 'Stock cannot be negative').optional(),
    adjustBy: z.number().int().optional(),
    reason: z.enum(['delivery_received', 'damaged', 'stock_count', 'adjustment']).optional(),
    note: optionalText(200),
  })
  .refine((body) => (body.quantity === undefined) !== (body.adjustBy === undefined), {
    message: 'Send either "quantity" or "adjustBy", not both.',
  });

staffProductsRouter.post('/:id/stock', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const body = parse(stockBody, req.body);
  const user = currentUser(req);
  await getProductRow(pool, id);
  await withTransaction(async (client) => {
    const reason = body.reason ?? (body.quantity !== undefined ? 'stock_count' : body.adjustBy! > 0 ? 'delivery_received' : 'adjustment');
    await setStockContext(client, { reason, userId: user.id, note: body.note ?? null });
    if (body.adjustBy !== undefined) {
      // The CHECK (quantity >= 0) constraint rejects adjustments that would go below zero.
      await client.query('UPDATE inventory SET quantity = quantity + $2 WHERE product_id = $1', [id, body.adjustBy]);
    } else {
      await client.query('UPDATE inventory SET quantity = $2 WHERE product_id = $1', [id, body.quantity]);
    }
  });
  res.json({ product: toStaffProduct(await getProductRow(pool, id)) });
});

// ---------------------------------------------------------------------------
// Product photos (staff and managers). Uploads are resized and compressed
// for phones, then kept on disk or in the database (IMAGE_STORAGE).
// ---------------------------------------------------------------------------
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES[file.mimetype]) cb(null, true);
    else cb(badRequest('Please upload a JPG, PNG or WebP image.'));
  },
});

/** Checks and optimises an uploaded photo. */
export async function readUploadedImage(file: Express.Multer.File | undefined): Promise<Buffer> {
  if (!file) throw badRequest('Please choose an image to upload (form field "image").');
  if (!looksLikeImage(file.buffer)) throw badRequest('That file does not look like a JPG, PNG or WebP image.');
  try {
    return await optimizeImage(file.buffer);
  } catch {
    throw badRequest('That image could not be read. Please try a different photo.');
  }
}

staffProductsRouter.post('/:id/image', imageUpload.single('image'), async (req, res) => {
  const { id } = parse(idParam, req.params);
  const data = await readUploadedImage(req.file);
  // Where the photo came from (multipart field "source"), e.g. "Taken in our shop, Oct 2026".
  const { source } = parse(z.object({ source: optionalText(200) }), req.body ?? {});
  const before = await getProductRow(pool, id); // 404 before anything is saved
  const imageUrl = await saveImage(data, 'products');
  await pool.query('UPDATE products SET image_url = $2, image_source = $3 WHERE id = $1', [id, imageUrl, source ?? null]);
  await deleteImage(before.imageUrl);
  res.json({ product: toStaffProduct(await getProductRow(pool, id)) });
});

staffProductsRouter.delete('/:id/image', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const before = await getProductRow(pool, id);
  await pool.query('UPDATE products SET image_url = NULL, image_source = NULL WHERE id = $1', [id]);
  await deleteImage(before.imageUrl);
  res.json({ product: toStaffProduct(await getProductRow(pool, id)) });
});
