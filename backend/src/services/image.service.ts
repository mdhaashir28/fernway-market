// Saves and deletes product photos, either as files on disk or inside the
// database, depending on the IMAGE_STORAGE setting.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { backendDir } from '../env.js';

export const UPLOAD_DIR = path.join(backendDir, 'uploads', 'products');
export const ALLOWED_IMAGE_TYPES: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

/** Double-checks the bytes really are a JPG, PNG or WebP image (not just named like one). */
export function looksLikeImage(data: Buffer): boolean {
  const isJpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const isPng = data.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const isWebp = data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP';
  return isJpeg || isPng || isWebp;
}

/** Stores the image and returns the URL path the apps should load it from. */
export async function saveImage(data: Buffer, contentType: string): Promise<string> {
  if (config.IMAGE_STORAGE === 'database') {
    const { rows } = await pool.query<{ id: number }>(
      'INSERT INTO product_images (content_type, data) VALUES ($1, $2) RETURNING id',
      [contentType, data],
    );
    return `/api/images/${rows[0].id}`;
  }
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const filename = `${crypto.randomUUID()}${ALLOWED_IMAGE_TYPES[contentType]}`;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, filename), data);
  return `/uploads/products/${filename}`;
}

/** Removes an image we stored earlier. Sample photos (shipped with the code) are left alone. */
export async function deleteImage(imageUrl: string | null): Promise<void> {
  if (!imageUrl) return;
  const fromDatabase = imageUrl.match(/^\/api\/images\/(\d+)$/);
  if (fromDatabase) {
    await pool.query('DELETE FROM product_images WHERE id = $1', [Number(fromDatabase[1])]);
  } else if (imageUrl.startsWith('/uploads/products/')) {
    await fs.promises.rm(path.join(UPLOAD_DIR, path.basename(imageUrl)), { force: true });
  }
}
