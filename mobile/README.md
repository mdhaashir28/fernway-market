# Meeranji Supermarket — customer app

React Native + Expo (SDK 57) + Expo Router + TypeScript.

Run it from the **project root** with `npm run mobile` (start `npm run dev` first in another terminal), then scan
the QR code with Expo Go, or press `w` to open it in a web browser. See the main [README](../README.md).

- `src/app/` — screens (Expo Router: each file is a route; `(tabs)/` is the bottom tab bar)
- `src/components/` — buttons, product cards, loading/empty/error states, …
- `src/context/` — login (`AuthContext`), cart (`CartContext`), store info, toasts
- `src/api/client.ts` — finds and talks to the API (override with `EXPO_PUBLIC_API_URL` in `mobile/.env`)
- `src/theme.ts` — brand colours, spacing and font sizes

Building real app-store versions: https://docs.expo.dev/build/introduction/
