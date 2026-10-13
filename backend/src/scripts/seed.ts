// npm run db:seed — adds sample products, categories, delivery zones and test
// accounts (development only). Safe to run again; nothing is duplicated.
import { runMigrations } from '../db/migrations.js';
import { pool, waitForDatabase } from '../db/pool.js';
import { seedDatabase } from '../db/seed.js';

try {
  await waitForDatabase();
  await runMigrations();
  await seedDatabase();
  console.log('✅ Sample data is ready.');
} catch (err) {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
