// Fills the database with sample data for LOCAL DEVELOPMENT (or a demo
// deployment with LOAD_SAMPLE_DATA=true).
// Safe to run more than once: existing rows are left alone, nothing is duplicated.
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { backendDir } from '../env.js';
import { GATEWAY, setStockContext } from '../services/audit.service.js';
import { changeOrderStatus, createOrder, type OrderStatus } from '../services/order.service.js';
import { markPaymentPaid } from '../services/payment.service.js';
import { listUpcomingSlots } from '../services/pickup.service.js';
import { pool, withTransaction, type Db } from './pool.js';
import {
  categoryNamesTa,
  photosAddedLater,
  previousCategoryOrder,
  renamedSamplePhotos,
  withdrawnSamplePhotos,
  productNamesTa,
  SAMPLE_DATA_VERSION,
  sampleCustomerAddress,
  seedCategories,
  seedDeliveryZones,
  seedProducts,
  seedPromotions,
} from './seed-data.js';

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
    await upsertSampleAccounts(client, log);
    const alreadyLoaded = await isSampleCatalogLoaded(client);
    await loadSampleCatalog(client, log, { fillMissingPhotos: true });
    if (!alreadyLoaded) await updateOlderSampleData(client, log);

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

    await markSampleCatalogLoaded(client);
  });

  await seedSampleOrders(log);
}

/**
 * Adds sample products that are new since this database was set up (for
 * example after you pull an update that extends seed-data.ts). Runs on every
 * start, but each SAMPLE_DATA_VERSION is applied only once, so products you
 * have since edited, deactivated or given a new SKU are never brought back.
 */
export async function syncSampleCatalog(log: (msg: string) => void = console.log): Promise<void> {
  if (!sampleDataAllowed()) return;
  await withTransaction(async (client) => {
    if (await isSampleCatalogLoaded(client)) return;
    await loadSampleCatalog(client, log, { fillMissingPhotos: false });
    await updateOlderSampleData(client, log);
    await markSampleCatalogLoaded(client);
  });
}

async function isSampleCatalogLoaded(client: Db): Promise<boolean> {
  const { rowCount } = await client.query('SELECT 1 FROM sample_data_versions WHERE version = $1', [SAMPLE_DATA_VERSION]);
  return Boolean(rowCount);
}

async function markSampleCatalogLoaded(client: Db) {
  await client.query('INSERT INTO sample_data_versions (version) VALUES ($1) ON CONFLICT DO NOTHING', [SAMPLE_DATA_VERSION]);
}

/**
 * Inserts the sample categories and products that don't exist yet (matched by
 * category slug or name, and by product SKU). Existing rows are never changed.
 * New products get their sample photo from backend/seed-images/products.
 * With fillMissingPhotos, existing sample products without a photo get one too.
 */
