// A tiny migration runner: applies each .sql file in backend/db/migrations once,
// in filename order, and remembers which ones ran in the schema_migrations table.
import fs from 'node:fs';
import path from 'node:path';
import { backendDir } from '../env.js';
import { pool } from './pool.js';

const MIGRATIONS_DIR = path.join(backendDir, 'db', 'migrations');
const LOCK_ID = 727274; // any constant number; stops two processes migrating at the same time

/**
 * Everything runs in ONE transaction, holding a transaction-level lock
 * (pg_advisory_xact_lock). The lock is released automatically when the
 * transaction ends, which also works through connection poolers such as
 * Neon's or PgBouncer's, where separate statements may use separate connections.
 * If any migration fails, none of them are applied.
 */
export async function runMigrations(log: (msg: string) => void = console.log): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);

    const { rows } = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.name));
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const appliedNow: string[] = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query(sql);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Migration ${file} failed: ${message}`);
      }
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      appliedNow.push(file);
    }
    await client.query('COMMIT');
    for (const file of appliedNow) log(`  ✔ Applied migration ${file}`);
    return appliedNow.length;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
