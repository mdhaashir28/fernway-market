// Checkout maths. Prices, stock and fees are ALWAYS worked out here on the
// server from the database — the app only sends product ids and quantities,
// so a modified app can never choose its own prices.
import { z } from 'zod';
import type { Db } from '../db/pool.js';
import { formatMoney } from '../lib/money.js';
import { optionalText } from '../lib/validation.js';
import { deliveryFeeFor, findZoneForPostcode, type DeliveryZone } from './delivery.service.js';
import { getSlot, type PickupSlot } from './pickup.service.js';

export const MAX_QUANTITY_PER_ITEM = 50;

export const addressFieldsSchema = z.object({
  recipientName: z.string().trim().min(1, 'Please enter the recipient name').max(100),
  phone: z.string().trim().min(6, 'Please enter a phone number').max(30),
  line1: z.string().trim().min(1, 'Please enter the street address').max(200),
  line2: optionalText(200),
  city: z.string().trim().min(1, 'Please enter the town or city').max(100),
  postcode: z
    .string()
    .trim()
    .min(3, 'Please enter a valid PIN code')
    .max(12, 'Please enter a valid PIN code')
    .regex(/^[A-Za-z0-9 -]+$/, 'PIN codes can only contain letters, numbers, spaces and dashes'),
  instructions: optionalText(300),
});
export type AddressFields = z.output<typeof addressFieldsSchema>;

export const cartItemsSchema = z
  .array(
    z.object({
      productId: z.number().int().positive(),
      quantity: z
        .number()
        .int()
        .min(1, 'Quantity must be at least 1')
        .max(MAX_QUANTITY_PER_ITEM, `You can order up to ${MAX_QUANTITY_PER_ITEM} of each item`),
    }),
  )
  .min(1, 'Your cart is empty.')
  .max(100, 'Too many different items in one order.');

export const fulfillmentSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('delivery'),
    addressId: z.number().int().positive().optional(), // a saved address...
    address: addressFieldsSchema.optional(), //            ...or a one-off address
  }),
  z.object({
    type: z.literal('pickup'),
    pickupSlotId: z.number().int().positive().optional(),
  }),
]);

export const quoteSchema = z.object({ items: cartItemsSchema, fulfillment: fulfillmentSchema });
export type QuoteInput = z.output<typeof quoteSchema>;

export interface CheckoutIssue {
  code: string;
  message: string;
  productId?: number;
  availableQuantity?: number;
}

export interface PricedItem {
  productId: number;
  name: string;
  unitLabel: string;
  imageUrl: string | null;
  icon: string | null;
  categoryIcon: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  availableQuantity: number;
  isAvailable: boolean;
}

/**
 * Looks up current prices and stock for the cart.
 * With lockStock=true (used when placing an order, inside a transaction) the
 * stock rows are locked until the transaction ends, so two customers can never
 * both buy the last item. Rows are locked in id order to avoid deadlocks.
 */
