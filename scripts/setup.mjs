// npm run setup — one-time setup for a fresh copy of the project.
//   1. Installs the packages for the API, dashboard and mobile app.
//   2. Creates .env from .env.example with random secrets and your time zone.
// Safe to run again: an existing .env is never overwritten.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 20 || (major === 20 && minor < 11)) {
  console.error(`❌ Node.js 20.11 or newer is required (you have ${process.versions.node}). Install the LTS version from https://nodejs.org`);
  process.exit(1);
}

function run(label, cwd) {
  console.log(`\n📦 Installing packages for ${label}...`);
  const result = spawnSync('npm install', { cwd, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(`❌ "npm install" failed in ${path.relative(root, cwd) || '.'}. Scroll up to see why, fix it, then run "npm run setup" again.`);
    process.exit(result.status ?? 1);
  }
}

run('project tools', root);
run('the API (backend)', path.join(root, 'backend'));
run('the staff dashboard', path.join(root, 'dashboard'));
run('the mobile app', path.join(root, 'mobile'));

// --- .env --------------------------------------------------------------------
const envPath = path.join(root, '.env');
const randomPassword = () => crypto.randomBytes(9).toString('base64url'); // 12 readable characters

if (fs.existsSync(envPath)) {
  console.log('\nℹ️  .env already exists — leaving it unchanged.');
} else {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const staffPassword = randomPassword();
  const customerPassword = randomPassword();
  const env = fs
    .readFileSync(path.join(root, '.env.example'), 'utf8')
    .replace('replace-with-a-database-password', crypto.randomBytes(12).toString('hex'))
    .replace('replace-with-a-long-random-secret', crypto.randomBytes(48).toString('hex'))
    .replace('replace-with-a-staff-password', staffPassword)
    .replace('replace-with-a-customer-password', customerPassword)
    .replace(/^STORE_TIMEZONE=.*$/m, `STORE_TIMEZONE=${timeZone}`);
  fs.writeFileSync(envPath, env);
  console.log(`\n🔐 Created .env with random secrets (time zone: ${timeZone}).`);
}

const envText = fs.readFileSync(envPath, 'utf8');
const read = (key) => envText.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();

console.log(`
✅ Setup complete!

Next steps:
  1. Start the database, API and staff dashboard:   npm run dev
  2. In a SECOND terminal, start the mobile app:    npm run mobile

Sample logins (local development only — stored in your .env file):
  Staff dashboard  ${read('SEED_STAFF_EMAIL')}  /  ${read('SEED_STAFF_PASSWORD')}
  Customer app     ${read('SEED_CUSTOMER_EMAIL')}  /  ${read('SEED_CUSTOMER_PASSWORD')}
`);
