// Shared set-up for the end-to-end API tests. They run against a SEPARATE
// database named "<your database>_test", which is wiped at the start of every
// test file. Run with:  npm test   (the database server must be running)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';

// ---------------------------------------------------------------------------
// Point the app at the test database BEFORE any app code is loaded.
// ---------------------------------------------------------------------------
const projectRoot = path.resolve(import.meta.dirname, '..', '..');
const envFile = path.join(projectRoot, '.env');
const fileEnv = fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) : {};
const databaseUrl = new URL(process.env.DATABASE_URL ?? fileEnv.DATABASE_URL);
const testDbName = `${databaseUrl.pathname.slice(1)}_test`;
const testDbUrl = new URL(databaseUrl);
testDbUrl.pathname = `/${testDbName}`;

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: testDbUrl.toString(),
  JWT_SECRET: 'test-secret-that-is-long-enough-123',
  PICKUP_DAYS_AHEAD: '3',
  PICKUP_SLOT_CAPACITY: '6',
  SEED_STAFF_EMAIL: 'staff@test.local',
  SEED_STAFF_PASSWORD: 'staff-password-123',
  SEED_CUSTOMER_EMAIL: 'customer@test.local',
  SEED_CUSTOMER_PASSWORD: 'customer-password-123',
  STORE_PHONE: '9789562928, 9003071616',
  PAYMENTS_MODE: 'demo',
  WHATSAPP_MODE: 'demo',
  PUBLIC_API_URL: '',
});

let server: Server | undefined;
let base = '';
let closeDb: (() => Promise<void>) | undefined;

/** The test server's address, e.g. http://127.0.0.1:53211 */
export const baseUrl = () => base;

export interface ApiResult {
  status: number;
  headers: Headers;
  body: any; // JSON from the API — tests check the shape themselves
}

export async function api(
  method: string,
  url: string,
  options: { token?: string; body?: unknown; form?: FormData; headers?: Record<string, string>; raw?: string } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let body: FormData | string | undefined;
  if (options.form) body = options.form;
  else if (options.raw !== undefined) body = options.raw;
  else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  const res = await fetch(`${base}${url}`, { method, headers, body });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, headers: res.headers, body: parsed };
}

export async function login(email: string, password: string): Promise<string> {
  const res = await api('POST', '/api/auth/login', { body: { email, password } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.token;
}

export const loginStaff = () => login('staff@test.local', 'staff-password-123');
export const loginCustomer = () => login('customer@test.local', 'customer-password-123');

export async function productIdBySku(sku: string, staffToken: string): Promise<number> {
  const res = await api('GET', `/api/staff/products?search=${sku}`, { token: staffToken });
  return res.body.items.find((p: { sku: string }) => p.sku === sku).id;
}

export async function stockOf(productId: number, staffToken: string): Promise<number> {
  const res = await api('GET', `/api/staff/products/${productId}`, { token: staffToken });
  return res.body.product.stockQuantity;
}

export async function firstAvailableSlotId(): Promise<number> {
  const res = await api('GET', '/api/pickup-slots');
  const slot = res.body.items.find((s: { isAvailable: boolean }) => s.isAvailable);
  assert.ok(slot, 'expected at least one available pickup slot');
  return slot.id;
}

/** Creates (or wipes) the test database, applies migrations, loads sample data and starts the API. */
export async function startTestServer(): Promise<void> {
  const admin = new pg.Client({ connectionString: Object.assign(new URL(databaseUrl), { pathname: '/postgres' }).toString() });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [testDbName]);
  if (!exists.rowCount) await admin.query(`CREATE DATABASE "${testDbName}"`);
  await admin.end();

  const { pool } = await import('../src/db/pool.js');
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const { runMigrations } = await import('../src/db/migrations.js');
  const { seedDatabase } = await import('../src/db/seed.js');
  await runMigrations(() => {});
  await seedDatabase(() => {});

  const { createApp } = await import('../src/app.js');
  server = createApp().listen(0);
  await new Promise((resolve) => server!.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeDb = () => pool.end();
}

export async function stopTestServer(): Promise<void> {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
  await closeDb?.();
}

/** Runs one SQL query on the test database (for checks the API doesn't expose). */
export async function sql<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const { pool } = await import('../src/db/pool.js');
  return (await pool.query(text, params)).rows as T[];
}
