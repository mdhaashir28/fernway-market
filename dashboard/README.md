# Fernway Market — staff dashboard

React + TypeScript + Vite website for store staff.

Run it from the **project root** with `npm run dev` (which also starts the database and API), then open
http://localhost:5173. See the main [README](../README.md) for full setup instructions.

- `src/pages/` — one file per screen (Overview, Orders, Order detail, Products, Product form, Categories, Low stock, Delivery zones)
- `src/components/` — layout and shared UI pieces
- `src/lib/api.ts` — talks to the API (adds the login token)
- `vite.config.ts` — forwards `/api` and `/uploads` to the API during development

To build for production: set `VITE_API_URL` to your API's address, then run `npm run build` and host the `dist/` folder.
