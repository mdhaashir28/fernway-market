// npm run create-staff -- --email someone@example.com --password "a-strong-password" --name "Sam" [--role manager|staff]
// Creates a staff or manager account (or changes an existing account's role and password).
// Without --role, the first account becomes a manager (someone must be able to change
// prices and settings); later accounts are staff.
import { parseArgs } from 'node:util';
import bcrypt from 'bcryptjs';
import { pool, waitForDatabase } from '../db/pool.js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
    name: { type: 'string', default: 'Staff member' },
    role: { type: 'string' },
  },
});

const usage = 'Usage: npm run create-staff -- --email you@example.com --password "at-least-10-chars" --name "Your Name" [--role manager|staff]';
if (!values.email || !values.password || values.password.length < 10) {
  console.error(usage);
  process.exit(1);
}
if (values.role && values.role !== 'manager' && values.role !== 'staff') {
  console.error('--role must be "manager" or "staff".');
  process.exit(1);
}

try {
  await waitForDatabase();
  const { rows: managers } = await pool.query(`SELECT 1 FROM users WHERE role = 'manager' AND is_active LIMIT 1`);
  const role = values.role ?? (managers.length ? 'staff' : 'manager');
  const hash = await bcrypt.hash(values.password, 10);
  const { rows } = await pool.query<{ id: number; inserted: boolean }>(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES (lower($1), $2, $3, $4::user_role)
     ON CONFLICT ((lower(email))) DO UPDATE SET role = EXCLUDED.role, password_hash = EXCLUDED.password_hash, is_active = true
     RETURNING id, (xmax = 0) AS inserted`,
    [values.email, hash, values.name, role],
  );
  console.log(rows[0].inserted ? `✅ Created ${role} account ${values.email}` : `✅ ${values.email} is now a ${role} account (password updated)`);
} catch (err) {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
