// End-to-end API tests: accounts, catalogue, checkout, order lifecycle and
// staff catalogue management. Set-up (test database, helpers) is in setup.ts.
// Run with:  npm test   (the database server must be running)
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { api, baseUrl, firstAvailableSlotId, login, productIdBySku, startTestServer, stockOf, stopTestServer } from './setup.js';

before(startTestServer);
after(stopTestServer);

// ---------------------------------------------------------------------------
describe('accounts', () => {
  it('reports every invalid field when signing up', async () => {
    const res = await api('POST', '/api/auth/signup', { body: { name: '', email: 'nope', password: 'short' } });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    const fields = res.body.error.details.fields.map((f: { field: string }) => f.field);
    assert.deepEqual(fields.sort(), ['email', 'name', 'password']);
  });

  it('signs up, logs in and returns the current user', async () => {
    const signup = await api('POST', '/api/auth/signup', {
      body: { name: 'Test Person', email: 'Person@Example.com', password: 'a-good-password' },
    });
    assert.equal(signup.status, 201);
    assert.equal(signup.body.user.email, 'person@example.com');
    assert.equal(signup.body.user.role, 'customer');

    const duplicate = await api('POST', '/api/auth/signup', {
      body: { name: 'Again', email: 'person@example.com', password: 'a-good-password' },
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, 'EMAIL_TAKEN');

    const wrong = await api('POST', '/api/auth/login', { body: { email: 'person@example.com', password: 'wrong-password' } });
    assert.equal(wrong.status, 401);

    const token = await login('PERSON@example.com', 'a-good-password');
    const me = await api('GET', '/api/auth/me', { token });
    assert.equal(me.body.user.name, 'Test Person');
  });

  it('updates the sample staff login when SEED_STAFF_PASSWORD changes', async () => {
    const { config } = await import('../src/config.js');
    const { syncSampleAccounts } = await import('../src/db/seed.js');
    const original = config.SEED_STAFF_PASSWORD!;
    try {
      config.SEED_STAFF_PASSWORD = 'NewStaffPassword42';
      await syncSampleAccounts(() => {});
      const old = await api('POST', '/api/auth/login', { body: { email: 'staff@test.local', password: original } });
      assert.equal(old.status, 401, 'the old password stops working');
      const fresh = await api('POST', '/api/auth/login', { body: { email: 'STAFF@test.local ', password: 'NewStaffPassword42' } });
      assert.equal(fresh.status, 200, 'the configured password works (email case and spaces do not matter)');
      assert.equal(fresh.body.user.role, 'manager', 'the sample store account is the store manager');
    } finally {
      config.SEED_STAFF_PASSWORD = original;
      await syncSampleAccounts(() => {});
    }
    await login('staff@test.local', original);
  });

  it('keeps staff endpoints for staff only', async () => {
    assert.equal((await api('GET', '/api/staff/summary')).status, 401);
    const customer = await login('customer@test.local', 'customer-password-123');
    assert.equal((await api('GET', '/api/staff/summary', { token: customer })).status, 403);
    const staff = await login('staff@test.local', 'staff-password-123');
    assert.equal((await api('GET', '/api/staff/summary', { token: staff })).status, 200);
  });
});

// ---------------------------------------------------------------------------
describe('catalogue', () => {
  it('shares the store details, with every phone number ready to call', async () => {
    const store = await api('GET', '/api/store');
    assert.deepEqual(store.body.phones, [
      { display: '+91 97895 62928', tel: '+919789562928' },
      { display: '+91 90030 71616', tel: '+919003071616' },
    ]);
    assert.equal(store.body.phone, '+91 97895 62928');
  });

  it('searches products and hides deactivated ones from customers', async () => {
    // Products named "…milk…" come before ones that only mention milk in the description.
    const milk = await api('GET', '/api/products?search=milk');
    assert.equal(milk.body.items[0].name, 'Full Cream Milk');

    const pumpkin = await api('GET', '/api/products?search=pumpkin');
    assert.equal(pumpkin.body.total, 0, 'inactive products must not be listed');

    const staff = await login('staff@test.local', 'staff-password-123');
    const pumpkinId = await productIdBySku('FV-010', staff);
    assert.equal((await api('GET', `/api/products/${pumpkinId}`)).status, 404);
  });

  it('finds products by brand, and ignores accents', async () => {
    const surf = await api('GET', '/api/products?search=surf%20excel');
    assert.ok(surf.body.items.length >= 2);
    for (const product of surf.body.items) assert.equal(product.brand, 'Surf Excel');

    // "nescafe" (typed without the accent) finds Nescafé.
    const coffee = await api('GET', '/api/products?search=nescafe');
    assert.ok(coffee.body.items.some((p: { brand: string }) => p.brand === 'Nescafé'));

    // Tamil names work too.
    const paruppu = await api('GET', '/api/products?search=paruppu');
    assert.ok(paruppu.body.items.some((p: { name: string }) => p.name.startsWith('Toor Dal')));
  });

  it('filters by category, stock and price', async () => {
    const categories = (await api('GET', '/api/categories')).body.items;
    const fruitVeg = categories.find((c: { slug: string }) => c.slug === 'fruit-veg').id;
    const res = await api('GET', `/api/products?categoryId=${fruitVeg}&inStock=true&maxPriceCents=5000&sort=price_asc`);
    assert.ok(res.body.items.length > 0);
    for (const product of res.body.items) {
      assert.equal(product.categoryId, fruitVeg);
      assert.ok(product.availableQuantity > 0);
      assert.ok(product.priceCents <= 5000);
    }
    const prices = res.body.items.map((p: { priceCents: number }) => p.priceCents);
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  });

  it('adds new sample products to an existing database once, and keeps your changes', async () => {
    const { pool } = await import('../src/db/pool.js');
    const { syncSampleCatalog } = await import('../src/db/seed.js');
    const staff = await login('staff@test.local', 'staff-password-123');
    const count = async () => (await pool.query<{ count: number }>('SELECT count(*) AS count FROM products')).rows[0].count;
    const before = await count();

    // Like a database from before this catalogue: one sample product missing, no version marker.
    await pool.query("DELETE FROM products WHERE sku = 'SP-008'");
    await pool.query('DELETE FROM sample_data_versions');
    await syncSampleCatalog(() => {});
    assert.equal(await count(), before, 'the missing sample product was added');
    const rasam = (await api('GET', '/api/products?search=rasam')).body.items[0];
    assert.equal(rasam.brand, 'Store packed');
    assert.equal(rasam.availableQuantity, 30);

    // After that, edits stick: giving it your own SKU does not bring the sample one back.
    const rasamId = await productIdBySku('SP-008', staff);
    await api('PATCH', `/api/staff/products/${rasamId}`, { token: staff, body: { sku: 'MY-BARCODE-123' } });
    await syncSampleCatalog(() => {});
    assert.equal(await count(), before);
  });
});

// ---------------------------------------------------------------------------
describe('checkout', () => {
  let customer: string;
  let staff: string;
  let addressId: number;

  before(async () => {
    customer = await login('customer@test.local', 'customer-password-123');
    staff = await login('staff@test.local', 'staff-password-123');
    const addresses = await api('GET', '/api/addresses', { token: customer });
    addressId = addresses.body.items[0].id;
    assert.equal(addresses.body.items[0].deliveryAvailable, true);
  });

  it('quotes delivery fees, free delivery and service-area problems', async () => {
    const bananas = await productIdBySku('FV-001', staff); // ₹45
    const oil = await productIdBySku('PA-004', staff); // ₹650

    const small = await api('POST', '/api/checkout/quote', {
      token: customer,
      body: { items: [{ productId: bananas, quantity: 2 }], fulfillment: { type: 'delivery', addressId } },
    });
    assert.equal(small.status, 200);
    assert.equal(small.body.subtotalCents, 9000);
    assert.equal(small.body.deliveryFeeCents, 3000);
    assert.equal(small.body.totalCents, 12000);
    assert.equal(small.body.canPlaceOrder, true);

    const big = await api('POST', '/api/checkout/quote', {
      token: customer,
      body: { items: [{ productId: oil, quantity: 1 }], fulfillment: { type: 'delivery', addressId } },
    });
    assert.equal(big.body.deliveryFeeCents, 0, 'orders over ₹500 get free delivery');

    const faraway = await api('POST', '/api/checkout/quote', {
      token: customer,
      body: {
        items: [{ productId: bananas, quantity: 1 }],
        fulfillment: {
          type: 'delivery',
          address: { recipientName: 'A', phone: '5550000', line1: '1 Road', city: 'Far', postcode: '90210' },
        },
      },
    });
    assert.equal(faraway.body.canPlaceOrder, false);
    assert.equal(faraway.body.issues[0].code, 'OUTSIDE_SERVICE_AREA');
  });

  it('places a pickup order using server prices, and replays safely', async () => {
    const eggs = await productIdBySku('DE-002', staff); // ₹120
    const stockBefore = await stockOf(eggs, staff);
    const pickupSlotId = await firstAvailableSlotId();

    const body = {
      // A tampered app might send its own price — the server must ignore it.
      items: [{ productId: eggs, quantity: 2, priceCents: 1 }],
      fulfillment: { type: 'pickup', pickupSlotId },
      paymentMethod: 'pay_on_fulfillment',
      idempotencyKey: 'test-key-pickup-0001',
    };
    const first = await api('POST', '/api/orders', { token: customer, body });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.order.totalCents, 24000);
    assert.equal(first.body.order.fulfillmentType, 'pickup');
    assert.equal(first.body.order.pickup.slotId, pickupSlotId);
    assert.equal(await stockOf(eggs, staff), stockBefore - 2);

    // Same request again (e.g. a double tap) → same order, stock untouched.
    const again = await api('POST', '/api/orders', { token: customer, body });
    assert.equal(again.status, 200);
    assert.equal(again.body.order.id, first.body.order.id);
    assert.equal(await stockOf(eggs, staff), stockBefore - 2);
  });

  it('never oversells when many customers check out at the same moment', async () => {
    const croissants = await productIdBySku('BK-002', staff);
    await api('POST', `/api/staff/products/${croissants}/stock`, { token: staff, body: { quantity: 5 } });

    const attempts = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        api('POST', '/api/orders', {
          token: customer,
          body: {
            items: [{ productId: croissants, quantity: 1 }],
            fulfillment: { type: 'delivery', addressId },
            paymentMethod: 'pay_on_fulfillment',
            idempotencyKey: `test-key-race-${i}-xxxx`,
          },
        }),
      ),
    );
    const succeeded = attempts.filter((r) => r.status === 201).length;
    const rejected = attempts.filter((r) => r.status === 409);
    assert.equal(succeeded, 5, 'exactly the 5 items in stock can be sold');
    assert.equal(rejected.length, 7);
    assert.equal(rejected[0].body.error.code, 'CHECKOUT_PROBLEM');
    assert.equal(await stockOf(croissants, staff), 0);
  });

  it('rejects orders for more than is in stock', async () => {
    const beef = await productIdBySku('MF-002', staff);
    const res = await api('POST', '/api/orders', {
      token: customer,
      body: {
        items: [{ productId: beef, quantity: 50 }],
        fulfillment: { type: 'delivery', addressId },
        paymentMethod: 'pay_on_fulfillment',
      },
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.details.issues[0].code, 'INSUFFICIENT_STOCK');
  });
});

