// Support for serverless hosting (e.g. Vercel). There is no long-running server
// there: the API starts fresh ("cold start") when requests arrive, so instead of
// preparing the database once at startup (see index.ts), the first request of
// each cold start waits for prepareDatabase().
import { runMigrations } from './db/migrations.js';
import { pool } from './db/pool.js';
import { isDatabaseEmpty, sampleDataAllowed, seedDatabase, syncSampleAccounts, syncSampleCatalog } from './db/seed.js';

const SEED_LOCK_ID = 727275; // stops two cold starts loading sample data at the same time

let ready: Promise<void> | null = null;

/** Applies pending migrations, and loads sample data into an empty database if allowed. */
export function prepareDatabase(): Promise<void> {
  ready ??= (async () => {
    await runMigrations(() => {});
    if (!sampleDataAllowed()) return;

    // Hold a transaction-level lock while seeding (works through connection
    // poolers too). A second cold start waits here, then sees the data exists.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [SEED_LOCK_ID]);
      if (await isDatabaseEmpty()) await seedDatabase(() => {});
      // Make the sample logins match the SEED_* settings (e.g. after a password change on Vercel).
      await syncSampleAccounts((msg) => console.log(msg.trim()));
      // Add sample products that are new since the database was set up (once per catalogue version).
      await syncSampleCatalog((msg) => console.log(msg.trim()));
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  })().catch((err) => {
    ready = null; // try again on the next request
    throw err;
  });
  return ready;
}
