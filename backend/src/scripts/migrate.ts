// npm run db:migrate — creates or updates the database tables.
import { runMigrations } from '../db/migrations.js';
import { pool, waitForDatabase } from '../db/pool.js';

try {
  await waitForDatabase();
  const applied = await runMigrations();
  console.log(applied ? `✅ Applied ${applied} migration(s).` : '✅ Database is already up to date.');
} catch (err) {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
