# Putting Fernway Market online

**GitHub stores your code. It can't run your API or database.** So deploying has three parts:

| Part | Where it goes | Guide |
| --- | --- | --- |
| Your code | **GitHub** (private repository) | Step 1 |
| Database + API + staff dashboard | **Render**, which reads your GitHub repo and rebuilds on every push | Step 2 |
| Customer app | **Expo EAS**, which builds an Android app (APK) or app-store builds | Step 3 |

> Render is one good beginner-friendly choice. Others (Railway, Fly.io, Neon for the database, Netlify/Vercel
> for the dashboard) work too. Free plans change often. Check each site's pricing page before relying on one.

---

## Step 1 — Upload your code to GitHub

1. Create a free account at https://github.com.
2. Click **New repository** → name it `fernway-market` → choose **Private** → **don't** tick "Add a README" → **Create repository**.
3. In a terminal **in the project folder**, run these one at a time (replace `YOUR-USERNAME`):

```bash
git remote add origin https://github.com/YOUR-USERNAME/fernway-market.git
```
```bash
git branch -M main
```
```bash
git push -u origin main
```

The first push opens a browser window to sign in to GitHub.

**What is *not* uploaded** (on purpose, see `.gitignore`): your `.env` secrets, the local database, uploaded photos and
installed packages (`node_modules`).

**Uploading later changes:**

```bash
git add .
```
```bash
git commit -m "Describe what you changed"
```
```bash
git push
```

---

## Step 2 — Deploy the database, API and dashboard on Render

The file [`render.yaml`](render.yaml) describes everything (a "Blueprint"), so Render can set it all up at once.

1. Sign up at https://render.com using **"Sign in with GitHub"**, and allow Render to see your `fernway-market` repository.
2. In Render, click **New → Blueprint**, choose your `fernway-market` repository, and click **Apply**.
   Render creates three things:
   - `fernway-db` (PostgreSQL)
   - `fernway-api` (the API)
   - `fernway-dashboard` (the staff website)
3. Wait until all three say **Live** (the first build takes a few minutes).
4. **Check the web addresses.** Click each service and look at its URL at the top. The setup file assumes:
   - API: `https://fernway-api.onrender.com`
   - Dashboard: `https://fernway-dashboard.onrender.com`

   If Render gave a different address (for example because the name was taken):
   - `fernway-dashboard` → **Environment** → set `VITE_API_URL` to the API's real address → **Save, rebuild and deploy**.
   - `fernway-api` → **Environment** → set `CORS_ORIGINS` to the dashboard's real address → **Save and deploy**.
5. Test the API: open `https://fernway-api.onrender.com/api/health`, which should show `"status":"ok"`.
6. Open the dashboard and log in:
   - Email: `staff@fernway.local`
   - Password: in Render → `fernway-api` → **Environment** → `SEED_STAFF_PASSWORD` (click the eye icon).

### What the deployed version does differently
- **Photos** staff upload are stored **in the database** (`IMAGE_STORAGE=database`), because free Render servers
  lose their disk on every deploy. The sample photos are part of your code, so they always work.
- **Sample data** is loaded because `LOAD_SAMPLE_DATA=true`. For a real store, set it to `false`, remove the
  `SEED_*` variables, and create your staff login with the Render **Shell** tab:
  `npm run create-staff -- --email you@yourstore.com --password "a-long-password" --name "Your Name"`
- `JWT_SECRET` and the sample passwords are random values Render generates. They're not in your code.

### Free plan limits (check Render's pricing page for the current details)
- A free web service **goes to sleep** after a while without visitors. The next visit takes up to a minute
  while it wakes up (the app waits up to 30 seconds and then shows "Try again").
- Render's **free database is meant for trying things out** and is removed after a limited time. For a real
  store, upgrade the database to a paid plan, or use a database from another provider (for example Neon) and paste its
  connection string into `DATABASE_URL`.

### Updating the live site
Every `git push` to `main` makes Render rebuild and redeploy automatically. Database changes in new
`backend/db/migrations/*.sql` files are applied when the API restarts.

