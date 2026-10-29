// /api/auth — sign up, log in, "who am I?" and profile settings.
// Logging out simply means the app forgets its token (tokens expire after JWT_EXPIRES_IN).
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { ApiError, conflict } from '../lib/errors.js';
import { optionalText, parse } from '../lib/validation.js';
import { AUTH_USER_COLUMNS, currentUser, requireAuth, signToken, type AuthUser } from '../middleware/auth.js';
import { getLoyaltyBalance } from '../services/offers.service.js';

export const authRouter = Router();

// Slows down password-guessing: max 30 attempts per 15 minutes per IP address.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => config.isTest,
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many attempts. Please wait a few minutes and try again.' },
    });
  },
});

const email = z
  .string({ error: 'Please enter your email address' })
  .trim()
  .toLowerCase()
  .pipe(z.email('Please enter a valid email address'));

const language = z.enum(['en', 'ta']);

const signupSchema = z.object({
  name: z.string({ error: 'Please enter your name' }).trim().min(1, 'Please enter your name').max(100),
  email,
  password: z
    .string({ error: 'Please choose a password' })
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long'),
  phone: optionalText(30),
  preferredLanguage: language.optional(),
});

const loginSchema = z.object({
  email,
  password: z.string({ error: 'Please enter your password' }).min(1, 'Please enter your password'),
});

// Used when the email doesn't exist, so a wrong email and a wrong password take the same time.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

authRouter.post('/signup', authLimiter, async (req, res) => {
  const body = parse(signupSchema, req.body);

  const existing = await pool.query('SELECT 1 FROM users WHERE lower(email) = $1', [body.email]);
  if (existing.rowCount) {
    throw conflict('EMAIL_TAKEN', 'An account with this email already exists. Try logging in instead.');
  }

  const passwordHash = await bcrypt.hash(body.password, 10);
  const { rows } = await pool.query<AuthUser>(
    `INSERT INTO users (email, password_hash, name, phone, role, preferred_language)
     VALUES ($1, $2, $3, $4, 'customer', $5)
     RETURNING ${AUTH_USER_COLUMNS}`,
    [body.email, passwordHash, body.name, body.phone ?? null, body.preferredLanguage ?? 'en'],
  );
  const user = rows[0];
  res.status(201).json({ token: signToken(user), user });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const body = parse(loginSchema, req.body);

  const { rows } = await pool.query<AuthUser & { passwordHash: string; isActive: boolean }>(
    `SELECT ${AUTH_USER_COLUMNS}, password_hash AS "passwordHash", is_active AS "isActive"
     FROM users WHERE lower(email) = $1`,
    [body.email],
  );
  const found = rows[0];
  const passwordOk = await bcrypt.compare(body.password, found?.passwordHash ?? DUMMY_HASH);

  if (!found || !passwordOk) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  if (!found.isActive) throw new ApiError(403, 'ACCOUNT_DISABLED', 'This account has been disabled. Please contact the store.');

  const { passwordHash: _hash, isActive: _active, ...user } = found;
  res.json({ token: signToken(user), user });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = currentUser(req);
  res.json({ user, loyaltyPoints: user.role === 'customer' ? await getLoyaltyBalance(pool, user.id) : 0 });
});

const profileSchema = z.object({
  name: z.string().trim().min(1, 'Please enter your name').max(100).optional(),
  phone: optionalText(30),
  preferredLanguage: language.optional(),
  whatsappOptIn: z.boolean().optional(),
});

/** Update your own profile: name, phone, app language and WhatsApp order updates. */
authRouter.patch('/me', requireAuth, async (req, res) => {
  const user = currentUser(req);
  const body = parse(profileSchema, req.body ?? {});
  if (body.whatsappOptIn && !(body.phone ?? user.phone)) {
    throw new ApiError(400, 'PHONE_REQUIRED', 'Add your mobile number to get order updates on WhatsApp.', {
      fields: [{ field: 'phone', message: 'Add your mobile number to get order updates on WhatsApp.' }],
    });
  }
  const { rows } = await pool.query<AuthUser>(
    `UPDATE users SET
       name = COALESCE($2, name),
       phone = CASE WHEN $3::boolean THEN $4 ELSE phone END,
       preferred_language = COALESCE($5, preferred_language),
       whatsapp_opt_in = COALESCE($6, whatsapp_opt_in),
       whatsapp_opt_in_at = CASE WHEN $6 IS TRUE AND NOT whatsapp_opt_in THEN now()
                                 WHEN $6 IS FALSE THEN NULL ELSE whatsapp_opt_in_at END
     WHERE id = $1
     RETURNING ${AUTH_USER_COLUMNS}`,
    [user.id, body.name ?? null, body.phone !== undefined, body.phone ?? null, body.preferredLanguage ?? null, body.whatsappOptIn ?? null],
  );
  res.json({ user: rows[0] });
});
