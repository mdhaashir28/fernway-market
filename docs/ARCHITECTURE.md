# How Fernway Market fits together

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
6. Everything under `/api/staff/*` also passes `requireRole('staff')`. Customers get `403 Forbidden`.
7. **Logging out** = the app deletes its token.

There are two roles: `customer` (anyone who signs up) and `staff` (created by the seed script or `npm run create-staff`).

## Placing an order (why stock can't be oversold)

```
App                            API                                         Database
 │  POST /api/checkout/quote    │  look up current prices, stock, zone, slot    │
 │ ───────────────────────────▶ │ ───────────────────────────────────────────▶ │
 │  ◀── totals + any problems ──│      (nothing is saved — just a price check) │
 │                              │                                              │
 │  POST /api/orders            │  BEGIN TRANSACTION                           │
 │  { items, fulfillment,       │  1. same idempotency key seen before?        │
 │    paymentMethod,            │     → return that order (double-tap safe)    │
 │    idempotencyKey }          │  2. SELECT … FROM inventory … FOR UPDATE     │
 │ ───────────────────────────▶ │     (locks these stock rows, in id order)    │
 │                              │  3. re-check prices, stock, address/zone,    │
 │                              │     minimum order, pickup slot               │
 │                              │  4. book the pickup slot (only if not full)  │
 │                              │  5. INSERT order, items, delivery/pickup row │
 │                              │  6. UPDATE inventory: subtract quantities    │
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
            ┌────────────► Ready for pickup ──┐   (pickup orders)
Pending ──► Preparing                          ├──► Completed
            └────────────► Out for delivery ──┘   (delivery orders)

Any status except Completed ──► Cancelled (staff must give a reason;
                                customers can cancel only while Pending)
```

The API enforces these rules (`services/order.service.ts → nextStatuses`), and the dashboard only shows
the buttons that are allowed. Every change is recorded in `order_status_history`, which is the timeline both
apps show. "Pay on delivery/collection" orders are marked **paid** when completed. Demo-card orders are marked
paid immediately, and **refunded** (in name only, it's a demo) if cancelled.

## Delivery area & pickup slots

- **Delivery zones** (`delivery_zones`) list postcode **prefixes**. A postcode belongs to the zone with the
  longest matching prefix. Each zone has a fee, an optional free-delivery threshold and a minimum order.
  Staff edit zones in the dashboard.
- **Pickup slots** (`pickup_slots`) are created automatically for today plus `PICKUP_DAYS_AHEAD` days, using the
  `PICKUP_*` settings and the store's time zone. Each slot has a capacity; booking is a single atomic
  `UPDATE … WHERE booked_count < capacity`, so a slot can never be overbooked.

## Data model

```
users ──< addresses
users ──< orders ──< order_items >── products >── categories
             │                         │
             ├── order_deliveries      └── inventory (1:1, quantity + low-stock threshold)
             ├── order_pickups >── pickup_slots
             └──< order_status_history
delivery_zones (used by addresses at checkout; copied into order_deliveries)
```

The full schema with comments is in [`backend/db/migrations/001_initial_schema.sql`](../backend/db/migrations/001_initial_schema.sql).
Money is stored as whole **paise** (integers) to avoid rounding errors: `4550` = ₹45.50.

**Changing the schema later:** add a new file such as `002_add_brands.sql` to `backend/db/migrations/`.
It runs automatically (once) the next time the API starts, or with `npm run db:migrate`.

## Security summary

| Protection | Where |
| --- | --- |
| Passwords hashed with bcrypt | `routes/auth.routes.ts` |
| Login tokens (JWT) signed with `JWT_SECRET`; user re-checked on every request | `middleware/auth.ts` |
| Staff-only routes | `routes/staff/index.ts` (`requireRole('staff')`) |
| Customers can only see their own orders and addresses | queries filter by the logged-in user id |
| Every input validated (zod), with clear error messages | `lib/validation.ts` + each route |
| Server-side prices, stock locking, idempotent order creation | `services/checkout.service.ts`, `services/order.service.ts` |
| Login rate limiting (30 tries / 15 min / IP) | `routes/auth.routes.ts` |
| Security headers (helmet), CORS allow-list, JSON size limit | `app.ts` |
| Upload checks: image types only, 5 MB max, file contents verified | `routes/staff/staff-products.routes.ts` |
| No card data is ever collected or stored | checkout uses pay-on-fulfilment or a demo payment |
| Secrets only in `.env` (git-ignored); `.env.example` has placeholders | project root |
