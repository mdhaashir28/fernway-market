// Saves and deletes product and category photos, either as files on disk or
// inside the database, depending on the IMAGE_STORAGE setting.
//
// Every upload is optimised for phones first: turned the right way up, shrunk
// to at most 1000 × 1000 pixels and saved as a compressed JPEG. A 4 MB photo
// from a phone camera typically becomes 80–150 KB.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { backendDir } from '../env.js';

export const UPLOAD_ROOT = path.join(backendDir, 'uploads');
export const UPLOAD_DIR = path.join(UPLOAD_ROOT, 'products');
export const ALLOWED_IMAGE_TYPES: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const MAX_SIZE = 1000;

/** Double-checks the bytes really are a JPG, PNG or WebP image (not just named like one). */
export function looksLikeImage(data: Buffer): boolean {
  const isJpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const isPng = data.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const isWebp = data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP';
  return isJpeg || isPng || isWebp;
}

/** Resizes and compresses a photo for fast loading on small screens. */
export async function optimizeImage(data: Buffer): Promise<Buffer> {
  return sharp(data, { failOn: 'error' })
    .rotate() // respect the camera's orientation
    .resize({ width: MAX_SIZE, height: MAX_SIZE, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' }) // transparent PNGs get a white background
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
}

/** Stores an (already optimised) JPEG and returns the URL path the apps should load it from. */
export async function saveImage(data: Buffer, folder: 'products' | 'categories' = 'products'): Promise<string> {
  if (config.IMAGE_STORAGE === 'database') {
    const { rows } = await pool.query<{ id: number }>('INSERT INTO product_images (content_type, data) VALUES ($1, $2) RETURNING id', ['image/jpeg', data]);
    return `/api/images/${rows[0].id}`;
  }
  const dir = path.join(UPLOAD_ROOT, folder);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${crypto.randomUUID()}.jpg`;
  await fs.promises.writeFile(path.join(dir, filename), data);
  return `/uploads/${folder}/${filename}`;
}

/** Removes an image we stored earlier. Sample photos (shipped with the code) are left alone. */
export async function deleteImage(imageUrl: string | null): Promise<void> {
  if (!imageUrl) return;
  const fromDatabase = imageUrl.match(/^\/api\/images\/(\d+)$/);
  if (fromDatabase) {
    await pool.query('DELETE FROM product_images WHERE id = $1', [Number(fromDatabase[1])]);
    return;
  }
  const onDisk = imageUrl.match(/^\/uploads\/(products|categories)\/([^/]+)$/);
  if (onDisk) await fs.promises.rm(path.join(UPLOAD_ROOT, onDisk[1], path.basename(onDisk[2])), { force: true });
}
