// Starts a real PostgreSQL server on your computer WITHOUT installing PostgreSQL.
// It uses the "embedded-postgres" npm package, which ships the official
// PostgreSQL binaries. Data is kept in backend/.local-postgres/ between runs.
//
// This is a development convenience only. If you installed PostgreSQL yourself
// (or use a hosted database), you don't need this — just set DATABASE_URL.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { backendDir } from '../env.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL is not set. Run "npm run setup" in the project folder first.');
  process.exit(1);
}

const url = new URL(databaseUrl);
const host = url.hostname;
const port = Number(url.port || 5432);
const user = decodeURIComponent(url.username || 'postgres');
const password = decodeURIComponent(url.password || 'postgres');
const database = decodeURIComponent(url.pathname.replace(/^\//, ''));

if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.log(`ℹ️  DATABASE_URL points to ${host}, not this computer, so the local database is not needed.`);
  process.exit(0);
}

const dataDir = path.join(backendDir, '.local-postgres');

function isPortInUse(portToCheck: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port: portToCheck, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function ensureDatabaseExists() {
  const client = new pg.Client({ host: '127.0.0.1', port, user, password, database: 'postgres' });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (!rowCount) {
      await client.query(`CREATE DATABASE "${database.replace(/"/g, '""')}"`);
      console.log(`  ✔ Created database "${database}"`);
    }
  } finally {
    await client.end();
  }
}

async function main() {
  if (await isPortInUse(port)) {
    console.log(`ℹ️  Something is already running on port ${port}.`);
    console.log('   If it is the local database from an earlier run of this project, you can keep using it.');
    console.log('   Otherwise change the port in DATABASE_URL (in .env) and try again.');
    try {
      await ensureDatabaseExists();
    } catch (err) {
      console.error(`   (Could not log in to it with DATABASE_URL: ${(err as Error).message})`);
    }
    return;
  }

  const server = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user,
    password,
    authMethod: 'scram-sha-256',
    persistent: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {}, // PostgreSQL is chatty; we print our own short messages instead
    onError: (message) => {
      const text = String(message instanceof Error ? message.message : message);
      if (/error|fatal|panic/i.test(text)) console.error(text.trim());
    },
  });

  if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
    console.log('🛠️  Setting up a new local PostgreSQL database (first run only)...');
    await server.initialise();
  }

  await server.start();
  await ensureDatabaseExists();
  console.log(`🐘 PostgreSQL is running on localhost:${port} (database "${database}").`);
  console.log('   Keep this window open while you use the app. Press Ctrl+C to stop it.');

  const shutdown = async () => {
    console.log('\nStopping PostgreSQL...');
    await server.stop().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('❌ Could not start the local PostgreSQL database:', message);
  // PostgreSQL's Windows tools can't open files whose full path is longer than
  // 260 characters, and node_modules adds ~90 characters to your project path.
  if (process.platform === 'win32' && (/does not exist|cannot find/i.test(message) || backendDir.length > 160)) {
    console.error(
      `\n   Your project folder path is ${backendDir.length} characters long, which is too long for PostgreSQL on Windows.` +
        '\n   Move the project to a shorter folder (for example C:\\Projects\\fernway-market), delete' +
        '\n   backend\\node_modules and backend\\.local-postgres, then run "npm run setup" again.',
    );
  }
  process.exit(1);
});
