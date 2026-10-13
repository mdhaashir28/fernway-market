// Starts the API: waits for the database, applies migrations, loads sample
// data into an empty development database, then listens for requests.
import os from 'node:os';
import { createApp } from './app.js';
import { config } from './config.js';
import { runMigrations } from './db/migrations.js';
import { pool, waitForDatabase } from './db/pool.js';
import { isDatabaseEmpty, sampleDataAllowed, seedDatabase } from './db/seed.js';

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

  const app = createApp();
  // 0.0.0.0 = accept connections from other devices on your network (your phone).
  const server = app.listen(config.PORT, '0.0.0.0', () => {
    console.log(`\n🛒 ${config.STORE_NAME} API is running`);
    console.log(`   On this computer: http://localhost:${config.PORT}/api/health`);
    for (const address of lanAddresses()) {
      console.log(`   From your phone:  http://${address}:${config.PORT}/api/health`);
    }
    console.log('');
  });

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
}

main().catch((err) => {
  console.error('\n❌ The API could not start.\n  ', err instanceof Error ? err.message : err);
  process.exit(1);
});
