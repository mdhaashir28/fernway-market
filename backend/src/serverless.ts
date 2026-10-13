// Support for serverless hosting (e.g. Vercel). There is no long-running server
// there: the API starts fresh ("cold start") when requests arrive, so instead of
// preparing the database once at startup (see index.ts), the first request of
// each cold start waits for prepareDatabase().
import { runMigrations } from './db/migrations.js';
import { pool } from './db/pool.js';
import { isDatabaseEmpty, sampleDataAllowed, seedDatabase } from './db/seed.js';

const SEED_LOCK_ID = 727275; // stops two cold starts loading sample data at the same time

let ready: Promise<void> | null = null;

/** Applies pending migrations, and loads sample data into an empty database if allowed. */
export function prepareDatabase(): Promise<void> {
  ready ??= (async () => {
    await runMigrations(() => {});
    if (!sampleDataAllowed()) return;

    const client = await pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock($1)', [SEED_LOCK_ID]);
      if (await isDatabaseEmpty()) await seedDatabase(() => {});
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [SEED_LOCK_ID]).catch(() => {});
      client.release();
    }
  })().catch((err) => {
    ready = null; // try again on the next request
    throw err;
  });
  return ready;
}
