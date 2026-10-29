# Meeranji Supermarket

**#78/153 Bazaar Street, Pernambut - 635 810, Vellore District, Tamil Nadu** · Phone 97895 62928 · 90030 71616

A complete shopping app for a single supermarket:

| Part | What it is | Built with | Runs at |
| --- | --- | --- | --- |
| **Customer app** | Phone app in **English and Tamil**: browsing, search, cart with substitution choices, checkout (delivery **or** pickup, UPI **or** pay on delivery), order tracking and updates, shopping lists, order again, help | React Native + Expo + TypeScript | Expo Go on your phone (or a web browser) |
| **Staff dashboard** | Website for staff and managers: orders, substitutions, payments and refunds, products, stock history, categories, delivery zones, opening hours, offers, customer help, WhatsApp log, staff accounts | React + Vite + TypeScript | http://localhost:5173 |
| **API** | The "server" that every app talks to. Holds all business rules | Node.js + Express + TypeScript | http://localhost:4000 |
| **Database** | Where everything is stored | PostgreSQL | port 5433 (local) |

Prices are in **Indian rupees (₹)**. **UPI payments** (through Razorpay) and **WhatsApp order updates** (through the
official WhatsApp Business Platform) are both in a clearly labelled **demo mode** until you add your own accounts —
see [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md). No UPI PIN, card or bank details are ever collected or stored.

> **How it fits together:** see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
> **Every API endpoint with examples:** see [docs/API.md](docs/API.md).
> **Setting up UPI payments and WhatsApp (and what they cost):** see [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).
> **Uploading to GitHub and putting it online:** see [DEPLOY.md](DEPLOY.md).

---

## 1. What you need

1. **Node.js 20.11 or newer** (the "LTS" version) from https://nodejs.org. Check with `node --version`.
2. **For the phone app:** the free **Expo Go** app from the App Store or Google Play. Your phone and computer must be on the **same Wi-Fi network**.
   No phone? You can use the app in a web browser instead (see step 4).
3. **That's it.** You do **not** need to install PostgreSQL. The project starts a real PostgreSQL database for you (see "Why no PostgreSQL install?" below).

> **Windows users: keep the project in a short folder**, for example `C:\Projects\fernway-market`.
> PostgreSQL's Windows tools cannot open files whose full path is longer than 260 characters, and
> deeply nested folders (or very long OneDrive paths) can hit that limit.

---

## 2. First-time setup (once)

Open a terminal **in the project folder** (the one containing this README) and run:

```bash
npm run setup
```

This will:

- install the packages for the API, dashboard and mobile app (takes a few minutes the first time), and
- create your private **`.env`** settings file with random secrets and your time zone.

At the end it prints your **sample logins** (they are also saved in `.env`):

```
Staff dashboard  staff@fernway.local     /  <random password>   (a manager account)
Customer app     customer@fernway.local  /  <random password>
```

---

## 3. Start the database, API and staff dashboard

```bash
npm run dev
```

Wait until you see **`🛒 Meeranji Supermarket API is running`**. The first start also:

