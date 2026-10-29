# How the Meeranji Supermarket app fits together

## The big picture

```
 ┌──────────────────────┐          ┌──────────────────────┐
 │  Customer app        │          │  Staff dashboard     │
 │  (Expo, on a phone)  │          │  (React, in browser) │
 └──────────┬───────────┘          └──────────┬───────────┘
            │  HTTPS/HTTP + JSON               │  (in development, Vite forwards
            │  "Authorization: Bearer <token>" │   /api and /uploads to the API)
            ▼                                  ▼
 ┌─────────────────────────────────────────────────────────┐
 │  API  (Node.js + Express, port 4000)                    │
 │  • checks who you are (login token) and your role       │
 │  • validates every input                                │
 │  • owns ALL business rules: prices, stock, delivery     │
 │    area, pickup slots, order statuses                   │
 │  • serves product photos from backend/uploads/          │
 └──────────────────────────┬──────────────────────────────┘
                            │  SQL (node-postgres)
                            ▼
 ┌─────────────────────────────────────────────────────────┐
 │  PostgreSQL database                                    │
 │  users · addresses · categories · products · inventory  │
 │  delivery_zones · pickup_slots · orders · order_items   │
 │  order_deliveries · order_pickups · order_status_history│
 └─────────────────────────────────────────────────────────┘
```

**The apps never talk to the database directly.** They only call the API. This is what keeps the data safe:
a modified app can't change prices, skip stock checks or see other people's orders, because the API checks
everything again.

## The three code bases

| Folder | Role | Key ideas |
| --- | --- | --- |
| `backend/` | REST API | `routes/` define URLs → `services/` hold the rules → `db/` talks to PostgreSQL. `middleware/auth.ts` checks logins and roles; `middleware/error-handler.ts` turns errors into `{ "error": { code, message } }` |
| `dashboard/` | Staff website | One page per screen in `src/pages/`. `lib/api.ts` adds the login token to every request. Pages refresh automatically so new orders appear |
| `mobile/` | Customer app | Expo Router: every file in `src/app/` is a screen. `(tabs)/` is the bottom tab bar. The cart lives on the phone (`context/CartContext.tsx`); login and store info are shared through React context |

## Finding the API from a phone

On your computer the API is `http://localhost:4000`, but on a phone "localhost" means *the phone itself*.
So the mobile app (`mobile/src/api/client.ts`) asks Expo which computer it was loaded from (e.g. `192.168.1.20`)
and uses `http://192.168.1.20:4000`. You can override this with `EXPO_PUBLIC_API_URL` in `mobile/.env`.

## Logging in (authentication & roles)

1. The app sends email + password to `POST /api/auth/login`.
2. The API compares the password with the **bcrypt hash** stored in `users.password_hash`. Raw passwords are never stored.
3. If it matches, the API returns a signed **JWT token** (valid for `JWT_EXPIRES_IN`, default 7 days).
4. The app stores the token: **SecureStore** (encrypted) on phones, `localStorage` in the browser.
   Every later request sends `Authorization: Bearer <token>`.
5. On each request, `requireAuth` checks the token signature **and** reloads the user from the database,
   so a disabled account or changed role takes effect immediately.
6. Everything under `/api/staff/*` also passes `requireStaff` (staff **or** manager). Customers get `403 Forbidden`.
   Manager-only routes (prices, products, categories, delivery zones, settings, offers, refunds, staff accounts)
   also pass `requireManager`.
7. **Logging out** = the app deletes its token.

There are three roles:

| Role | Can |
| --- | --- |
| `customer` | Shop, pay, track orders, lists, help requests (anyone who signs up) |
| `staff` | Orders (statuses, substitutions, notes, cancelling **unpaid** orders), stock changes with a reason, photos, customer help, WhatsApp log |
| `manager` | Everything staff can, plus prices and products, categories, delivery zones, opening hours, offers, loyalty, cancelling paid orders, retrying refunds and staff accounts |

Managers create staff accounts in the dashboard (**Staff accounts**); the very first one comes from the seed script
(development) or `npm run create-staff` (live).

## Placing an order (why stock can't be oversold)

