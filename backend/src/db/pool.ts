// A shared pool of database connections, plus small helpers for transactions.
import pg from 'pg';
import { config } from '../config.js';

// COUNT(*) and SUM() return 64-bit integers, which "pg" gives back as strings
// by default. Our numbers are small, so convert them to normal JS numbers.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number.parseInt(value, 10));

export const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 });

pool.on('error', (err) => {
  // An idle connection dropped (e.g. the database restarted). The pool will reconnect.
  console.error('Database connection error:', err.message);
});

/** Anything we can run a query on: the pool itself or a client inside a transaction. */
export type Db = pg.Pool | pg.PoolClient;

/**
 * Runs `work` inside a database transaction. If anything throws, every change
 * made inside the transaction is rolled back, so the database is never left
 * half-updated (e.g. an order without its items).
 */
export async function withTransaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Waits until the database accepts connections (useful while it is still starting up). */
export async function waitForDatabase({ attempts = 30, delayMs = 1000 } = {}): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (attempt >= attempts) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Could not connect to the database: ${message}\n` +
            '   • Is PostgreSQL running? (run "npm run db:local" or "npm run dev" from the project folder)\n' +
            '   • Does DATABASE_URL in your .env file have the right user, password, port and database name?',
        );
      }
      if (attempt === 1) console.log('⏳ Waiting for the database to be ready...');
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
