// npm run create-staff -- --email someone@example.com --password "a-strong-password" --name "Sam"
// Creates a staff account (or promotes an existing account to staff).
import { parseArgs } from 'node:util';
import bcrypt from 'bcryptjs';
import { pool, waitForDatabase } from '../db/pool.js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
    name: { type: 'string', default: 'Staff member' },
  },
});

if (!values.email || !values.password || values.password.length < 8) {
  console.error('Usage: npm run create-staff -- --email you@example.com --password "at-least-8-chars" --name "Your Name"');
  process.exit(1);
}

try {
  await waitForDatabase();
  const hash = await bcrypt.hash(values.password, 10);
  const { rows } = await pool.query<{ id: number; inserted: boolean }>(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES (lower($1), $2, $3, 'staff')
     ON CONFLICT ((lower(email))) DO UPDATE SET role = 'staff', password_hash = EXCLUDED.password_hash, is_active = true
     RETURNING id, (xmax = 0) AS inserted`,
    [values.email, hash, values.name],
  );
  console.log(rows[0].inserted ? `✅ Created staff account ${values.email}` : `✅ ${values.email} is now a staff account (password updated)`);
} catch (err) {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