- creates all the database tables, and
- adds sample data: 97 products in 12 categories (rice, dals, spices, Hindustan Unilever household and personal-care
  brands, Nestlé brands and more), 2 delivery zones around Pernambut, 4 example orders and the two sample accounts.
  See [Sample products, prices and photos](#sample-products-prices-and-photos).

Then open **http://localhost:5173** and log in with the **staff** account.

Keep this terminal open. Press `Ctrl + C` to stop everything.

---

## 4. Start the customer app

Open a **second** terminal in the project folder:

```bash
npm run mobile
```

A QR code appears:

- **Android:** open Expo Go → *Scan QR code*.
- **iPhone:** open the Camera app and point it at the QR code.
- **No phone?** Press **`w`** in the terminal to open the app in your web browser.

Log in with the **customer** account (or create a new account in the app).

> The app automatically finds the API on your computer. If it can't connect, see [Troubleshooting](#9-troubleshooting).

---

## 5. Try it out

1. **Customer app:** browse a category, search "dal", "paruppu", "Maggi" or "surf excel", add items to the cart, then go to **Checkout**.
   - **Delivery:** the sample address (PIN code `635810`, Pernambut) is in the delivery area: ₹30 fee, **free over ₹500**.
   - **Pickup:** choose a day and a collection time. Pickup is always free.
   - In the cart, choose what should happen **if an item is unavailable**: don't replace it, a similar item, or a product you pick.
   - Choose **Pay on delivery/collection**, or **Pay now with UPI**. In demo mode a practice payment page opens
     (marked **DEMO PAYMENT**) where you can try *success*, *failure*, *pending* and *cancel* — no money moves.
   - Tap **English / தமிழ்** on the home screen to switch the whole app to Tamil.
2. **Staff dashboard:** your new order appears under **Orders** (it refreshes every 30 seconds). Open it and press
   **Start preparing** → **Mark ready for pickup / Send out for delivery** → **Mark as completed**.
   If an item can't be found, press **Can't find it** to remove or replace it. The customer's choice is shown, and they
   never pay more than they ordered (paid orders are refunded the difference automatically).
3. **Customer app:** the order screen updates by itself (every 20 seconds, or pull down to refresh), and every change
   appears under **Account → Updates**. Finished orders have **Order again**.
4. **Staff dashboard → WhatsApp log:** in demo mode, read the WhatsApp messages the customer *would* have received.

**PIN codes to test the delivery area** (sample zones — check them and set your real areas and fees)

| PIN code | Result |
| --- | --- |
| `635810` (Pernambut) | ✅ "Pernambut": ₹30 delivery, free over ₹500 |
| `635802` (Ambur), `632602` (Gudiyattam) | ✅ "Ambur & Gudiyattam": ₹50 delivery, free over ₹999, minimum order ₹199 |
| anything else (e.g. `600001`) | ❌ outside the delivery area, so pickup only |

Change the zones in the dashboard under **Delivery zones**. A zone can list full PIN codes, or a shorter prefix:
`6358` covers every PIN code from `635800` to `635899`.

---

## 6. Everyday commands

Run these from the project folder:

| Command | What it does |
| --- | --- |
| `npm run dev` | Start database + API + staff dashboard |
| `npm run mobile` | Start the customer app (Expo) |
| `npm run dev:no-db` | Start API + dashboard only (if you use your own PostgreSQL) |
| `npm run db:local` | Start only the local PostgreSQL database |
| `npm run db:migrate` | Create or update database tables |
| `npm run db:seed` | Add the sample data (safe to run again, never duplicates) |
| `npm run db:reset` | ⚠️ **Delete all data** and start again with fresh sample data |
| `npm test` | Run the API tests (needs the database running) |
| `npm run typecheck` | Check all TypeScript code for mistakes |
| `npm run create-staff -- --email you@example.com --password "a-long-password" --name "Your Name" --role staff` | Create a staff (or `--role manager`) account. The first account defaults to manager |

---

## 7. Settings (`.env`)

All settings live in **one file**, `.env`, in the project folder. `npm run setup` creates it from
[`.env.example`](.env.example), which has placeholder values only.

| Setting | What it's for |
| --- | --- |
| `DATABASE_URL` | Where the database is (user, password, port, name) |
| `JWT_SECRET` | Secret used to sign logins. Long and random, never share it |
| `STORE_NAME`, `STORE_ADDRESS`, `STORE_PHONE` | Shown in the apps. Put the address in quotes (it starts with `#`). `STORE_PHONE` can hold several numbers separated by commas, e.g. `9789562928, 9003071616`; each one gets a tap-to-call button in the app |
| `CURRENCY` | `INR` by default. Prices are stored in paise (₹45.50 = `4550`) |
| `STORE_TIMEZONE` | Used for pickup times and "today" (e.g. `Asia/Kolkata`) |
| `PICKUP_*` | Pickup opening hours, slot length, orders per slot, days ahead, notice time |
| `IMAGE_STORAGE` | `disk` (default) or `database`, which keeps uploaded photos in PostgreSQL (for hosts that wipe their disk) |
| `LOAD_SAMPLE_DATA` | `true` loads the sample data even in production (demo deployments only) |
| `PAYMENTS_MODE`, `RAZORPAY_*`, `PAYMENT_TIMEOUT_MINUTES` | UPI payments: `demo` (default) or `razorpay` (Razorpay test mode with `rzp_test_` keys). Live keys are refused unless `RAZORPAY_ALLOW_LIVE_PAYMENTS=true`. See [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) |
| `WHATSAPP_MODE`, `WHATSAPP_*` | WhatsApp order updates: `demo` (default), `cloud_api` or `off`. See [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) |
| `PUBLIC_API_URL` | The API's public web address, used in payment links (optional on your computer) |
| `SEED_*` | Sample staff/customer logins (local development and demos). Change a password here and restart the API, and the login changes to match |

After changing `.env`, stop (`Ctrl + C`) and restart `npm run dev`.

**Never commit `.env` to git or share it.** It's already in `.gitignore`.

---

## 8. Good to know

### Why no PostgreSQL install?
`npm run dev` uses the [`embedded-postgres`](https://www.npmjs.com/package/embedded-postgres) package. It's the
**official PostgreSQL server**, packaged so npm can install it, and it stores its data in `backend/.local-postgres/`.
This is purely for convenience while developing. If you'd rather use your own PostgreSQL:

1. Install PostgreSQL from https://www.postgresql.org/download/ (or use a hosted database).
2. Create a user and database, e.g. in `psql`:
   ```sql
   CREATE USER fernway WITH PASSWORD 'choose-a-password';
   CREATE DATABASE fernway_market OWNER fernway;
   ```
3. Set `DATABASE_URL=postgres://fernway:choose-a-password@localhost:5432/fernway_market` in `.env`.
4. Run `npm run dev:no-db`. Tables and sample data are created automatically.

### Payments (UPI demo until you add Razorpay)
Customers choose **pay on delivery/collection** or **pay now with UPI**. UPI payments go through Razorpay's secure
checkout, and the customer enters their UPI PIN only in their own UPI app. The server creates each payment and checks
the result with Razorpay (signature, amount and status) before an order is marked paid. Unpaid UPI orders hold their
items for 15 minutes and are then cancelled automatically. Refunds for cancelled or changed paid orders are automatic.

Until you set `PAYMENTS_MODE=razorpay` with your own keys, a **clearly labelled demo** payment page is used and no money
moves. With Razorpay **test** keys (`rzp_test_…`) customers see Razorpay's real checkout in **test mode**: nothing is
charged, and the app, payment page and dashboard say "Razorpay TEST mode". **Live** keys charge real money; the API
refuses to start with them unless `RAZORPAY_ALLOW_LIVE_PAYMENTS=true`. **Neither test nor live payments have been tried
with a real Razorpay account yet.** Follow [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) first.

### WhatsApp order updates (demo until you set up Meta's WhatsApp Business Platform)
Customers can ask for order updates on WhatsApp, in English or Tamil. In demo mode the messages are only recorded and
shown in the dashboard's **WhatsApp log**. Real sending uses Meta's official Cloud API with approved templates, never
unofficial WhatsApp tools. Setup, templates and costs: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).

### Staff roles
- **Staff** run orders (statuses, substitutions, notes), adjust stock (always with a reason), upload photos and reply
  to customer help requests. They can't change prices or settings, or cancel orders that were paid online.
- **Managers** can do everything, including prices, products, categories, delivery zones, opening hours, offers,
  loyalty points, refunds and staff accounts. The sample staff login is a manager.

### History of every change
Every stock change is recorded automatically by the database with the reason, the order and the person
(**Stock history** in the dashboard). Every order change (status, payment, refund, substitution, cancellation,
staff note) is listed under **Activity** on the order.

### Optional extras: offers and loyalty points
Bundle **offers** (for example "Sambar combo, save ₹20") and **loyalty points** are both **switched off** by default.
A manager can switch them on under **Store settings** and **Offers**.

### Delivery area (no paid maps service)
Instead of a paid maps/geocoding API (like Google Maps), the delivery area is defined by **PIN codes** (or PIN-code
prefixes). It's free, works offline and is easy for staff to change in the dashboard.

### Sample products, prices and photos
- **All sample prices and stock levels are made-up demo values**, not official or current prices. Check each
  product in the dashboard (**Products → Edit**) and set your own prices, pack sizes and stock before taking real orders.
- Each product has a name, **brand**, category, **pack size**, price, description, stock and a photo (or placeholder).
  Staples the store packs itself use the brand "Store packed". Search finds products by name, brand, Tamil name
  (e.g. "paruppu"), description and SKU, with or without accents ("nescafe" finds Nescafé).
- **Loading the sample products into an existing database:** just restart the API (`npm run dev`). On start it adds
  any sample products that are new since your database was created, once, without touching products you have
  edited. You can also run `npm run db:seed`, which additionally fills in sample photos for products that have none.
- **Photos:** 64 products have real photos from Wikimedia Commons, used under free licences. Each photo's source,
  author and licence are recorded in [backend/seed-images/sources.json](backend/seed-images/sources.json), which
  generates [backend/seed-images/CREDITS.md](backend/seed-images/CREDITS.md) (`npm --prefix backend run image-credits`).
  None of them are official brand images. The customer app shows each photo's credit, and lists them all under
  **Help → Photo credits**.
- **Image needed:** the other 33 products (all the Hindustan Unilever and Nestlé items, and staples such as Ponni Raw
  Rice and Dosa Rice) show a clearly labelled **"Image needed"** placeholder, never an emoji or an unrelated photo. The
  dashboard marks them **Image needed** and the **Image needed only** filter lists them.
- **Category photos:** every category has a real photograph from Wikimedia Commons, credited in the same files.
  Managers can replace them under **Categories → Edit**.
- **Adding photos:** **Products → Edit → Upload photo** (JPG/PNG/WebP up to 8 MB, resized and compressed automatically).
  Use photos you're allowed to use; the easiest is to photograph the packs on your own shelves. Never copy photos from
  shopping websites. On your computer they're saved in
  `backend/uploads/products/`; with `IMAGE_STORAGE=database` (used online) they're stored in PostgreSQL, so they survive redeploys.

### Stock can't be oversold
When an order is placed, the API locks the stock rows, re-checks every price and quantity, and only then
saves the order. Everything happens in one database transaction. The database also refuses negative stock.
A test fires 12 simultaneous orders at 5 items and checks that exactly 5 succeed.

---

## 9. Troubleshooting

| Problem | Fix |
| --- | --- |
| **Phone app says "We couldn't reach the store"** | Phone and computer must be on the same Wi-Fi. The **Account** tab shows the address the app is using ("Connected to …"); open that address + `/api/health` in your phone's browser to test. If Windows asked to allow **Node.js** through the firewall, choose **Allow** (private networks). Still stuck? Copy `mobile/.env.example` to `mobile/.env`, set `EXPO_PUBLIC_API_URL=http://YOUR-COMPUTER-IP:4000`, and restart `npm run mobile`. (Find your IP with `ipconfig`; the API also prints it when it starts.) |
| **Expo Go says the project is incompatible** | Update Expo Go from the app store. This project uses Expo SDK 57. Or press `w` to use the web version. |
| **Expo Go on iPhone asks you to sign in** | Create a free account at https://expo.dev, sign in to Expo Go, and run `npx expo login` in the `mobile` folder with the same account. |
| **"Could not start the local PostgreSQL database … path is too long"** | Move the project to a short folder like `C:\Projects\fernway-market`, delete `backend\node_modules` and `backend\.local-postgres`, then run `npm run setup` again. |
| **"Port 4000/5173/5433 is already in use"** | Another copy is still running. Close other terminals, or change `PORT` / the port in `DATABASE_URL` in `.env`. |
| **"Some settings in your .env file are missing or invalid"** | The message lists what to fix. To start over, delete `.env` and run `npm run setup`. |
| **Staff login says "This is a customer account"** | Use the staff login from `.env` (`SEED_STAFF_EMAIL` / `SEED_STAFF_PASSWORD`). |
| **I want a clean slate** | `npm run db:reset` (deletes all data and reloads the samples). |

---

## 10. Project structure

```
fernway-market/
├── .env.example            ← settings template (placeholders only)
├── package.json            ← the "npm run …" helper commands
├── scripts/setup.mjs       ← one-time setup
├── docs/
│   ├── ARCHITECTURE.md     ← how the parts connect
│   └── API.md              ← every endpoint with examples
├── backend/                ← API (Node.js + Express + TypeScript)
│   ├── db/migrations/      ← database schema (SQL)
│   ├── seed-images/        ← sample product photos + CREDITS.md (photo credits, products still needing photos)
│   ├── uploads/            ← photos uploaded by staff
│   ├── src/
│   │   ├── routes/         ← URL endpoints (customer + staff/)
│   │   ├── services/       ← business rules: checkout, orders, delivery, pickup slots
│   │   ├── middleware/     ← login checks, error handling
│   │   ├── db/             ← connection, migrations runner, sample data (seed-data.ts = sample catalogue)
│   │   └── scripts/        ← db:local, db:migrate, db:seed, db:reset, create-staff
│   └── test/               ← automated API tests
├── dashboard/              ← staff website (React + Vite)
│   └── src/  pages/ components/ context/ lib/
└── mobile/                 ← customer app (Expo + Expo Router)
    └── src/
        ├── app/            ← one file per screen (tabs, product, checkout, order…)
        ├── components/     ← buttons, product cards, empty/error/loading states…
        ├── context/        ← login, cart, store info, toasts
        └── api/            ← talks to the API
```

---

## 11. Before going live (checklist)

**Step-by-step deployment (GitHub + Render + Expo EAS): [DEPLOY.md](DEPLOY.md).**

This project is a solid starting point, but a public launch needs a few more things:

- [ ] Host the API and a managed PostgreSQL database; use **HTTPS** everywhere.
- [ ] Set `NODE_ENV=production`, a new long `JWT_SECRET`, and `CORS_ORIGINS` to your real dashboard address.
- [ ] Remove the sample accounts and data. `db:seed`/`db:reset` refuse to run in production.
- [ ] Use a long-lived database plan with automated backups.
- [ ] For UPI payments: complete the Razorpay go-live checklist in [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) (test mode first).
- [ ] For WhatsApp updates: set up the WhatsApp Business Platform and get the templates approved ([docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)).
- [ ] Publish your terms, refund/cancellation, privacy and delivery policies (Razorpay needs them).
- [ ] Set your real opening hours, holidays and delivery zones in the dashboard.
- [ ] Build the phone app for the stores with EAS: https://docs.expo.dev/build/introduction/.
- [ ] Optional extras: password reset emails, phone push notifications for order updates.
