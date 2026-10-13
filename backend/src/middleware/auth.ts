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

export type Role = 'customer' | 'staff';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
}

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
    'SELECT id, email, name, phone, role, is_active AS "isActive" FROM users WHERE id = $1',
    [userId],
  );
  const user = rows[0];
  if (!user || !user.isActive) throw unauthorized('Your account is not active. Please log in again.');

  req.user = { id: user.id, email: user.email, name: user.name, phone: user.phone, role: user.role };
  next();
}

export function requireRole(role: Role) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.user?.role !== role) throw forbidden(role === 'staff' ? 'Staff access only.' : undefined);
    next();
  };
}

/** Returns the logged-in user (use only on routes protected by requireAuth). */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
