// Catalogue photos: every sample photo has a recorded source and licence, the
// credits file is up to date, no emoji are used as pictures, and the API sends
// each photo's credit.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { api, loginStaff, productIdBySku, startTestServer, stopTestServer } from './setup.js';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imagesDir = path.join(backendDir, 'seed-images');
const FREE_LICENCES = /^(CC0|Public domain|CC BY(-SA)? [0-9.]+)$/;
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;

before(startTestServer);
after(stopTestServer);

describe('sample photo records', () => {
  it('records the source, author and a free licence for every sample photo — and nothing else', async () => {
    const { sampleImageSources } = await import('../src/services/image-credits.js');
    const sources = sampleImageSources();
    for (const [folder, entries] of [
      ['products', sources.products],
      ['categories', sources.categories],
    ] as const) {
      const files = fs.readdirSync(path.join(imagesDir, folder)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
      assert.deepEqual(entries.map((e) => e.file).sort(), files, `${folder}: every photo file has exactly one entry in sources.json`);
      for (const e of entries) {
        assert.match(e.source, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/, `${e.file}: links to its original`);
        assert.ok(e.author.trim(), `${e.file}: has an author`);
        assert.match(e.licence, FREE_LICENCES, `${e.file}: has a free licence`);
        assert.match(e.file, /\.jpg$/, `${e.file}: is an optimised JPEG`);
        assert.ok(fs.statSync(path.join(imagesDir, folder, e.file)).size < 200_000, `${e.file}: is small enough for phones`);
      }
    }
  });

  it('keeps CREDITS.md in step with sources.json (run `npm run image-credits` after changing photos)', async () => {
    const { renderCreditsMarkdown } = await import('../src/services/image-credits.js');
    const onDisk = fs.readFileSync(path.join(imagesDir, 'CREDITS.md'), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(onDisk, renderCreditsMarkdown());
  });

  it('uses no emoji as product or category pictures', () => {
    const seedData = fs.readFileSync(path.join(backendDir, 'src', 'db', 'seed-data.ts'), 'utf8');
    assert.doesNotMatch(seedData, /\bicon:/);
    assert.doesNotMatch(seedData, EMOJI);
  });
});

describe('photos in the API', () => {
  it('sends a credit with each photo and never an emoji icon', async () => {
    const products = (await api('GET', '/api/products?pageSize=100')).body.items;
    for (const p of products) {
      assert.ok(!('icon' in p) && !('categoryIcon' in p), `${p.name}: no emoji icon`);
      if (p.imageUrl?.startsWith('/sample-images/')) {
        assert.equal(p.imageCredit.kind, 'licensed', `${p.name}: credit`);
        assert.match(p.imageCredit.licence, FREE_LICENCES);
      } else {
        assert.equal(p.imageUrl, null, `${p.name}: no photo means "Image needed", not a stand-in`);
      }
    }
    const keema = products.find((p: { name: string }) => p.name === 'Mutton Keema');
    assert.equal(keema.imageUrl, null, 'the minced-beef photo is no longer used for mutton');

    const categories = (await api('GET', '/api/categories')).body.items;
    assert.ok(categories.length > 0);
    for (const c of categories) {
      assert.ok(!('icon' in c), `${c.name}: no emoji icon`);
      assert.match(c.imageUrl, /^\/sample-images\/categories\/.+\.jpg$/, `${c.name}: has a real photo`);
      assert.equal(c.imageCredit.kind, 'licensed');
    }

    const credits = (await api('GET', '/api/image-credits')).body;
    assert.equal(credits.categories.length, categories.length);
    assert.ok(credits.products.length >= 60);
  });

  it("keeps the source staff give for a photo they upload, and drops it with the photo", async () => {
    const staff = await loginStaff();
    const id = await productIdBySku('PC-001', staff);
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    const form = new FormData();
    form.append('image', new Blob([png], { type: 'image/png' }), 'lux.png');
    form.append('source', 'Taken in our shop, Oct 2026');
    const uploaded = await api('POST', `/api/staff/products/${id}/image`, { token: staff, form });
    assert.equal(uploaded.status, 200, JSON.stringify(uploaded.body));
    assert.equal(uploaded.body.product.imageSource, 'Taken in our shop, Oct 2026');
    assert.deepEqual(uploaded.body.product.imageCredit, {
      kind: 'store',
      author: null,
      licence: null,
      licenceUrl: null,
      sourceUrl: null,
      note: 'Taken in our shop, Oct 2026',
    });

    const removed = await api('DELETE', `/api/staff/products/${id}/image`, { token: staff });
    assert.equal(removed.body.product.imageUrl, null);
    assert.equal(removed.body.product.imageSource, null);
  });
});
