// npm run db:reset — DELETES ALL DATA, rebuilds the tables and reloads the
// sample data. Development only. Handy when you want a clean start.
import { config } from '../config.js';
import { runMigrations } from '../db/migrations.js';
import { pool, waitForDatabase } from '../db/pool.js';
import { seedDatabase } from '../db/seed.js';

if (config.isProduction) {
  console.error('❌ db:reset is disabled when NODE_ENV=production.');
  process.exit(1);
}

try {
  await waitForDatabase();
  console.log('🧹 Removing all tables and data...');
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations();
  await seedDatabase();
  console.log('✅ Database reset complete.');
} catch (err) {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
