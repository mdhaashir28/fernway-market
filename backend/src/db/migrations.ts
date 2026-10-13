// A tiny migration runner: applies each .sql file in backend/db/migrations once,
// in filename order, and remembers which ones ran in the schema_migrations table.
import fs from 'node:fs';
import path from 'node:path';
import { backendDir } from '../env.js';
import { pool } from './pool.js';

const MIGRATIONS_DIR = path.join(backendDir, 'db', 'migrations');
const LOCK_ID = 727274; // any constant number; stops two processes migrating at the same time

export async function runMigrations(log: (msg: string) => void = console.log): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
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

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Migration ${file} failed: ${message}`);
      }
      log(`  ✔ Applied migration ${file}`);
      count++;
    }
    return count;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
}