```
App                            API                                         Database
 │  POST /api/checkout/quote    │  look up current prices, stock, zone, slot    │
 │ ───────────────────────────▶ │ ───────────────────────────────────────────▶ │
 │  ◀── totals + any problems ──│      (nothing is saved — just a price check) │
 │                              │                                              │
 │  POST /api/orders            │  BEGIN TRANSACTION                           │
 │  { items (+ substitution     │  1. same idempotency key seen before?        │
 │    choice), fulfillment,     │     → return that order (double-tap safe)    │
 │    paymentMethod, …}         │                                              │
 │    idempotencyKey }          │  2. SELECT … FROM inventory … FOR UPDATE     │
 │ ───────────────────────────▶ │     (locks these stock rows, in id order)    │
 │                              │  3. re-check prices, stock, address/zone,    │
 │                              │     minimum order, pickup slot               │
 │                              │  4. book the pickup slot (only if not full)  │
 │                              │  5. INSERT order, items, delivery/pickup row │
 │                              │  6. UPDATE inventory: subtract quantities    │
 │                              │     (a trigger records each change in        │
 │                              │      inventory_movements, with the reason)   │
 │                              │  COMMIT  (or ROLLBACK if anything failed)    │
 │  ◀── 201 + the order ────────│                                              │
```

- Because the stock rows are **locked**, two customers buying the last item at the same moment are handled
  one after the other: the second one sees the new stock level and gets a clear `409` error.
- The database itself also has `CHECK (quantity >= 0)` on stock as a last safety net.
- **The app only sends product ids and quantities.** Prices always come from the database.
- Orders **copy** product names, prices and the delivery address, so later edits never change past orders.
- Cancelling an order puts the items back in stock and frees the pickup slot, in one transaction.

## Order statuses

```
Awaiting payment ──(UPI paid)──►                ┌──► Ready for pickup ──┐   (pickup orders)
   (UPI only)                   Order confirmed ──► Preparing           ├──► Completed
                                (pay on delivery │                      │
                                 starts here)    └──► Out for delivery ─┘   (delivery orders)

Any status except Completed ──► Cancelled (with a reason; customers can cancel until Preparing starts;
                                unpaid UPI orders are cancelled automatically after PAYMENT_TIMEOUT_MINUTES)
```

The API enforces these rules (`services/order.service.ts → nextStatuses`), and the dashboard only shows
the buttons that are allowed. Every status change is recorded in `order_status_history`, and every change of any
kind (payment, refund, substitution, note, cancellation) in `order_events`. Customers get an in-app update for each
step (`notifications`), and a WhatsApp message if they asked for one (`whatsapp_messages`).
"Pay on delivery/collection" orders are marked **paid** when completed.

## Payments and refunds

- UPI payments are created **on the server** (`services/payment.service.ts`). The customer pays on our hosted page
  `/pay/<token>`, which opens Razorpay Checkout (UPI only). In demo mode the same page offers practice buttons instead.
- An order is only marked paid after the server checks the payment **with Razorpay** (signature + the payment's
  amount, currency, order and status). Webhooks (`/api/webhooks/razorpay`, signature-checked, each event handled
  once) and "Check payment status" do the same checks.
- Each attempt is a row in `payments` (gateway references, status, amount, times). No UPI PIN, UPI ID, card or bank
  details are stored.
- Refunds (`refunds`) are created automatically for cancelled paid orders, removed or cheaper substituted items,
  duplicate payments and payments that arrive after an order was cancelled.

Setup and costs: [INTEGRATIONS.md](INTEGRATIONS.md).

## Substitutions

For each cart item the customer chooses: **don't replace**, **a similar item**, or **a specific product**. When staff
can't find an item they remove it (not charged) or replace it. A replacement is charged at most the original line's
price, and replacing against the customer's choice needs a "customer agreed" confirmation. Totals, loyalty points and
refunds are recalculated automatically.

## Delivery area & pickup slots

- **Delivery zones** (`delivery_zones`) list PIN codes or PIN-code **prefixes**. A PIN code belongs to the zone with the
  longest matching prefix. Each zone has a fee, an optional free-delivery threshold and a minimum order.
  Staff edit zones in the dashboard.
- **Pickup slots** (`pickup_slots`) are created automatically for today plus the configured days ahead, using the
  **opening hours** and **closed days** set in the dashboard (`store_settings`, `opening_hours`, `store_closures`;
  the `PICKUP_*` settings are only the starting values) and the store's time zone. Each slot has a capacity; booking is a single atomic
  `UPDATE … WHERE booked_count < capacity`, so a slot can never be overbooked.

