// Public catalogue: store info, categories, products. No login needed.
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { notFound } from '../lib/errors.js';
import { parsePhoneList } from '../lib/phone.js';
import { idParam, parse, queryBoolean } from '../lib/validation.js';
import { findProducts, getProductRow, toPublicProduct } from '../services/catalog.service.js';
import { imageCredit } from '../services/image-credits.js';
import { listZones } from '../services/delivery.service.js';
import { toWhatsAppNumber } from '../services/notification.service.js';
import { paymentsEnvironment } from '../services/payment.service.js';
import { getOpeningHours, getStoreSettings, listClosures } from '../services/settings.service.js';

export const catalogRouter = Router();

catalogRouter.get('/store', async (_req, res) => {
  const [zones, settings, hours, closures] = await Promise.all([
    listZones(pool, { activeOnly: true }),
    getStoreSettings(pool),
    getOpeningHours(pool),
    listClosures(pool),
  ]);
  const phones = parsePhoneList(config.STORE_PHONE);
  const whatsapp = toWhatsAppNumber(config.STORE_WHATSAPP_NUMBER ?? phones[0]?.tel);
  const payments = paymentsEnvironment();
  const todayHours = hours.find((h) => h.weekday === new Date(new Date().toLocaleString('en-US', { timeZone: config.STORE_TIMEZONE })).getDay());
  res.json({
    name: config.STORE_NAME,
    address: config.STORE_ADDRESS,
    phone: phones[0]?.display ?? '', // the first number (kept for older app versions)
    phones,
    /** Official WhatsApp "click to chat" link for customer questions (opens the customer's own WhatsApp). */
    whatsappChatUrl: whatsapp ? `https://wa.me/${whatsapp}` : null,
    currency: config.CURRENCY,
    timezone: config.STORE_TIMEZONE,
    openingHours: hours,
    closures,
    pickup: {
      // Kept for older app versions: today's opening hours.
      openHour: Number((todayHours?.opensAt ?? '09:00').slice(0, 2)),
      closeHour: Number((todayHours?.closesAt ?? '20:00').slice(0, 2)),
      slotMinutes: settings.pickupSlotMinutes,
      leadTimeMinutes: settings.pickupLeadTimeMinutes,
      daysAhead: settings.pickupDaysAhead,
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
        id: 'upi',
        label: { demo: 'UPI (DEMO)', test: 'UPI (Razorpay TEST mode)', live: 'UPI' }[payments],
        description: {
          demo: 'DEMO ONLY — practice payment screen, no money moves.',
          test: "TEST MODE — Razorpay's test checkout. No real money moves; use the test UPI ID success@razorpay.",
          live: 'Pay securely with any UPI app (Google Pay, PhonePe, Paytm, BHIM…) through Razorpay.',
        }[payments],
        /** True when no real money moves (demo page or Razorpay test mode). */
        isDemo: payments !== 'live',
        mode: payments,
      },
      {
        id: 'pay_on_fulfillment',
        label: 'Pay on delivery or collection',
        description: 'Pay by UPI, card or cash when you receive your order.',
        isDemo: false,
      },
    ],
    paymentTimeoutMinutes: config.PAYMENT_TIMEOUT_MINUTES,
    paymentsMode: payments,
    substitutionsEnabled: settings.substitutionsEnabled,
    whatsappUpdatesAvailable: config.WHATSAPP_MODE !== 'off',
    whatsappIsDemo: config.WHATSAPP_MODE === 'demo',
    loyalty: settings.loyaltyEnabled
      ? {
          enabled: true,
          pointsPer100: settings.loyaltyPointsPer100,
          pointValueCents: settings.loyaltyPointValueCents,
          minRedeemPoints: settings.loyaltyMinRedeemPoints,
          maxRedeemPercent: settings.loyaltyMaxRedeemPercent,
        }
      : { enabled: false },
    promotionsEnabled: settings.promotionsEnabled,
  });
});

catalogRouter.get('/categories', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.name_ta AS "nameTa", c.slug, c.description, c.image_url AS "imageUrl", c.image_source AS "imageSource",
            count(p.id) FILTER (WHERE p.is_active) AS "productCount"
     FROM categories c
     LEFT JOIN products p ON p.category_id = c.id
     WHERE c.is_active
     GROUP BY c.id
     ORDER BY c.sort_order, c.name`,
  );
  res.json({ items: rows.map(({ imageSource, ...c }) => ({ ...c, imageCredit: imageCredit(c.imageUrl, imageSource) })) });
});

/** "Photo credits": who took the photos shown in the app, and under which licence. */
catalogRouter.get('/image-credits', async (_req, res) => {
  const [categories, products] = await Promise.all([
    pool.query<{ name: string; nameTa: string | null; imageUrl: string; imageSource: string | null }>(
      `SELECT name, name_ta AS "nameTa", image_url AS "imageUrl", image_source AS "imageSource"
       FROM categories WHERE is_active AND image_url IS NOT NULL ORDER BY sort_order, name`,
    ),
    pool.query<{ name: string; nameTa: string | null; imageUrl: string; imageSource: string | null }>(
      `SELECT p.name, p.name_ta AS "nameTa", p.image_url AS "imageUrl", p.image_source AS "imageSource"
       FROM products p JOIN categories c ON c.id = p.category_id
       WHERE p.is_active AND c.is_active AND p.image_url IS NOT NULL ORDER BY p.name`,
    ),
  ]);
  const withCredit = (rows: { name: string; nameTa: string | null; imageUrl: string; imageSource: string | null }[]) =>
    rows
      .map((row) => ({ name: row.name, nameTa: row.nameTa, credit: imageCredit(row.imageUrl, row.imageSource) }))
      .filter((row) => row.credit !== null);
  res.json({ categories: withCredit(categories.rows), products: withCredit(products.rows) });
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
