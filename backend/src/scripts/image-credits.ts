// npm run image-credits
// Rewrites backend/seed-images/CREDITS.md from backend/seed-images/sources.json,
// and lists the sample products that still need a photo.
//
// To add or replace a sample photo:
//   1. Put the file in seed-images/products/<SKU>.jpg (or categories/<slug>.jpg).
//   2. Add or update its entry in seed-images/sources.json (source page, author, licence).
//   3. Run `npm run image-credits`. The tests fail if a photo has no entry, or CREDITS.md is out of date.
import fs from 'node:fs';
import path from 'node:path';
import { backendDir } from '../env.js';
import { renderCreditsMarkdown } from '../services/image-credits.js';

const file = path.join(backendDir, 'seed-images', 'CREDITS.md');
fs.writeFileSync(file, renderCreditsMarkdown());
console.log(`✔ Wrote ${path.relative(process.cwd(), file)}`);
