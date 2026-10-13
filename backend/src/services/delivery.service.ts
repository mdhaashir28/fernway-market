// Delivery service area. Instead of a paid maps/geocoding API, the store
// defines zones by postcode prefix (e.g. "1000" covers 10001, 10002, ...).
import type { Db } from '../db/pool.js';

export interface DeliveryZone {
  id: number;
  name: string;
  postcodePrefixes: string[];
  feeCents: number;
  freeDeliveryThresholdCents: number | null;
  minOrderCents: number;
  isActive: boolean;
}

export const ZONE_COLUMNS = `
  id, name, postcode_prefixes AS "postcodePrefixes", fee_cents AS "feeCents",
  free_delivery_threshold_cents AS "freeDeliveryThresholdCents",
  min_order_cents AS "minOrderCents", is_active AS "isActive"`;

/** "sw1a 1aa" → "SW1A1AA" so that spacing and letter case never matter. */
export const normalizePostcode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

export async function listZones(db: Db, { activeOnly }: { activeOnly: boolean }): Promise<DeliveryZone[]> {
  const { rows } = await db.query<DeliveryZone>(
    `SELECT ${ZONE_COLUMNS} FROM delivery_zones ${activeOnly ? 'WHERE is_active' : ''} ORDER BY name`,
  );
  return rows;
}

/** Picks the zone with the longest matching prefix, or null if we don't deliver there. */
export function matchZone(zones: DeliveryZone[], postcode: string): DeliveryZone | null {
  const code = normalizePostcode(postcode);
  let best: DeliveryZone | null = null;
  let bestLength = 0;
  for (const zone of zones) {
    if (!zone.isActive) continue;
    for (const rawPrefix of zone.postcodePrefixes) {
      const prefix = normalizePostcode(rawPrefix);
      if (prefix && code.startsWith(prefix) && prefix.length > bestLength) {
        best = zone;
        bestLength = prefix.length;
      }
    }
  }
  return best;
}

export async function findZoneForPostcode(db: Db, postcode: string) {
  return matchZone(await listZones(db, { activeOnly: true }), postcode);
}

export function deliveryFeeFor(zone: DeliveryZone, subtotalCents: number): number {
  if (zone.freeDeliveryThresholdCents != null && subtotalCents >= zone.freeDeliveryThresholdCents) return 0;
  return zone.feeCents;
}
