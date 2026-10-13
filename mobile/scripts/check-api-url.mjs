// Runs before the web build on Vercel. The customer app website is separate from
// the API, so it must be told the API's address at build time.
if (process.env.VERCEL && !process.env.EXPO_PUBLIC_API_URL) {
  console.error(
    'EXPO_PUBLIC_API_URL is not set. In Vercel → this project → Settings → Environment Variables, ' +
      'add EXPO_PUBLIC_API_URL = your API address (e.g. https://your-api.vercel.app), then redeploy.',
  );
  process.exit(1);
}
console.log(`Customer app will use the API at: ${process.env.EXPO_PUBLIC_API_URL ?? '(automatic, local development)'}`);
