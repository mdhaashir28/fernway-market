// GET /api/images/:id — product photos stored in the database (IMAGE_STORAGE=database).
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { notFound } from '../lib/errors.js';
import { idParam, parse } from '../lib/validation.js';

export const imageRouter = Router();

imageRouter.get('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { rows } = await pool.query<{ contentType: string; data: Buffer }>(
    'SELECT content_type AS "contentType", data FROM product_images WHERE id = $1',
    [id],
  );
  if (!rows[0]) throw notFound('Image');
  res.set('Content-Type', rows[0].contentType);
  // An image id is never reused, so browsers and phones can cache it forever.
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(rows[0].data);
});
