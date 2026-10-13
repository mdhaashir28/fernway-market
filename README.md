# 🌿 Fernway Market

A complete shopping app for a single supermarket:

| Part | What it is | Built with | Runs at |
| --- | --- | --- | --- |
| **Customer app** | Phone app for browsing, cart, checkout (delivery **or** pickup) and order tracking | React Native + Expo + TypeScript | Expo Go on your phone (or a web browser) |
| **Staff dashboard** | Website for staff: orders, products, stock, categories, delivery zones | React + Vite + TypeScript | http://localhost:5173 |
| **API** | The "server" that every app talks to. Holds all business rules | Node.js + Express + TypeScript | http://localhost:4000 |
| **Database** | Where everything is stored | PostgreSQL | port 5433 (local) |

Prices are in **Indian rupees (₹)**. Payments are a **demo**: no real card details are ever collected.

> **How it fits together:** see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
> **Every API endpoint with examples:** see [docs/API.md](docs/API.md).
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
Staff dashboard  staff@fernway.local     /  <random password>
Customer app     customer@fernway.local  /  <random password>
```

---

## 3. Start the database, API and staff dashboard

```bash
npm run dev
```

Wait until you see **`🛒 Fernway Market API is running`**. The first start also:

- creates all the database tables, and
- adds sample data: 46 products with photos, 9 categories, 2 delivery zones, 4 example orders and the two sample accounts.

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

1. **Customer app:** browse a category, search "milk", add items to the cart, then go to **Checkout**.
   - **Delivery:** the sample address (postcode `10001`) is in the delivery area: ₹30 fee, **free over ₹500**.
   - **Pickup:** choose a day and a collection time. Pickup is always free.
   - Choose **Pay on delivery/collection**, or the clearly labelled **Demo card payment** (nothing is charged).
2. **Staff dashboard:** your new order appears under **Orders** (it refreshes every 30 seconds). Open it and press
   **Start preparing** → **Mark ready for pickup / Send out for delivery** → **Mark as completed**.
3. **Customer app:** the order screen updates by itself (every 20 seconds, or pull down to refresh).

**Postcodes to test the delivery area**

| Postcode | Result |
| --- | --- |
| `10001` – `10009` | ✅ "Central": ₹30 delivery, free over ₹500 |
| `10010` – `10029` | ✅ "Outer neighbourhoods": ₹50 delivery, free over ₹999, minimum order ₹199 |
| anything else (e.g. `560001`) | ❌ outside the delivery area, so pickup only |

Change the zones to your real area in the dashboard under **Delivery zones**. For example, a zone with the prefix `5600` covers Bengaluru PIN codes `560001`–`560099`.

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
| `npm run create-staff -- --email you@example.com --password "a-long-password" --name "Your Name"` | Create another staff account |

---

## 7. Settings (`.env`)

All settings live in **one file**, `.env`, in the project folder. `npm run setup` creates it from
[`.env.example`](.env.example), which has placeholder values only.

| Setting | What it's for |
| --- | --- |
| `DATABASE_URL` | Where the database is (user, password, port, name) |
| `JWT_SECRET` | Secret used to sign logins. Long and random, never share it |
| `STORE_NAME`, `STORE_ADDRESS`, `STORE_PHONE` | Shown in the apps |
| `CURRENCY` | `INR` by default. Prices are stored in paise (₹45.50 = `4550`) |
| `STORE_TIMEZONE` | Used for pickup times and "today" (e.g. `Asia/Kolkata`) |
| `PICKUP_*` | Pickup opening hours, slot length, orders per slot, days ahead, notice time |
| `IMAGE_STORAGE` | `disk` (default) or `database`, which keeps uploaded photos in PostgreSQL (for hosts that wipe their disk) |
| `LOAD_SAMPLE_DATA` | `true` loads the sample data even in production (demo deployments only) |
| `SEED_*` | Sample staff/customer logins, **local development only** |

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

### Payments (demo only)
This first version has **no real payment processing** and never asks for card numbers. Customers choose
**pay on delivery/collection** or a **demo card payment** that just marks the order as paid.
Adding real payments needs an account with a payment provider (e.g. Razorpay or Stripe). That is a paid service
that needs API keys. You would use their *test mode* first, and card details would go straight to the provider,
never to this API.

### Delivery area (no paid maps service)
Instead of a paid maps/geocoding API (like Google Maps), the delivery area is defined by **postcode prefixes**.
It's free, works offline and is easy for staff to change in the dashboard.

### Product photos
- Staff upload photos in the dashboard (**Products → Edit → Upload photo**, JPG/PNG/WebP up to 5 MB).
  On your computer they're saved in `backend/uploads/products/`. With `IMAGE_STORAGE=database` (used for the
  online version) they're stored in PostgreSQL instead, so they survive redeploys. A very large shop might
  later move them to cloud storage such as Amazon S3.
- The **sample photos** come from Wikimedia Commons under free licences. Some licences require credit, which is
  given in [backend/seed-images/CREDITS.md](backend/seed-images/CREDITS.md). Replace them with your own photos before going live.

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
│   ├── seed-images/        ← sample product photos + CREDITS.md
│   ├── uploads/            ← photos uploaded by staff
│   ├── src/
│   │   ├── routes/         ← URL endpoints (customer + staff/)
│   │   ├── services/       ← business rules: checkout, orders, delivery, pickup slots
│   │   ├── middleware/     ← login checks, error handling
│   │   ├── db/             ← connection, migrations runner, sample data
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
- [ ] Add a real payment provider (in its test mode first) if you want online payments.
- [ ] Build the phone app for the stores with EAS: https://docs.expo.dev/build/introduction/.
- [ ] Optional extras: password reset emails, push notifications for order updates, staff roles (manager vs picker).
