// Starts the API: waits for the database, applies migrations, loads sample
// data into an empty development database, then listens for requests.
import os from 'node:os';
import { createApp } from './app.js';
import { config } from './config.js';
import { runMigrations } from './db/migrations.js';
import { pool, waitForDatabase } from './db/pool.js';
import { logError, logWarning, redact } from './lib/logger.js';
import { isDatabaseEmpty, sampleDataAllowed, seedDatabase, syncSampleAccounts, syncSampleCatalog } from './db/seed.js';
import { runMaintenance } from './services/order.service.js';

/** Says clearly which outside services are live, so nobody mistakes a demo for the real thing. */
function describeModes() {
  const payments = {
    demo: 'DEMO (practice payment page — no money moves)',
    test: 'Razorpay TEST mode (test keys — no real money)',
    live: 'Razorpay LIVE — real money is charged',
  }[config.paymentsEnvironment];
  const whatsapp = {
    off: 'off (updates are shown in the app only)',
    demo: 'DEMO (messages are recorded in the dashboard, not sent)',
    cloud_api: 'WhatsApp Cloud API — real messages are sent',
  }[config.WHATSAPP_MODE];
  console.log(`   UPI payments:      ${payments}`);
  console.log(`   WhatsApp updates:  ${whatsapp}`);
  if (config.razorpayKeysMissing) {
    logWarning('PAYMENTS_MODE=razorpay but RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set, so the DEMO payment page is used.');
  }
  if (config.paymentsEnvironment !== 'demo' && !config.RAZORPAY_WEBHOOK_SECRET) {
    logWarning('RAZORPAY_WEBHOOK_SECRET is not set, so Razorpay webhooks are rejected. Payments are still checked when customers return.');
  }
}

/** This computer's Wi-Fi/LAN addresses — the ones a phone on the same network can reach. */
function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((net) => net && net.family === 'IPv4' && !net.internal)
    .map((net) => net!.address);
}

async function main() {
  await waitForDatabase();

  const applied = await runMigrations();
  if (applied) console.log(`✅ Database updated (${applied} migration(s) applied)`);

  if (sampleDataAllowed() && (await isDatabaseEmpty())) {
    console.log('🌱 The database is empty — adding sample data...');
    await seedDatabase();
  }
  // Make the sample logins match the SEED_* settings (e.g. after you change a password in .env).
  await syncSampleAccounts();
  // Add sample products that are new since this database was set up (once per catalogue version).
  await syncSampleCatalog();

  const app = createApp();
  // 0.0.0.0 = accept connections from other devices on your network (your phone).
  const server = app.listen(config.PORT, '0.0.0.0', () => {
    console.log(`\n🛒 ${config.STORE_NAME} API is running`);
    if (config.PUBLIC_API_URL) console.log(`   Address:           ${config.PUBLIC_API_URL}/api/health`);
    if (!config.isProduction) {
      console.log(`   On this computer:  http://localhost:${config.PORT}/api/health`);
      for (const address of lanAddresses()) {
        console.log(`   From your phone:   http://${address}:${config.PORT}/api/health`);
      }
    }
    describeModes();
    console.log('');
  });

  // Every minute: cancel UPI orders that weren't paid in time and send queued WhatsApp messages.
  const maintenance = setInterval(() => void runMaintenance({ force: true }), 60_000);
  maintenance.unref();

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${config.PORT} is already in use. Stop the other program or change PORT in .env.`);
    } else {
      console.error('❌ Server error:', err.message);
    }
    process.exit(1);
  });

  const shutdown = () => {
    server.close(() => pool.end().finally(() => process.exit(0)));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  // Log anything that slipped through (without secrets) instead of failing silently.
  process.on('unhandledRejection', (reason) => logError('Unhandled promise rejection', reason));
}

main().catch((err) => {
  console.error('\n❌ The API could not start.\n  ', redact(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
