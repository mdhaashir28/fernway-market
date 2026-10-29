// Login tokens (JWT) and role checks.
//
// After logging in, apps send:  Authorization: Bearer <token>
// requireAuth checks the token AND re-reads the user from the database, so a
// deactivated account or a changed role takes effect immediately.
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { forbidden, unauthorized } from '../lib/errors.js';

/**
 * customer = shoppers.
 * staff    = pickers/cashiers: orders, substitutions, stock counts, photos, support.
 * manager  = store owner/manager: everything staff can do, plus prices and products,
 *            categories, delivery zones, store hours, offers, staff accounts and refunds.
 */
export type Role = 'customer' | 'staff' | 'manager';

export const isStaffRole = (role: Role | undefined): role is 'staff' | 'manager' => role === 'staff' || role === 'manager';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  preferredLanguage: 'en' | 'ta';
  /** Agreed to receive order updates on WhatsApp. */
  whatsappOptIn: boolean;
}

/** Columns for AuthUser (users table). */
export const AUTH_USER_COLUMNS = `id, email, name, phone, role, preferred_language AS "preferredLanguage", whatsapp_opt_in AS "whatsappOptIn"`;

// Lets TypeScript know that requests can carry the logged-in user.
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: { id: number; role: Role }): string {
  return jwt.sign({ role: user.role }, config.JWT_SECRET, {
    subject: String(user.id),
    expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) throw unauthorized();

  let userId: number;
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
    userId = Number(payload.sub);
  } catch {
    throw unauthorized('Your session has expired. Please log in again.');
  }

  const { rows } = await pool.query<AuthUser & { isActive: boolean }>(
    `SELECT ${AUTH_USER_COLUMNS}, is_active AS "isActive" FROM users WHERE id = $1`,
    [userId],
  );
  const user = rows[0];
  if (!user || !user.isActive) throw unauthorized('Your account is not active. Please log in again.');

  const { isActive: _active, ...authUser } = user;
  req.user = authUser;
  next();
}

/** Any store account (staff or manager). */
export function requireStaff(req: Request, _res: Response, next: NextFunction) {
  if (!isStaffRole(req.user?.role)) throw forbidden('Staff access only.');
  next();
}

/** Store managers only. */
export function requireManager(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'manager') throw forbidden('Only a store manager can do that.');
  next();
}

/** Returns the logged-in user (use only on routes protected by requireAuth). */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
