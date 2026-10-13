// Fills the database with sample data for LOCAL DEVELOPMENT (or a demo
// deployment with LOAD_SAMPLE_DATA=true).
// Safe to run more than once: existing rows are left alone, nothing is duplicated.
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { backendDir } from '../env.js';
import { changeOrderStatus, createOrder, type OrderStatus } from '../services/order.service.js';
import { listUpcomingSlots } from '../services/pickup.service.js';
import { pool, withTransaction } from './pool.js';
import { seedCategories, seedDeliveryZones, seedProducts } from './seed-data.js';

/** Sample data is allowed everywhere except production, unless LOAD_SAMPLE_DATA=true. */
export const sampleDataAllowed = () => !config.isProduction || config.LOAD_SAMPLE_DATA;

export async function isDatabaseEmpty(): Promise<boolean> {
  const { rows } = await pool.query<{ count: number }>('SELECT count(*) AS count FROM users');
  return rows[0].count === 0;
}

export async function seedDatabase(log: (msg: string) => void = console.log): Promise<void> {
  if (!sampleDataAllowed()) {
    throw new Error('Refusing to load sample data while NODE_ENV=production (set LOAD_SAMPLE_DATA=true for a demo).');
  }

  await withTransaction(async (client) => {
    // --- Accounts -----------------------------------------------------------
    const accounts = [
      { email: config.SEED_STAFF_EMAIL, password: config.SEED_STAFF_PASSWORD, name: 'Store Staff', role: 'staff' },
      { email: config.SEED_CUSTOMER_EMAIL, password: config.SEED_CUSTOMER_PASSWORD, name: 'Alex Shopper', role: 'customer' },
    ] as const;

    for (const account of accounts) {
      if (!account.email || !account.password) {
        log(`  • Skipped the sample ${account.role} account (SEED_${account.role.toUpperCase()}_EMAIL/PASSWORD not set in .env)`);
        continue;
      }
      const existing = await client.query('SELECT id FROM users WHERE lower(email) = lower($1)', [account.email]);
      if (existing.rowCount) continue;

      const hash = await bcrypt.hash(account.password, 10);
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO users (email, password_hash, name, phone, role)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [account.email.toLowerCase(), hash, account.name, '+91 98765 01234', account.role],
      );
      log(`  ✔ Created ${account.role} account ${account.email}`);

      if (account.role === 'customer') {
        await client.query(
          `INSERT INTO addresses (user_id, label, recipient_name, phone, line1, city, postcode, instructions, is_default)
           VALUES ($1, 'Home', $2, '+91 98765 01234', '24 Elm Street', 'Springfield', '10001', 'Blue door — please ring the bell', true)`,
          [rows[0].id, account.name],
        );
      }
    }

    // --- Categories ---------------------------------------------------------
    for (const [index, category] of seedCategories.entries()) {
      await client.query(
        `INSERT INTO categories (name, slug, description, icon, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (slug) DO NOTHING`,
        [category.name, category.slug, category.description, category.icon, index + 1],
      );
    }
    const { rows: categoryRows } = await client.query<{ id: number; slug: string }>('SELECT id, slug FROM categories');
    const categoryIds = new Map(categoryRows.map((row) => [row.slug, row.id]));

    // --- Products + stock ---------------------------------------------------
    let newProducts = 0;
    for (const product of seedProducts) {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO products (category_id, sku, name, description, price_cents, unit_label, icon, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (sku) DO NOTHING
         RETURNING id`,
        [
          categoryIds.get(product.category),
          product.sku,
          product.name,
          product.description,
          product.priceCents,
          product.unitLabel,
          product.icon,
          product.isActive ?? true,
        ],
      );
      if (rows.length === 0) continue; // already existed
      await client.query('INSERT INTO inventory (product_id, quantity, low_stock_threshold) VALUES ($1, $2, $3)', [
        rows[0].id,
        product.stock,
        product.lowStockThreshold ?? 10,
      ]);
      newProducts++;
    }
    if (newProducts) log(`  ✔ Added ${newProducts} sample products in ${seedCategories.length} categories`);

    // --- Product photos (backend/seed-images/products/<SKU>.jpg) -------------
    const photos = samplePhotos();
    for (const [sku, imageUrl] of photos) {
      await client.query('UPDATE products SET image_url = $2 WHERE sku = $1 AND image_url IS NULL', [sku, imageUrl]);
    }
    if (photos.size) log(`  ✔ Product photos ready (${photos.size} sample photos — credits in backend/seed-images/CREDITS.md)`);

    // --- Delivery zones -----------------------------------------------------
    const { rows: zoneCount } = await client.query<{ count: number }>('SELECT count(*) AS count FROM delivery_zones');
    if (zoneCount[0].count === 0) {
      for (const zone of seedDeliveryZones) {
        await client.query(
          `INSERT INTO delivery_zones (name, postcode_prefixes, fee_cents, free_delivery_threshold_cents, min_order_cents)
           VALUES ($1, $2, $3, $4, $5)`,
          [zone.name, zone.postcodePrefixes, zone.feeCents, zone.freeDeliveryThresholdCents, zone.minOrderCents],
        );
      }
      log(`  ✔ Added ${seedDeliveryZones.length} delivery zones`);
    }
  });

  await seedSampleOrders(log);
}

/**
 * Returns SKU → image URL for the sample photos. They are served straight
 * from backend/seed-images/products (see app.ts), so they ship with the code
 * and survive redeploys.
 */
function samplePhotos(): Map<string, string> {
  const sourceDir = path.join(backendDir, 'seed-images', 'products');
  const result = new Map<string, string>();
  if (!fs.existsSync(sourceDir)) return result;
  for (const file of fs.readdirSync(sourceDir)) {
    if (!/\.(jpe?g|png|webp)$/i.test(file)) continue;
    result.set(path.parse(file).name, `/sample-images/${file}`);
  }
  return result;
}

/**
 * A few example orders in different states, so the staff dashboard has
 * something to show straight away. They go through the real order code,
 * so stock and pickup slots stay consistent.
 */
async function seedSampleOrders(log: (msg: string) => void) {
  const { rows: existing } = await pool.query<{ count: number }>('SELECT count(*) AS count FROM orders');
  if (existing[0].count > 0 || !config.SEED_CUSTOMER_EMAIL) return;

  const { rows: customers } = await pool.query<{ id: number; addressId: number | null }>(
    `SELECT u.id, (SELECT id FROM addresses a WHERE a.user_id = u.id AND a.is_default) AS "addressId"
     FROM users u WHERE lower(email) = lower($1)`,
    [config.SEED_CUSTOMER_EMAIL],
  );
  const { rows: staff } = await pool.query<{ id: number }>("SELECT id FROM users WHERE role = 'staff' ORDER BY id LIMIT 1");
  const customer = customers[0];
  if (!customer?.addressId || !staff[0]) return;

  const { rows: products } = await pool.query<{ id: number; sku: string }>('SELECT id, sku FROM products');
  const id = (sku: string) => products.find((p) => p.sku === sku)!.id;
  const slots = (await listUpcomingSlots(pool)).filter((slot) => slot.isAvailable);
  if (slots.length < 2) return;

  const delivery = { type: 'delivery' as const, addressId: customer.addressId };
  const plans = [
    {
      items: [{ productId: id('FV-001'), quantity: 1 }, { productId: id('DE-001'), quantity: 2 }, { productId: id('BK-001'), quantity: 1 }],
      fulfillment: { type: 'pickup' as const, pickupSlotId: slots[0].id },
      paymentMethod: 'pay_on_fulfillment' as const,
      notes: 'Please pick ripe bananas!',
      statuses: [] as OrderStatus[],
    },
    {
      items: [{ productId: id('MF-001'), quantity: 1 }, { productId: id('PA-001'), quantity: 2 }, { productId: id('PA-003'), quantity: 3 }],
      fulfillment: delivery,
      paymentMethod: 'demo_card' as const,
      notes: null,
      statuses: ['preparing'] as OrderStatus[],
    },
    {
      items: [{ productId: id('DR-003'), quantity: 1 }, { productId: id('SN-002'), quantity: 2 }],
      fulfillment: { type: 'pickup' as const, pickupSlotId: slots[1].id },
      paymentMethod: 'pay_on_fulfillment' as const,
      notes: null,
      statuses: ['preparing', 'ready_for_pickup'] as OrderStatus[],
    },
    {
      items: [{ productId: id('DE-002'), quantity: 1 }, { productId: id('FV-002'), quantity: 2 }, { productId: id('HH-002'), quantity: 1 }],
      fulfillment: delivery,
      paymentMethod: 'pay_on_fulfillment' as const,
      notes: null,
      statuses: ['preparing', 'out_for_delivery', 'completed'] as OrderStatus[],
    },
  ];

  for (const plan of plans) {
    const { orderId } = await createOrder(customer.id, {
      items: plan.items,
      fulfillment: plan.fulfillment,
      paymentMethod: plan.paymentMethod,
      notes: plan.notes,
    });
    for (const status of plan.statuses) await changeOrderStatus(orderId, status, staff[0].id);
  }
  log(`  ✔ Added ${plans.length} sample orders`);
}
