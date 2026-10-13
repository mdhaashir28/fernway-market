// Turns any thrown error into a consistent JSON response.
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ApiError } from '../lib/errors.js';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No endpoint for ${req.method} ${req.path}` } });
}

// Express recognises error handlers by their four arguments, so keep `_next`.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }

  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Images must be 5 MB or smaller.' : `Upload failed: ${err.message}`;
    res.status(400).json({ error: { code: 'UPLOAD_ERROR', message } });
    return;
  }

  const e = err as { type?: string; code?: string; constraint?: string; status?: number };
  if (e?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'The request body is not valid JSON.' } });
    return;
  }
  if (e?.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'TOO_LARGE', message: 'The request body is too large.' } });
    return;
  }
  // PostgreSQL error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
  if (e?.code === '23505') {
    res.status(409).json({ error: { code: 'ALREADY_EXISTS', message: 'Something with that name, email or SKU already exists.', details: { constraint: e.constraint } } });
    return;
  }
  if (e?.code === '23503') {
    res.status(409).json({ error: { code: 'IN_USE', message: 'That item is linked to other records and cannot be changed this way.' } });
    return;
  }
  if (e?.code === '23514' && e.constraint === 'inventory_quantity_check') {
    res.status(409).json({ error: { code: 'INSUFFICIENT_STOCK', message: 'Not enough stock for that change.' } });
    return;
  }

  console.error('Unexpected error:', err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side. Please try again.' } });
}
