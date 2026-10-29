// Product queries shared by the customer catalogue and the staff dashboard.
import type { Db } from '../db/pool.js';
import { notFound } from '../lib/errors.js';
import { imageCredit } from './image-credits.js';

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';
export type ProductSort = 'relevance' | 'name' | 'price_asc' | 'price_desc' | 'newest' | 'stock_asc';

export interface ProductRow {
  id: number;
  name: string;
  nameTa: string | null;
  brand: string | null;
  description: string;
  priceCents: number;
  unitLabel: string;
  imageUrl: string | null;
  imageSource: string | null;
  sku: string | null;
  isActive: boolean;
  categoryId: number;
  categoryName: string;
  categoryNameTa: string | null;
  categoryIsActive: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
  createdAt: Date;
  updatedAt: Date;
}

const PRODUCT_SELECT = `
  SELECT p.id, p.name, p.name_ta AS "nameTa", p.brand, p.description, p.price_cents AS "priceCents", p.unit_label AS "unitLabel",
         p.image_url AS "imageUrl", p.image_source AS "imageSource", p.sku, p.is_active AS "isActive",
         p.category_id AS "categoryId", c.name AS "categoryName", c.name_ta AS "categoryNameTa",
         c.is_active AS "categoryIsActive",
         i.quantity AS "stockQuantity", i.low_stock_threshold AS "lowStockThreshold",
         p.created_at AS "createdAt", p.updated_at AS "updatedAt",
         count(*) OVER () AS "totalCount"
  FROM products p
  JOIN categories c ON c.id = p.category_id
  JOIN inventory i ON i.product_id = p.id`;

export function getStockStatus(quantity: number, threshold: number): StockStatus {
  if (quantity <= 0) return 'out_of_stock';
  if (quantity <= threshold) return 'low_stock';
  return 'in_stock';
}

/** What customers see. Internal fields (SKU, thresholds) are left out. */
export function toPublicProduct(row: ProductRow) {
  return {
    id: row.id,
    name: row.name,
    nameTa: row.nameTa,
    brand: row.brand,
    description: row.description,
    priceCents: row.priceCents,
    unitLabel: row.unitLabel,
    imageUrl: row.imageUrl,
    imageCredit: imageCredit(row.imageUrl, row.imageSource),
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    categoryNameTa: row.categoryNameTa,
    availableQuantity: row.stockQuantity,
    stockStatus: getStockStatus(row.stockQuantity, row.lowStockThreshold),
  };
}

/** What staff see: everything, plus a low-stock flag. */
export function toStaffProduct(row: ProductRow) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    nameTa: row.nameTa,
    brand: row.brand,
    description: row.description,
    priceCents: row.priceCents,
    unitLabel: row.unitLabel,
    imageUrl: row.imageUrl,
    imageSource: row.imageSource,
    imageCredit: imageCredit(row.imageUrl, row.imageSource),
    isActive: row.isActive,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    categoryNameTa: row.categoryNameTa,
    categoryIsActive: row.categoryIsActive,
    stockQuantity: row.stockQuantity,
    lowStockThreshold: row.lowStockThreshold,
    stockStatus: getStockStatus(row.stockQuantity, row.lowStockThreshold),
    isLowStock: row.stockQuantity <= row.lowStockThreshold,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface ProductFilters {
  search?: string;
  categoryId?: number;
  ids?: number[];
  inStock?: boolean;
  minPriceCents?: number;
  maxPriceCents?: number;
  lowStock?: boolean;
  /** Only products without a photo (staff). */
  missingPhoto?: boolean;
  /** Customers only ever see "active"; staff can choose. */
  status: 'active' | 'inactive' | 'all';
  sort?: ProductSort;
  page: number;
  pageSize: number;
}

// Accented letters → plain ones, so "nescafe" finds "Nescafé" (and the other way round).
const ACCENTED = 'ÁÀÂÄÃáàâäãÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÖÕóòôöõÚÙÛÜúùûüÇçÑñ';
const PLAIN = 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn';
const fold = (column: string) => `translate(${column}, '${ACCENTED}', '${PLAIN}')`;
// Only Latin accents are removed — Tamil vowel signs are also "marks" in Unicode and must stay.
const foldText = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC');

export async function findProducts(db: Db, filters: ProductFilters) {
  const where: string[] = [];
  const params: unknown[] = [];
  const param = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.status === 'active') where.push('p.is_active AND c.is_active');
  if (filters.status === 'inactive') where.push('NOT (p.is_active AND c.is_active)');

  // Searches name, brand, description, category and SKU, ignoring accents.
  // Escape % and _ so they are matched literally.
  const escapedSearch = filters.search ? foldText(filters.search).replace(/[\\%_]/g, '\\$&') : null;
  let nameOrBrandMatches = '';
  if (escapedSearch) {
    const term = param(`%${escapedSearch}%`);
    nameOrBrandMatches = `(${fold('p.name')} ILIKE ${term} OR p.name_ta ILIKE ${term} OR ${fold('p.brand')} ILIKE ${term})`;
    where.push(`(${nameOrBrandMatches} OR ${fold('p.description')} ILIKE ${term} OR ${fold('c.name')} ILIKE ${term} OR c.name_ta ILIKE ${term} OR p.sku ILIKE ${term})`);
  }
  if (filters.categoryId) where.push(`p.category_id = ${param(filters.categoryId)}`);
  if (filters.ids?.length) where.push(`p.id = ANY(${param(filters.ids)}::int[])`);
  if (filters.inStock) where.push('i.quantity > 0');
  if (filters.lowStock) where.push('i.quantity <= i.low_stock_threshold');
  if (filters.missingPhoto) where.push('p.image_url IS NULL');
  if (filters.minPriceCents != null) where.push(`p.price_cents >= ${param(filters.minPriceCents)}`);
  if (filters.maxPriceCents != null) where.push(`p.price_cents <= ${param(filters.maxPriceCents)}`);

  let orderBy: string;
  switch (filters.sort ?? (escapedSearch ? 'relevance' : 'name')) {
    case 'relevance':
      // Names that START with the search text come first, then other name or
      // brand matches, then matches in the description or category.
      orderBy = escapedSearch
        ? `(CASE WHEN ${fold('p.name')} ILIKE ${param(`${escapedSearch}%`)} THEN 0 WHEN ${nameOrBrandMatches} THEN 1 ELSE 2 END), lower(p.name)`
        : 'lower(p.name)';
      break;
    case 'price_asc':
      orderBy = 'p.price_cents, lower(p.name)';
      break;
    case 'price_desc':
      orderBy = 'p.price_cents DESC, lower(p.name)';
      break;
    case 'newest':
      orderBy = 'p.created_at DESC, p.id DESC';
      break;
    case 'stock_asc':
      orderBy = 'i.quantity, lower(p.name)';
      break;
    default:
      orderBy = 'lower(p.name)';
  }

  const sql = `${PRODUCT_SELECT}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY ${orderBy}
    LIMIT ${param(filters.pageSize)} OFFSET ${param((filters.page - 1) * filters.pageSize)}`;

  const { rows } = await db.query<ProductRow & { totalCount: number }>(sql, params);
  return { rows, total: rows[0]?.totalCount ?? 0 };
}

export async function getProductRow(db: Db, id: number): Promise<ProductRow> {
  const { rows } = await db.query<ProductRow>(`${PRODUCT_SELECT} WHERE p.id = $1`, [id]);
  if (!rows[0]) throw notFound('Product');
  return rows[0];
}
