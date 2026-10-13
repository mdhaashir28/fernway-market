// /api/addresses — a customer's saved delivery addresses (login required).
import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction, type Db } from '../db/pool.js';
import { notFound } from '../lib/errors.js';
import { idParam, parse } from '../lib/validation.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { addressFieldsSchema } from '../services/checkout.service.js';
import { listZones, matchZone } from '../services/delivery.service.js';

export const addressRouter = Router();
addressRouter.use(requireAuth);

const addressSchema = addressFieldsSchema.extend({
  label: z.string().trim().min(1, 'Please give this address a name, e.g. Home').max(40).default('Home'),
  isDefault: z.boolean().default(false),
});

const ADDRESS_COLUMNS = `
  id, label, recipient_name AS "recipientName", phone, line1, line2, city, postcode, instructions,
  is_default AS "isDefault", created_at AS "createdAt"`;

interface AddressRow {
  id: number;
  postcode: string;
  [key: string]: unknown;
}

/** Adds "can we deliver here?" information to each address. */
async function withServiceArea(db: Db, rows: AddressRow[]) {
  const zones = await listZones(db, { activeOnly: true });
  return rows.map((address) => {
    const zone = matchZone(zones, address.postcode);
    return {
      ...address,
      deliveryAvailable: Boolean(zone),
      deliveryZone: zone && {
        id: zone.id,
        name: zone.name,
        feeCents: zone.feeCents,
        freeDeliveryThresholdCents: zone.freeDeliveryThresholdCents,
        minOrderCents: zone.minOrderCents,
      },
    };
  });
}

addressRouter.get('/', async (req, res) => {
  const { rows } = await pool.query<AddressRow>(
    `SELECT ${ADDRESS_COLUMNS} FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
    [currentUser(req).id],
  );
  res.json({ items: await withServiceArea(pool, rows) });
});

addressRouter.post('/', async (req, res) => {
  const userId = currentUser(req).id;
  const body = parse(addressSchema, req.body);

  const address = await withTransaction(async (client) => {
    const { rows: existing } = await client.query('SELECT 1 FROM addresses WHERE user_id = $1 LIMIT 1', [userId]);
    const makeDefault = body.isDefault || existing.length === 0; // the first address becomes the default
    if (makeDefault) await client.query('UPDATE addresses SET is_default = false WHERE user_id = $1 AND is_default', [userId]);

    const { rows } = await client.query<AddressRow>(
      `INSERT INTO addresses (user_id, label, recipient_name, phone, line1, line2, city, postcode, instructions, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${ADDRESS_COLUMNS}`,
      [userId, body.label, body.recipientName, body.phone, body.line1, body.line2, body.city, body.postcode.toUpperCase(), body.instructions, makeDefault],
    );
    return rows[0];
  });

  const [result] = await withServiceArea(pool, [address]);
  res.status(201).json({ address: result });
});

addressRouter.put('/:id', async (req, res) => {
  const userId = currentUser(req).id;
  const { id } = parse(idParam, req.params);
  const body = parse(addressSchema, req.body);

  const address = await withTransaction(async (client) => {
    if (body.isDefault) {
      await client.query('UPDATE addresses SET is_default = false WHERE user_id = $1 AND is_default AND id <> $2', [userId, id]);
    }
    const { rows } = await client.query<AddressRow>(
      `UPDATE addresses
       SET label = $3, recipient_name = $4, phone = $5, line1 = $6, line2 = $7, city = $8, postcode = $9,
           instructions = $10, is_default = (is_default OR $11)
       WHERE id = $1 AND user_id = $2
       RETURNING ${ADDRESS_COLUMNS}`,
      [id, userId, body.label, body.recipientName, body.phone, body.line1, body.line2, body.city, body.postcode.toUpperCase(), body.instructions, body.isDefault],
    );
    if (!rows[0]) throw notFound('Address');
    return rows[0];
  });

  const [result] = await withServiceArea(pool, [address]);
  res.json({ address: result });
});

addressRouter.delete('/:id', async (req, res) => {
  const userId = currentUser(req).id;
  const { id } = parse(idParam, req.params);

  await withTransaction(async (client) => {
    const { rows } = await client.query<{ isDefault: boolean }>(
      'DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING is_default AS "isDefault"',
      [id, userId],
    );
    if (!rows[0]) throw notFound('Address');
    // If the default address was deleted, make the newest remaining address the default.
    if (rows[0].isDefault) {
      await client.query(
        `UPDATE addresses SET is_default = true
         WHERE id = (SELECT id FROM addresses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1)`,
        [userId],
      );
    }
  });
  res.status(204).end();
});
