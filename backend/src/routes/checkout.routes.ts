// Delivery checks, pickup slots, and the checkout price quote.
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { formatMoney } from '../lib/money.js';
import { parse } from '../lib/validation.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { buildQuote, quoteSchema } from '../services/checkout.service.js';
import { deliveryFeeFor, findZoneForPostcode } from '../services/delivery.service.js';
import { listUpcomingSlots } from '../services/pickup.service.js';

export const checkoutRouter = Router();

const deliveryCheckQuery = z.object({
  postcode: z.string().trim().min(2, 'Please enter a PIN code').max(12),
  subtotalCents: z.coerce.number().int().min(0).optional(),
});

/** GET /api/delivery/check?postcode=10001 — can we deliver there, and for how much? */
checkoutRouter.get('/delivery/check', async (req, res) => {
  const { postcode, subtotalCents } = parse(deliveryCheckQuery, req.query);
  const zone = await findZoneForPostcode(pool, postcode);

  if (!zone) {
    res.json({
      postcode: postcode.toUpperCase(),
      available: false,
      message: `Sorry, we don't deliver to ${postcode.toUpperCase()} yet. You can still order for store pickup.`,
    });
    return;
  }

  const feeCents = subtotalCents != null ? deliveryFeeFor(zone, subtotalCents) : zone.feeCents;
  const freeNote = zone.freeDeliveryThresholdCents ? ` Free delivery on orders over ${formatMoney(zone.freeDeliveryThresholdCents)}.` : '';
  res.json({
    postcode: postcode.toUpperCase(),
    available: true,
    zone: { id: zone.id, name: zone.name },
    feeCents,
    standardFeeCents: zone.feeCents,
    freeDeliveryThresholdCents: zone.freeDeliveryThresholdCents,
    minOrderCents: zone.minOrderCents,
    message: `Great news — we deliver to ${postcode.toUpperCase()} (${zone.name}).${freeNote}`,
  });
});

/** GET /api/pickup-slots — collection times for the next few days. */
checkoutRouter.get('/pickup-slots', async (_req, res) => {
  const slots = await listUpcomingSlots(pool);
  res.json({ timezone: config.STORE_TIMEZONE, storeAddress: config.STORE_ADDRESS, items: slots });
});

/** POST /api/checkout/quote — server-side totals and any problems, before placing the order. */
checkoutRouter.post('/checkout/quote', requireAuth, async (req, res) => {
  const input = parse(quoteSchema, req.body);
  res.json(await buildQuote(pool, currentUser(req).id, input));
});
