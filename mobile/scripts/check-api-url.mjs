// Runs before the web build on Vercel and Render. The customer app website is separate
// from the API, so it must be told the API's address at build time.
const host = process.env.VERCEL ? 'Vercel' : process.env.RENDER ? 'Render' : null;
if (host && !process.env.EXPO_PUBLIC_API_URL) {
  console.error(
    `EXPO_PUBLIC_API_URL is not set. In ${host} → the customer app → Environment Variables, ` +
      'add EXPO_PUBLIC_API_URL = your API address (e.g. https://meeranji-api.onrender.com), then redeploy.',
  );
  process.exit(1);
}
console.log(`Customer app will use the API at: ${process.env.EXPO_PUBLIC_API_URL ?? '(automatic, local development)'}`);