// ---------------------------------------------------------------------------
describe('order lifecycle', () => {
  let customer: string;
  let staff: string;
  let addressId: number;
  let lemons: number;

  const placeOrder = async (type: 'pickup' | 'delivery', paymentMethod = 'pay_on_fulfillment') => {
    const fulfillment = type === 'pickup' ? { type, pickupSlotId: await firstAvailableSlotId() } : { type, addressId };
    const res = await api('POST', '/api/orders', {
      token: customer,
      body: { items: [{ productId: lemons, quantity: 3 }], fulfillment, paymentMethod },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.order;
  };

  before(async () => {
    customer = await login('customer@test.local', 'customer-password-123');
    staff = await login('staff@test.local', 'staff-password-123');
    addressId = (await api('GET', '/api/addresses', { token: customer })).body.items[0].id;
    lemons = await productIdBySku('FV-008', staff);
  });

  it('moves a pickup order through each status and marks it paid on completion', async () => {
    const order = await placeOrder('pickup');
    const setStatus = (status: string) => api('PATCH', `/api/staff/orders/${order.id}/status`, { token: staff, body: { status } });

    assert.equal((await setStatus('completed')).status, 409, 'cannot skip steps');
    assert.equal((await setStatus('preparing')).body.order.status, 'preparing');
    assert.equal((await setStatus('out_for_delivery')).status, 409, 'pickup orders are never out for delivery');
    assert.equal((await setStatus('ready_for_pickup')).body.order.status, 'ready_for_pickup');
    const done = await setStatus('completed');
    assert.equal(done.body.order.status, 'completed');
    assert.equal(done.body.order.paymentStatus, 'paid');
    assert.equal(done.body.order.history.length, 4);

    const mine = await api('GET', `/api/orders/${order.id}`, { token: customer });
    assert.equal(mine.body.order.status, 'completed');
  });

  it('lets a customer cancel a pending order, restoring stock and the pickup slot', async () => {
    const stockBefore = await stockOf(lemons, staff);
    const order = await placeOrder('pickup');
    const slotBefore = (await api('GET', '/api/pickup-slots')).body.items.find((s: { id: number }) => s.id === order.pickup.slotId);

    const cancelled = await api('POST', `/api/orders/${order.id}/cancel`, { token: customer, body: {} });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.order.status, 'cancelled');
    assert.equal(await stockOf(lemons, staff), stockBefore);

    const slotAfter = (await api('GET', '/api/pickup-slots')).body.items.find((s: { id: number }) => s.id === order.pickup.slotId);
    assert.equal(slotAfter.bookedCount, slotBefore.bookedCount - 1);
  });

  it('only lets the store cancel orders that are being prepared, and requires a reason', async () => {
    const order = await placeOrder('delivery');
    assert.equal(order.status, 'confirmed');
    await api('PATCH', `/api/staff/orders/${order.id}/status`, { token: staff, body: { status: 'preparing' } });

    const byCustomer = await api('POST', `/api/orders/${order.id}/cancel`, { token: customer, body: {} });
    assert.equal(byCustomer.status, 409);

    const noReason = await api('POST', `/api/staff/orders/${order.id}/cancel`, { token: staff, body: {} });
    assert.equal(noReason.status, 400);

    const byStaff = await api('POST', `/api/staff/orders/${order.id}/cancel`, { token: staff, body: { reason: 'Customer phoned to cancel' } });
    assert.equal(byStaff.body.order.status, 'cancelled');
    assert.equal(byStaff.body.order.cancelReason, 'Customer phoned to cancel');
    assert.equal(byStaff.body.order.paymentStatus, 'unpaid');
  });

  it("hides other customers' orders", async () => {
    const order = await placeOrder('delivery');
    const other = await api('POST', '/api/auth/signup', {
      body: { name: 'Someone Else', email: 'else@example.com', password: 'another-password' },
    });
    const res = await api('GET', `/api/orders/${order.id}`, { token: other.body.token });
    assert.equal(res.status, 404);
  });

  it('filters orders for staff', async () => {
    const res = await api('GET', '/api/staff/orders?fulfillmentType=pickup&status=completed', { token: staff });
    assert.ok(res.body.items.length >= 1);
    for (const order of res.body.items) {
      assert.equal(order.fulfillmentType, 'pickup');
      assert.equal(order.status, 'completed');
    }
  });
});

// ---------------------------------------------------------------------------
describe('staff catalogue management', () => {
  let staff: string;
  before(async () => {
    staff = await login('staff@test.local', 'staff-password-123');
  });

  it('creates, edits and deactivates a product', async () => {
    const created = await api('POST', '/api/staff/products', {
      token: staff,
      body: { name: 'Oat Milk', brand: 'Test Dairy', categoryId: 3, priceCents: 249, unitLabel: '1 L', stockQuantity: 4, lowStockThreshold: 5 },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.product.id;
    assert.equal(created.body.product.isLowStock, true);
    assert.equal(created.body.product.brand, 'Test Dairy');

    const lowStock = await api('GET', '/api/staff/products?lowStock=true', { token: staff });
    assert.ok(lowStock.body.items.some((p: { id: number }) => p.id === id));

    const edited = await api('PATCH', `/api/staff/products/${id}`, { token: staff, body: { priceCents: 199, brand: '' } });
    assert.equal(edited.body.product.priceCents, 199);
    assert.equal(edited.body.product.brand, null, 'an empty brand is cleared');
    assert.equal(edited.body.product.unitLabel, '1 L', 'fields that were not sent stay the same');

    await api('PATCH', `/api/staff/products/${id}`, { token: staff, body: { isActive: false } });
    assert.equal((await api('GET', `/api/products/${id}`)).status, 404);
  });

  it('refuses stock changes that would go below zero', async () => {
    const id = await productIdBySku('SN-004', staff);
    const res = await api('POST', `/api/staff/products/${id}/stock`, { token: staff, body: { adjustBy: -1000 } });
    assert.equal(res.status, 409);
  });

  it('uploads product images and rejects files that are not images', async () => {
    // Use a brand-new product so the shared sample photos are never touched.
    const created = await api('POST', '/api/staff/products', {
      token: staff,
      body: { name: 'Photo Test Loaf', categoryId: 2, priceCents: 300, sku: 'TEST-PHOTO' },
    });
    const id = created.body.product.id;
    assert.equal(created.body.product.imageUrl, null);
    const missingPhoto = async () =>
      (await api('GET', '/api/staff/products?missingPhoto=true&pageSize=200', { token: staff })).body.items.map((p: { id: number }) => p.id);
    assert.ok((await missingPhoto()).includes(id), 'listed under "missing photo"');
    // A real 1×1 pixel PNG.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    const form = new FormData();
    form.append('image', new Blob([png], { type: 'image/png' }), 'bread.png');
    const res = await api('POST', `/api/staff/products/${id}/image`, { token: staff, form });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const imageUrl: string = res.body.product.imageUrl;
    // Every upload is optimised for phones and stored as a compressed JPEG.
    assert.match(imageUrl, /^\/uploads\/products\/.+\.jpg$/);
    assert.ok(!(await missingPhoto()).includes(id), 'no longer missing a photo');

    const served = await fetch(`${baseUrl()}${imageUrl}`);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/jpeg');

    const fake = new FormData();
    fake.append('image', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'evil.png');
    const rejected = await api('POST', `/api/staff/products/${id}/image`, { token: staff, form: fake });
    assert.equal(rejected.status, 400);

    // Clean up the uploaded test image.
    await api('DELETE', `/api/staff/products/${id}/image`, { token: staff });

    // Same again with IMAGE_STORAGE=database (used for hosted deployments).
    const { config } = await import('../src/config.js');
    config.IMAGE_STORAGE = 'database';
    try {
      const dbForm = new FormData();
      dbForm.append('image', new Blob([png], { type: 'image/png' }), 'bread.png');
      const stored = await api('POST', `/api/staff/products/${id}/image`, { token: staff, form: dbForm });
      assert.equal(stored.status, 200, JSON.stringify(stored.body));
      const dbUrl: string = stored.body.product.imageUrl;
      assert.match(dbUrl, /^\/api\/images\/\d+$/);
      const fromDb = await fetch(`${baseUrl()}${dbUrl}`);
      assert.equal(fromDb.status, 200);
      assert.equal(fromDb.headers.get('content-type'), 'image/jpeg');
      const bytes = Buffer.from(await fromDb.arrayBuffer());
      assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], 'a real JPEG');

      await api('DELETE', `/api/staff/products/${id}/image`, { token: staff });
      assert.equal((await fetch(`${baseUrl()}${dbUrl}`)).status, 404, 'removed photos are deleted from the database');
    } finally {
      config.IMAGE_STORAGE = 'disk';
    }
  });

  it('serves the sample photos that ship with the code', async () => {
    const bananas = (await api('GET', '/api/products?search=bananas')).body.items[0];
    assert.equal(bananas.imageUrl, '/sample-images/FV-001.jpg');
    const photo = await fetch(`${baseUrl()}${bananas.imageUrl}`);
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get('content-type'), 'image/jpeg');
  });

  it('manages categories and delivery zones', async () => {
    const category = await api('POST', '/api/staff/categories', { token: staff, body: { name: 'Baby & Toddler' } });
    assert.equal(category.status, 201);
    assert.equal(category.body.category.slug, 'baby-and-toddler');

    const zone = await api('POST', '/api/staff/delivery-zones', {
      token: staff,
      body: { name: 'Riverside', postcodePrefixes: ['sw1 a', '30301'], feeCents: 299 },
    });
    assert.equal(zone.status, 201);
    assert.deepEqual(zone.body.zone.postcodePrefixes, ['SW1A', '30301']);

    const check = await api('GET', '/api/delivery/check?postcode=sw1a%202aa');
    assert.equal(check.body.available, true);
    assert.equal(check.body.zone.name, 'Riverside');
  });
});
