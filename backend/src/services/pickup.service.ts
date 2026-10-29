// Store pickup ("click & collect") time slots.
// Slots are generated automatically from the store's opening hours and pickup
// settings (Staff dashboard → Store settings) for today plus the next few days,
// skipping closed days and holidays. Each slot holds a limited number of orders.
import { config } from '../config.js';
import type { Db } from '../db/pool.js';
import { getOpeningHours, getStoreSettings } from './settings.service.js';

export interface PickupSlot {
  id: number;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  bookedCount: number;
  remaining: number;
  isAvailable: boolean;
}

// $1 = lead time in minutes
const SLOT_COLUMNS = `
  id, starts_at AS "startsAt", ends_at AS "endsAt", capacity, booked_count AS "bookedCount",
  GREATEST(capacity - booked_count, 0) AS remaining,
  (booked_count < capacity AND starts_at > now() + make_interval(mins => $1::int)) AS "isAvailable"`;

/**
 * The slots the current settings ask for (times in the store's time zone):
 * every slot between opening and closing time on open days, skipping closures.
 * $1 = time zone.
 */
const WANTED_SLOTS = `
  WITH s AS (SELECT * FROM store_settings),
  days AS (
    SELECT d::date AS day
    FROM s, generate_series((now() AT TIME ZONE $1)::date, (now() AT TIME ZONE $1)::date + s.pickup_days_ahead, interval '1 day') d
  ),
  open_days AS (
    SELECT days.day, oh.opens_at, oh.closes_at
    FROM days JOIN opening_hours oh ON oh.weekday = extract(dow FROM days.day)::int AND NOT oh.is_closed
    WHERE NOT EXISTS (SELECT 1 FROM store_closures c WHERE c.date = days.day)
  ),
  wanted AS (
    SELECT ((day + opens_at) + make_interval(mins => m)) AT TIME ZONE $1 AS starts_at,
           ((day + opens_at) + make_interval(mins => m + s.pickup_slot_minutes)) AT TIME ZONE $1 AS ends_at,
           s.pickup_slot_capacity AS capacity
    FROM open_days, s,
         generate_series(0, (extract(epoch FROM closes_at - opens_at) / 60)::int - s.pickup_slot_minutes, s.pickup_slot_minutes) m
  )`;

async function ensureSettings(db: Db) {
  const [settings] = await Promise.all([getStoreSettings(db), getOpeningHours(db)]);
  return settings;
}

/** Creates any missing slots for the coming days. */
export async function ensurePickupSlots(db: Db): Promise<void> {
  await ensureSettings(db);
  await db.query(
    `${WANTED_SLOTS}
     INSERT INTO pickup_slots (starts_at, ends_at, capacity)
     SELECT starts_at, ends_at, capacity FROM wanted
     ON CONFLICT (starts_at) DO NOTHING`,
    [config.STORE_TIMEZONE],
  );
}

/**
 * After opening hours, closures or pickup settings change: unused future slots
 * are rebuilt; future slots that already have bookings keep them, but take no
 * new bookings if they no longer fit the hours (capacity 0).
 */
export async function refreshPickupSlots(db: Db): Promise<void> {
  await ensureSettings(db);
  await db.query(
    `DELETE FROM pickup_slots ps
     WHERE ps.starts_at > now() AND NOT EXISTS (SELECT 1 FROM order_pickups op WHERE op.slot_id = ps.id)`,
  );
  await db.query(
    `${WANTED_SLOTS}
     INSERT INTO pickup_slots (starts_at, ends_at, capacity)
     SELECT starts_at, ends_at, capacity FROM wanted
     ON CONFLICT (starts_at) DO UPDATE SET ends_at = EXCLUDED.ends_at, capacity = GREATEST(EXCLUDED.capacity, pickup_slots.booked_count)`,
    [config.STORE_TIMEZONE],
  );
  await db.query(
    `${WANTED_SLOTS}
     UPDATE pickup_slots SET capacity = 0
     WHERE starts_at > now() AND starts_at NOT IN (SELECT starts_at FROM wanted)`,
    [config.STORE_TIMEZONE],
  );
}

/** Upcoming slots (including full ones, so apps can show them as "Full"). Closed slots are hidden. */
export async function listUpcomingSlots(db: Db): Promise<PickupSlot[]> {
  await ensurePickupSlots(db);
  const settings = await getStoreSettings(db);
  const { rows } = await db.query<PickupSlot>(
    `SELECT ${SLOT_COLUMNS}
     FROM pickup_slots
     WHERE starts_at > now() + make_interval(mins => $1::int)
       AND starts_at < now() + make_interval(days => $2::int + 1)
       AND capacity > 0
     ORDER BY starts_at`,
    [settings.pickupLeadTimeMinutes, settings.pickupDaysAhead],
  );
  return rows;
}

export async function getSlot(db: Db, slotId: number): Promise<PickupSlot | null> {
  const settings = await getStoreSettings(db);
  const { rows } = await db.query<PickupSlot>(`SELECT ${SLOT_COLUMNS} FROM pickup_slots WHERE id = $2`, [
    settings.pickupLeadTimeMinutes,
    slotId,
  ]);
  return rows[0] ?? null;
}

/**
 * Books one place in a slot. The WHERE clause makes this safe when many
 * customers book at once: the update only succeeds while there is room.
 */
export async function reserveSlot(db: Db, slotId: number): Promise<PickupSlot | null> {
  const settings = await getStoreSettings(db);
  const { rows } = await db.query<PickupSlot>(
    `UPDATE pickup_slots SET booked_count = booked_count + 1
     WHERE id = $2 AND booked_count < capacity AND starts_at > now() + make_interval(mins => $1::int)
     RETURNING ${SLOT_COLUMNS}`,
    [settings.pickupLeadTimeMinutes, slotId],
  );
  return rows[0] ?? null;
}

export async function releaseSlot(db: Db, slotId: number): Promise<void> {
  await db.query('UPDATE pickup_slots SET booked_count = GREATEST(booked_count - 1, 0) WHERE id = $1', [slotId]);
}