export async function priceItems(db: Db, items: QuoteInput['items'], { lockStock }: { lockStock: boolean }) {
  // Combine duplicate lines (the same product added twice).
  const quantities = new Map<number, number>();
  for (const item of items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  const ids = [...quantities.keys()].sort((a, b) => a - b);

  const { rows } = await db.query<{
    id: number;
    name: string;
    unitLabel: string;
    imageUrl: string | null;
    icon: string | null;
    categoryIcon: string;
    priceCents: number;
    isActive: boolean;
    stock: number;
  }>(
    `SELECT p.id, p.name, p.unit_label AS "unitLabel", p.image_url AS "imageUrl", p.icon,
            c.icon AS "categoryIcon", p.price_cents AS "priceCents",
            (p.is_active AND c.is_active) AS "isActive", i.quantity AS stock
     FROM products p
     JOIN categories c ON c.id = p.category_id
     JOIN inventory i ON i.product_id = p.id
     WHERE p.id = ANY($1::int[])
     ORDER BY p.id
     ${lockStock ? 'FOR UPDATE OF i' : ''}`,
    [ids],
  );
  const byId = new Map(rows.map((row) => [row.id, row]));

  const priced: PricedItem[] = [];
  const issues: CheckoutIssue[] = [];
  let subtotalCents = 0;

  for (const productId of ids) {
    const quantity = quantities.get(productId)!;
    const row = byId.get(productId);
    if (!row) {
      issues.push({ code: 'PRODUCT_UNAVAILABLE', productId, availableQuantity: 0, message: 'One of the items in your cart is no longer sold.' });
      continue;
    }
    if (!row.isActive) {
      issues.push({ code: 'PRODUCT_UNAVAILABLE', productId, availableQuantity: 0, message: `${row.name} is no longer available.` });
    } else if (row.stock === 0) {
      issues.push({ code: 'OUT_OF_STOCK', productId, availableQuantity: 0, message: `${row.name} is out of stock.` });
    } else if (quantity > row.stock) {
      issues.push({
        code: 'INSUFFICIENT_STOCK',
        productId,
        availableQuantity: row.stock,
        message: `Only ${row.stock} × ${row.name} left — please lower the quantity.`,
      });
    }

    const lineTotalCents = row.priceCents * quantity;
    subtotalCents += lineTotalCents;
    priced.push({
      productId,
      name: row.name,
      unitLabel: row.unitLabel,
      imageUrl: row.imageUrl,
      icon: row.icon,
      categoryIcon: row.categoryIcon,
      unitPriceCents: row.priceCents,
      quantity,
      lineTotalCents,
      availableQuantity: row.isActive ? row.stock : 0,
      isAvailable: row.isActive && row.stock >= quantity,
    });
  }

  return { items: priced, issues, subtotalCents };
}

export type ResolvedFulfillment =
  | { type: 'delivery'; address: AddressFields | null; zone: DeliveryZone | null; feeCents: number }
  | { type: 'pickup'; slot: PickupSlot | null; feeCents: number };

/** Checks the delivery address / pickup slot and works out the delivery fee. */
export async function resolveFulfillment(
  db: Db,
  userId: number,
  input: QuoteInput['fulfillment'],
  subtotalCents: number,
): Promise<{ fulfillment: ResolvedFulfillment; issues: CheckoutIssue[] }> {
  const issues: CheckoutIssue[] = [];

  if (input.type === 'pickup') {
    if (!input.pickupSlotId) {
      issues.push({ code: 'PICKUP_SLOT_REQUIRED', message: 'Please choose a collection time.' });
      return { fulfillment: { type: 'pickup', slot: null, feeCents: 0 }, issues };
    }
    const slot = await getSlot(db, input.pickupSlotId);
    if (!slot || !slot.isAvailable) {
      issues.push({ code: 'PICKUP_SLOT_UNAVAILABLE', message: 'That collection time is no longer available. Please choose another.' });
    }
    return { fulfillment: { type: 'pickup', slot, feeCents: 0 }, issues };
  }

  let address: AddressFields | null = null;
  if (input.addressId) {
    const { rows } = await db.query<AddressFields>(
      `SELECT recipient_name AS "recipientName", phone, line1, line2, city, postcode, instructions
       FROM addresses WHERE id = $1 AND user_id = $2`,
      [input.addressId, userId],
    );
    address = rows[0] ?? null;
    if (!address) issues.push({ code: 'ADDRESS_NOT_FOUND', message: 'That saved address could not be found.' });
  } else if (input.address) {
    address = input.address;
  } else {
    issues.push({ code: 'ADDRESS_REQUIRED', message: 'Please choose a delivery address.' });
  }

  let zone: DeliveryZone | null = null;
  let feeCents = 0;
  if (address) {
    zone = await findZoneForPostcode(db, address.postcode);
    if (!zone) {
      issues.push({
        code: 'OUTSIDE_SERVICE_AREA',
        message: `Sorry, we don't deliver to ${address.postcode.toUpperCase()} yet. You can choose store pickup instead.`,
      });
    } else {
      feeCents = deliveryFeeFor(zone, subtotalCents);
      if (subtotalCents < zone.minOrderCents) {
        issues.push({
          code: 'BELOW_MINIMUM_ORDER',
          message: `Delivery to ${zone.name} needs a minimum order of ${formatMoney(zone.minOrderCents)}.`,
        });
      }
    }
  }
  return { fulfillment: { type: 'delivery', address, zone, feeCents }, issues };
}

/** Price check used by the checkout screen before the order is placed. Nothing is saved. */
export async function buildQuote(db: Db, userId: number, input: QuoteInput) {
  const priced = await priceItems(db, input.items, { lockStock: false });
  const { fulfillment, issues } = await resolveFulfillment(db, userId, input.fulfillment, priced.subtotalCents);
  const allIssues = [...priced.issues, ...issues];

  return {
    items: priced.items,
    subtotalCents: priced.subtotalCents,
    deliveryFeeCents: fulfillment.feeCents,
    totalCents: priced.subtotalCents + fulfillment.feeCents,
    fulfillment: describeFulfillment(fulfillment, priced.subtotalCents),
    issues: allIssues,
    canPlaceOrder: allIssues.length === 0,
  };
}

function describeFulfillment(fulfillment: ResolvedFulfillment, subtotalCents: number) {
  if (fulfillment.type === 'pickup') {
    const { slot } = fulfillment;
    return {
      type: 'pickup' as const,
      slot: slot && { id: slot.id, startsAt: slot.startsAt, endsAt: slot.endsAt, remaining: slot.remaining },
    };
  }
  const { zone } = fulfillment;
  const threshold = zone?.freeDeliveryThresholdCents ?? null;
  return {
    type: 'delivery' as const,
    postcode: fulfillment.address?.postcode ?? null,
    zone: zone && {
      id: zone.id,
      name: zone.name,
      feeCents: zone.feeCents,
      freeDeliveryThresholdCents: zone.freeDeliveryThresholdCents,
      minOrderCents: zone.minOrderCents,
    },
    // e.g. "Spend $4.20 more for free delivery"
    amountToFreeDeliveryCents: threshold != null && subtotalCents < threshold ? threshold - subtotalCents : null,
  };
}