---

## Step 2 (alternative) — Deploy on Vercel

Vercel runs the API as a **serverless function** and hosts the two websites. It has no database of its own,
so you add one from its Marketplace (Neon PostgreSQL). You create **three Vercel projects from the same
GitHub repository**, each with a different **Root Directory**:

| Vercel project | Root Directory | Environment variables to add |
| --- | --- | --- |
| API | `backend` | `DATABASE_URL` (added for you when you connect Neon: Project → **Storage** → **Neon**), `JWT_SECRET` (a long random string), `IMAGE_STORAGE=database`, `CORS_ORIGINS` (the dashboard and customer-app addresses, comma-separated), and for a demo `LOAD_SAMPLE_DATA=true` + `SEED_STAFF_EMAIL`, `SEED_STAFF_PASSWORD`, `SEED_CUSTOMER_EMAIL`, `SEED_CUSTOMER_PASSWORD`. Optional: `CURRENCY=INR`, `STORE_TIMEZONE=Asia/Kolkata`, `STORE_NAME`, `STORE_ADDRESS`, `STORE_PHONE` |
| Staff dashboard | `dashboard` | `VITE_API_URL` = the API's address, e.g. `https://your-api.vercel.app` |
| Customer app (web) | `mobile` | `EXPO_PUBLIC_API_URL` = the API's address |

How it works (already set up in the code):
- `backend/server.js` is the API's Vercel entry point. It serves the code compiled by `npm run build`, so
  TypeScript is checked with the project's own settings. `backend/vercel.json` adds the database migrations and
  sample photos to the function.
- On the first request after a deploy (or after a quiet period), the API creates or updates the database tables, and
  loads the sample data if `LOAD_SAMPLE_DATA=true` and the database is empty. That first request can take a few seconds.
- `dashboard/vercel.json` and `mobile/vercel.json` build the websites and make page refreshes work.
  If `VITE_API_URL` / `EXPO_PUBLIC_API_URL` is missing, the build stops with a message telling you what to add.
- After changing an environment variable, **redeploy** that project (Deployments → ⋯ → Redeploy). The website
  addresses are built in at build time.

---

## Step 3 — The customer app

### Quick option: use the live API from Expo Go
Create `mobile/.env` containing your API's address (Render: `https://fernway-api.onrender.com`, Vercel: `https://fernway-market.vercel.app`):
```
EXPO_PUBLIC_API_URL=https://fernway-market.vercel.app
```
Then run `npm run mobile` and scan the QR code. The app now talks to your online store, from any network.

### Build a real Android app (APK) with Expo EAS
EAS is Expo's build service. It has a free plan with a limited number of builds per month.

1. Create a free account at https://expo.dev.
2. In the `mobile` folder, run these one at a time:
```bash
npx eas-cli@latest login
```
```bash
npx eas-cli@latest init
```
```bash
npx eas-cli@latest build --platform android --profile preview
```
3. When the build finishes, EAS gives you a link. Open it on an Android phone to install the app.

The API address used by builds is set in [`mobile/eas.json`](mobile/eas.json) (`EXPO_PUBLIC_API_URL`). Change it if your
API's address is different. Before publishing, also change the app identifiers `com.example.fernwaymarket` in
`mobile/app.json` to your own (e.g. `com.yourstore.app`).

### Publishing to the app stores
- **Google Play:** one-time $25 developer registration. Build with `--profile production` and upload the result.
- **Apple App Store:** needs an Apple Developer account ($99/year). Build with `--platform ios --profile production`.
- Expo's guide: https://docs.expo.dev/submit/introduction/

---

## Checklist before real customers use it
- [ ] `LOAD_SAMPLE_DATA=false`, sample accounts removed, your own staff account created
- [ ] Database on a paid or long-lived plan, with backups
- [ ] Your real store name, address, phone, delivery zones and products
- [ ] Your own product photos
- [ ] Optional: your own domain name (Render → service → **Settings → Custom Domains**)
