// Logging that helps when something goes wrong on the server (for example in
// Render's Logs tab) without ever printing secrets: passwords, keys, tokens,
// the database password, or the one-time payment links.
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';

const REDACTED = '[redacted]';

/** The secret values from the settings — none of them may appear in a log line. */
function secretValues(): string[] {
  const values = [
    config.JWT_SECRET,
    config.RAZORPAY_KEY_SECRET,
    config.RAZORPAY_WEBHOOK_SECRET,
    config.WHATSAPP_ACCESS_TOKEN,
    config.WHATSAPP_APP_SECRET,
    config.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    config.SEED_STAFF_PASSWORD,
    config.SEED_CUSTOMER_PASSWORD,
  ];
  try {
    values.push(decodeURIComponent(new URL(config.DATABASE_URL).password));
  } catch {
    // not a URL — nothing to add
  }
  return values.filter((v): v is string => typeof v === 'string' && v.length >= 6);
}

/** Removes secrets, credentials in URLs, bearer tokens and payment-link tokens from text. */
export function redact(text: string): string {
  let out = text;
  for (const secret of secretValues()) out = out.split(secret).join(REDACTED);
  return out
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^:/\s@]+:)[^@\s]+@/gi, `$1${REDACTED}@`) // postgres://user:password@host
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${REDACTED}`)
    .replace(/(\/pay\/|\/api\/payments\/)[A-Za-z0-9_-]{20,}/g, `$1${REDACTED}`);
}

/** The request path without its query string, with payment-link tokens hidden. */
export const safePath = (url: string) => redact(url.split('?')[0]);

/** Logs an unexpected error with enough detail to find the cause — but no secrets. */
export function logError(context: string, err: unknown) {
  const detail = err instanceof Error ? (err.stack ?? `${err.name}: ${err.message}`) : String(err);
  // Keep the first few stack lines; they say where it happened.
  const short = detail.split('\n').slice(0, 6).join('\n');
  console.error(`[${new Date().toISOString()}] ERROR ${context}\n${redact(short)}`);
}

export function logWarning(message: string) {
  console.warn(`[${new Date().toISOString()}] WARNING ${redact(message)}`);
}

/**
 * One line per request in production: method, path (no query string), status and time.
 * Health checks and successful photo downloads are skipped to keep the log readable.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const path = req.originalUrl.split('?')[0];
    const isPhoto = /^\/(sample-images|uploads|api\/images)\//.test(path);
    if (path === '/api/health' || (isPhoto && res.statusCode < 400)) return;
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(`${req.method} ${safePath(req.originalUrl)} ${res.statusCode} ${ms.toFixed(0)}ms`);
  });
  next();
}