async function loadSampleCatalog(client: Db, log: (msg: string) => void, { fillMissingPhotos }: { fillMissingPhotos: boolean }) {
  // --- Categories -----------------------------------------------------------
  // "DO NOTHING" without a target skips rows that clash on the slug OR the name.
  for (const category of seedCategories) {
    await client.query(
      `INSERT INTO categories (name, slug, description, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [category.name, category.slug, category.description, category.sortOrder],
    );
  }
  const { rows: categoryRows } = await client.query<{ id: number; slug: string; name: string }>(
    'SELECT id, slug, lower(name) AS name FROM categories',
  );
  const categoryId = (slug: string) => {
    const seed = seedCategories.find((c) => c.slug === slug)!;
    return (categoryRows.find((row) => row.slug === slug) ?? categoryRows.find((row) => row.name === seed.name.toLowerCase()))?.id;
  };

  // --- Products + stock (one query each, so it's quick on hosted databases) --
  const products = seedProducts
    .map((product) => ({ ...product, categoryId: categoryId(product.category) }))
    .filter((product) => product.categoryId !== undefined);
  const column = <T>(pick: (p: (typeof products)[number]) => T) => products.map(pick);

  const { rows: added } = await client.query<{ id: number; sku: string }>(
    `INSERT INTO products (category_id, sku, name, brand, description, price_cents, unit_label, is_active, name_ta)
     SELECT * FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[], $7::text[], $8::boolean[], $9::text[])
     ON CONFLICT DO NOTHING
     RETURNING id, sku`,
    [
      column((p) => p.categoryId),
      column((p) => p.sku),
      column((p) => p.name),
      column((p) => p.brand ?? null),
      column((p) => p.description),
      column((p) => p.priceCents),
      column((p) => p.unitLabel),
      column((p) => p.isActive ?? true),
      column((p) => productNamesTa[p.sku] ?? null),
    ],
  );
  if (added.length) {
    const seedBySku = new Map(products.map((p) => [p.sku, p]));
    await setStockContext(client, { reason: 'sample_data' });
    await client.query(
      `INSERT INTO inventory (product_id, quantity, low_stock_threshold)
       SELECT * FROM unnest($1::int[], $2::int[], $3::int[])`,
      [
        added.map((row) => row.id),
        added.map((row) => seedBySku.get(row.sku)!.stock),
        added.map((row) => seedBySku.get(row.sku)!.lowStockThreshold ?? 10),
      ],
    );
    log(`  ✔ Added ${added.length} sample products`);
  }

  // --- Product photos (backend/seed-images/products/<SKU>.jpg) ---------------
  const addedSkus = new Set(added.map((row) => row.sku));
  const photos = [...samplePhotos()].filter(([sku]) => fillMissingPhotos || addedSkus.has(sku));
  if (photos.length) {
    const { rowCount } = await client.query(
      `UPDATE products p SET image_url = photo.url
       FROM unnest($1::text[], $2::text[]) AS photo(sku, url)
       WHERE p.sku = photo.sku AND p.image_url IS NULL`,
      [photos.map(([sku]) => sku), photos.map(([, url]) => url)],
    );
    if (rowCount) log(`  ✔ Added ${rowCount} sample product photos (credits in backend/seed-images/CREDITS.md)`);
  }

  // --- Tamil names (only where none has been set) ---------------------------
  await client.query(
    `UPDATE categories c SET name_ta = v.name_ta
     FROM unnest($1::text[], $2::text[]) AS v(slug, name_ta)
     WHERE c.slug = v.slug AND c.name_ta IS NULL`,
    [Object.keys(categoryNamesTa), Object.values(categoryNamesTa)],
  );
  await client.query(
    `UPDATE products p SET name_ta = v.name_ta
     FROM unnest($1::text[], $2::text[]) AS v(sku, name_ta)
     WHERE p.sku = v.sku AND p.name_ta IS NULL`,
    [Object.keys(productNamesTa), Object.values(productNamesTa)],
  );

  // --- Category photos (backend/seed-images/categories/<slug>.jpg) ----------
  const categoryPhotos = sampleCategoryPhotos();
  if (categoryPhotos.size) {
    await client.query(
      `UPDATE categories c SET image_url = v.url
       FROM unnest($1::text[], $2::text[]) AS v(slug, url)
       WHERE c.slug = v.slug AND c.image_url IS NULL`,
      [[...categoryPhotos.keys()], [...categoryPhotos.values()]],
    );
  }

  // --- Example bundle offers (offers stay OFF until a manager switches them on)
  const { rows: promotionCount } = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM promotions');
  if (promotionCount[0].count === 0) {
    for (const promotion of seedPromotions) {
      const { rows: ids } = await client.query<{ id: number; sku: string }>('SELECT id, sku FROM products WHERE sku = ANY($1::text[])', [
        promotion.items.map((i) => i.sku),
      ]);
      if (ids.length !== promotion.items.length) continue;
      const { rows } = await client.query<{ id: number }>(
        'INSERT INTO promotions (name, name_ta, description, discount_cents) VALUES ($1, $2, $3, $4) RETURNING id',
        [promotion.name, promotion.nameTa, promotion.description, promotion.discountCents],
      );
      for (const item of promotion.items) {
        await client.query('INSERT INTO promotion_items (promotion_id, product_id, quantity) VALUES ($1, $2, $3)', [
          rows[0].id,
          ids.find((p) => p.sku === item.sku)!.id,
          item.quantity,
        ]);
      }
    }
    log(`  ✔ Added ${seedPromotions.length} example bundle offers (switched off until you enable offers)`);
  }
}

/**
 * Moves sample data created by the first version of the app (a generic store
 * in "Springfield") over to Meeranji Supermarket in Pernambut. Each change only
 * applies while the row still has its original sample values, so anything you
 * have edited yourself is left alone.
 */
async function updateOlderSampleData(client: Db, log: (msg: string) => void) {
  let changes = 0;
  const run = async (sql: string, params: unknown[]) => {
    changes += (await client.query(sql, params)).rowCount ?? 0;
  };

  // Sample photos that moved to a new file, or were withdrawn.
  for (const [from, to] of renamedSamplePhotos) {
    await run('UPDATE products SET image_url = $2 WHERE image_url = $1', [from, to]);
  }
  await run('UPDATE products SET image_url = NULL, image_source = NULL WHERE image_url = ANY($1::text[])', [withdrawnSamplePhotos]);

  // Sample photos that were added after these products already existed.
  const laterPhotos = [...samplePhotos()].filter(([sku]) => photosAddedLater.includes(sku));
  if (laterPhotos.length) {
    const { rowCount } = await client.query(
      `UPDATE products p SET image_url = photo.url
       FROM unnest($1::text[], $2::text[]) AS photo(sku, url)
       WHERE p.sku = photo.sku AND p.image_url IS NULL`,
      [laterPhotos.map(([sku]) => sku), laterPhotos.map(([, url]) => url)],
    );
    if (rowCount) log(`  ✔ Added ${rowCount} new sample product photos (credits in backend/seed-images/CREDITS.md)`);
  }

  // Delivery zones: sample postcodes → PIN codes around Pernambut.
  const [town, nearby] = seedDeliveryZones;
  await run(`UPDATE delivery_zones SET name = $1, postcode_prefixes = $2 WHERE name = 'Central' AND postcode_prefixes = '{1000}'`, [
    town.name,
    town.postcodePrefixes,
  ]);
  await run(
    `UPDATE delivery_zones SET name = $1, postcode_prefixes = $2 WHERE name = 'Outer neighbourhoods' AND postcode_prefixes = '{1001,1002}'`,
    [nearby.name, nearby.postcodePrefixes],
  );

  // The sample customer's address, so it stays inside the delivery area.
  await run(
    `UPDATE addresses SET line1 = $1, city = $2, postcode = $3, instructions = $4
     WHERE line1 = '24 Elm Street' AND city = 'Springfield' AND postcode = '10001'`,
    [sampleCustomerAddress.line1, sampleCustomerAddress.city, sampleCustomerAddress.postcode, sampleCustomerAddress.instructions],
  );

  // Put rice, dals and spices first (only categories still in their original place).
  for (const category of seedCategories) {
    const previous = previousCategoryOrder[category.slug];
    if (previous === undefined || previous === category.sortOrder) continue;
    await run('UPDATE categories SET sort_order = $2 WHERE slug = $1 AND sort_order = $3', [category.slug, category.sortOrder, previous]);
  }

  // Sample products this store doesn't sell are hidden (not deleted).
  for (const product of seedProducts.filter((p) => p.isActive === false)) {
    await run('UPDATE products SET is_active = false WHERE sku = $1 AND name = $2 AND is_active', [product.sku, product.name]);
  }

  if (changes) log(`  ✔ Updated ${changes} sample settings for ${config.STORE_NAME}`);
}

/**
 * Creates the sample staff and customer accounts from SEED_* settings, or, if
 * they already exist, makes sure their password matches the current setting.
 * So changing SEED_STAFF_PASSWORD (in .env or on your host) and restarting /
 * redeploying always gives you the login you configured.
 */
async function upsertSampleAccounts(client: Db, log: (msg: string) => void): Promise<void> {
  const accounts = [
    // The sample store account is a MANAGER (store owner): it can do everything, including adding staff.
    { email: config.SEED_STAFF_EMAIL, password: config.SEED_STAFF_PASSWORD, name: 'Store Manager', role: 'manager' },
    { email: config.SEED_CUSTOMER_EMAIL, password: config.SEED_CUSTOMER_PASSWORD, name: 'Alex Shopper', role: 'customer' },
  ] as const;

  for (const account of accounts) {
    if (!account.email || !account.password) {
      log(`  • Skipped the sample ${account.role} account (SEED_${account.role === 'manager' ? 'STAFF' : 'CUSTOMER'}_EMAIL/PASSWORD not set)`);
      continue;
    }
    const email = account.email.trim().toLowerCase();
    const { rows: existing } = await client.query<{ id: number; passwordHash: string; role: string; isActive: boolean }>(
      'SELECT id, password_hash AS "passwordHash", role, is_active AS "isActive" FROM users WHERE lower(email) = $1',
      [email],
    );

    if (existing[0]) {
      const user = existing[0];
      // Same hashing (bcrypt) and comparison as the login route.
      const passwordMatches = await bcrypt.compare(account.password, user.passwordHash);
      if (!passwordMatches || user.role !== account.role || !user.isActive) {
        await client.query('UPDATE users SET password_hash = $2, role = $3, is_active = true WHERE id = $1', [
          user.id,
          passwordMatches ? user.passwordHash : await bcrypt.hash(account.password, 10),
          account.role,
        ]);
        log(`  ✔ Updated the ${account.role} account ${email} to match its SEED_* settings`);
      }
      continue;
    }

    const hash = await bcrypt.hash(account.password, 10);
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO users (email, password_hash, name, phone, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [email, hash, account.name, '+91 98765 01234', account.role],
    );
    log(`  ✔ Created ${account.role} account ${email}`);

    if (account.role === 'customer') {
      const address = sampleCustomerAddress;
      await client.query(
        `INSERT INTO addresses (user_id, label, recipient_name, phone, line1, city, postcode, instructions, is_default)
         VALUES ($1, 'Home', $2, '+91 98765 01234', $3, $4, $5, $6, true)`,
        [rows[0].id, account.name, address.line1, address.city, address.postcode, address.instructions],
      );
    }
  }
}

/** Keeps the sample accounts in line with the SEED_* settings (runs on every start). */
export async function syncSampleAccounts(log: (msg: string) => void = console.log): Promise<void> {
  if (!sampleDataAllowed()) return;
  await withTransaction((client) => upsertSampleAccounts(client, log));
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

/** slug → image URL for the sample category photos (backend/seed-images/categories/<slug>.jpg). */
function sampleCategoryPhotos(): Map<string, string> {
  const sourceDir = path.join(backendDir, 'seed-images', 'categories');
  const result = new Map<string, string>();
  if (!fs.existsSync(sourceDir)) return result;
  for (const file of fs.readdirSync(sourceDir)) {
    if (!/\.(jpe?g|png|webp)$/i.test(file)) continue;
    result.set(path.parse(file).name, `/sample-images/categories/${file}`);
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
  const { rows: staff } = await pool.query<{ id: number }>("SELECT id FROM users WHERE role IN ('manager', 'staff') ORDER BY id LIMIT 1");
  const customer = customers[0];
  if (!customer?.addressId || !staff[0]) return;

  const { rows: products } = await pool.query<{ id: number; sku: string }>('SELECT id, sku FROM products');
  const id = (sku: string) => products.find((p) => p.sku === sku)!.id;
  const slots = (await listUpcomingSlots(pool)).filter((slot) => slot.isAvailable);
  if (slots.length < 2) return;

  const delivery = { type: 'delivery' as const, addressId: customer.addressId };
  const plans = [
    {
      items: [
        { productId: id('FV-001'), quantity: 1 },
        { productId: id('RD-001'), quantity: 1, substitution: { preference: 'similar' as const } },
        { productId: id('SP-007'), quantity: 1 },
      ],
      fulfillment: { type: 'pickup' as const, pickupSlotId: slots[0].id },
      paymentMethod: 'pay_on_fulfillment' as const,
      notes: 'Please pick ripe bananas!',
      statuses: [] as OrderStatus[],
    },
    {
      items: [{ productId: id('RD-006'), quantity: 1 }, { productId: id('PA-007'), quantity: 2 }, { productId: id('HH-005'), quantity: 1 }],
      fulfillment: delivery,
      paymentMethod: 'upi' as const,
      notes: null,
      statuses: ['preparing'] as OrderStatus[],
    },
    {
      items: [{ productId: id('DR-006'), quantity: 1 }, { productId: id('SN-005'), quantity: 2 }],
      fulfillment: { type: 'pickup' as const, pickupSlotId: slots[1].id },
      paymentMethod: 'pay_on_fulfillment' as const,
      notes: null,
      statuses: ['preparing', 'ready_for_pickup'] as OrderStatus[],
    },
    {
      items: [{ productId: id('DE-002'), quantity: 1 }, { productId: id('DE-006'), quantity: 2 }, { productId: id('PC-005'), quantity: 1 }],
      fulfillment: delivery,
      paymentMethod: 'pay_on_fulfillment' as const,
      notes: null,
      statuses: ['preparing', 'out_for_delivery', 'completed'] as OrderStatus[],
    },
  ];

  const manager = { id: staff[0].id, role: 'manager' as const };
  for (const plan of plans) {
    const { orderId } = await createOrder(customer.id, {
      items: plan.items,
      fulfillment: plan.fulfillment,
      paymentMethod: plan.paymentMethod,
      notes: plan.notes,
    });
    if (plan.paymentMethod === 'upi') {
      // A sample DEMO UPI payment, so the dashboard shows a paid order.
      const { rows } = await pool.query<{ id: number }>(
        `INSERT INTO payments (order_id, provider, amount_cents, checkout_token)
         SELECT id, 'demo', total_cents, md5(random()::text || id::text) || md5(id::text) FROM orders WHERE id = $1 RETURNING id`,
        [orderId],
      );
      await markPaymentPaid(rows[0].id, `demo_pay_${rows[0].id}`, GATEWAY);
    }
    for (const status of plan.statuses) await changeOrderStatus(orderId, status, manager);
  }
  log(`  ✔ Added ${plans.length} sample orders`);
}
