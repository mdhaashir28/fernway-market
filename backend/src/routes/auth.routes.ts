// /api/auth — sign up, log in, and "who am I?"
// Logging out simply means the app forgets its token (tokens expire after JWT_EXPIRES_IN).
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { ApiError, conflict } from '../lib/errors.js';
import { optionalText, parse } from '../lib/validation.js';
import { currentUser, requireAuth, signToken, type AuthUser } from '../middleware/auth.js';

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

const signupSchema = z.object({
  name: z.string({ error: 'Please enter your name' }).trim().min(1, 'Please enter your name').max(100),
  email,
  password: z
    .string({ error: 'Please choose a password' })
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long'),
  phone: optionalText(30),
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
    `INSERT INTO users (email, password_hash, name, phone, role)
     VALUES ($1, $2, $3, $4, 'customer')
     RETURNING id, email, name, phone, role`,
    [body.email, passwordHash, body.name, body.phone ?? null],
  );
  const user = rows[0];
  res.status(201).json({ token: signToken(user), user });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const body = parse(loginSchema, req.body);

  const { rows } = await pool.query<AuthUser & { passwordHash: string; isActive: boolean }>(
    `SELECT id, email, name, phone, role, password_hash AS "passwordHash", is_active AS "isActive"
     FROM users WHERE lower(email) = $1`,
    [body.email],
  );
  const found = rows[0];
  const passwordOk = await bcrypt.compare(body.password, found?.passwordHash ?? DUMMY_HASH);

  if (!found || !passwordOk) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  if (!found.isActive) throw new ApiError(403, 'ACCOUNT_DISABLED', 'This account has been disabled. Please contact the store.');

  const user: AuthUser = { id: found.id, email: found.email, name: found.name, phone: found.phone, role: found.role };
  res.json({ token: signToken(user), user });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: currentUser(req) });
});