## Data model

```
users ──< addresses, shopping_lists ──< shopping_list_items, loyalty_ledger, notifications, support_requests
users ──< orders ──< order_items >── products >── categories
             │                         │
             ├── order_deliveries      ├── inventory (1:1, quantity + low-stock threshold)
             ├── order_pickups >── pickup_slots   └──< inventory_movements (stock audit trail)
             ├──< order_status_history, order_events (audit trail)
             ├──< payments, refunds, order_promotions
             └──< whatsapp_messages
delivery_zones (used by addresses at checkout; copied into order_deliveries)
store_settings, opening_hours, store_closures, promotions ──< promotion_items, processed_webhooks
```

The full schema with comments is in [`backend/db/migrations/001_initial_schema.sql`](../backend/db/migrations/001_initial_schema.sql).
Money is stored as whole **paise** (integers) to avoid rounding errors: `4550` = ₹45.50.

Later changes: `002_product_images.sql` (photos stored in the database), `003_product_brand.sql` (the
`products.brand` column, plus the `sample_data_versions` table described below) and `004_operations.sql`
(payments, refunds, notifications, WhatsApp log, substitutions, audit history, settings, lists, loyalty, offers,
help requests, Tamil names, category photos and the manager role).

**Changing the schema later:** add a new file such as `005_something.sql` to `backend/db/migrations/`.
It runs automatically (once) the next time the API starts, or with `npm run db:migrate`.

## Store details and sample data

- **Store name, address and phone numbers** come from the `STORE_NAME`, `STORE_ADDRESS` and `STORE_PHONE` settings.
  `GET /api/store` sends them to both apps; `STORE_PHONE` may list several numbers, each returned with a display
  form and a `tel:` form for tap-to-call links.
- **The sample catalogue** lives in [`backend/src/db/seed-data.ts`](../backend/src/db/seed-data.ts). It is loaded
  into an empty database on first start (development, or `LOAD_SAMPLE_DATA=true`). When the catalogue grows, its
  `SAMPLE_DATA_VERSION` changes, and the next start adds the new products to an existing database **once**, recorded
  in `sample_data_versions`, so products staff later edit, hide or re-SKU are never brought back.
- **Sample photos** are files in `backend/seed-images/products/<SKU>.jpg`, served at `/sample-images/…`. Products
  without one show a labelled "Image needed" placeholder until staff upload a photo. Each sample photo's source, author
  and licence are in `backend/seed-images/sources.json`, which the API uses for `imageCredit` and which generates
  `CREDITS.md`; tests check that every file is listed, freely licensed and small enough for phones.

## Security summary

| Protection | Where |
| --- | --- |
| Passwords hashed with bcrypt | `routes/auth.routes.ts` |
| Login tokens (JWT) signed with `JWT_SECRET`; user re-checked on every request | `middleware/auth.ts` |
| Staff-only and manager-only routes | `routes/staff/*` (`requireStaff`, `requireManager`) |
| Payments verified on the server (signature + gateway lookup); webhooks signature-checked and de-duplicated | `services/payment.service.ts`, `services/razorpay.ts`, `routes/payment.routes.ts` |
| Payment page: one-time random link, strict Content-Security-Policy, only returns to our own apps | `routes/payment.routes.ts`, `services/payment-page.ts` |
| WhatsApp webhooks signature-checked; staff see only the last 4 digits of phone numbers | `services/notification.service.ts`, `routes/staff/staff-admin.routes.ts` |
| Audit trail for stock and orders | `inventory_movements` (database trigger), `order_events` |
| Customers can only see their own orders and addresses | queries filter by the logged-in user id |
| Every input validated (zod), with clear error messages | `lib/validation.ts` + each route |
| Server-side prices, stock locking, idempotent order creation | `services/checkout.service.ts`, `services/order.service.ts` |
| Login rate limiting (30 tries / 15 min / IP) | `routes/auth.routes.ts` |
| Security headers (helmet), CORS allow-list, JSON size limit | `app.ts` |
| Upload checks: image types only, 8 MB max, file contents verified, re-encoded as JPEG | `routes/staff/staff-products.routes.ts`, `services/image.service.ts` |
| No UPI PIN, UPI ID, card or bank data is ever collected or stored | payments go through Razorpay's own checkout |
| Secrets only in `.env` (git-ignored); `.env.example` has placeholders | project root |
