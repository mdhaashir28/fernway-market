// Store pickup ("click & collect") time slots.
// Slots are generated automatically from the PICKUP_* settings in .env for
// today plus the next few days. Each slot holds a limited number of orders.
import { config } from '../config.js';
import type { Db } from '../db/pool.js';

export interface PickupSlot {
  id: number;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  bookedCount: number;
  remaining: number;
  isAvailable: boolean;
}

const SLOT_COLUMNS = `
  id, starts_at AS "startsAt", ends_at AS "endsAt", capacity, booked_count AS "bookedCount",
  GREATEST(capacity - booked_count, 0) AS remaining,
  (booked_count < capacity AND starts_at > now() + make_interval(mins => $1::int)) AS "isAvailable"`;

/** Creates any missing slots for the coming days (times are in the store's time zone). */
export async function ensurePickupSlots(db: Db): Promise<void> {
  await db.query(
    `INSERT INTO pickup_slots (starts_at, ends_at, capacity)
     SELECT (day + make_interval(mins => minute)) AT TIME ZONE $1,
            (day + make_interval(mins => minute + $4::int)) AT TIME ZONE $1,
            $5::int
     FROM generate_series(
            ((now() AT TIME ZONE $1)::date)::timestamp,
            ((now() AT TIME ZONE $1)::date + $6::int)::timestamp,
            interval '1 day') AS day,
          generate_series($2::int * 60, $3::int * 60 - $4::int, $4::int) AS minute
     ON CONFLICT (starts_at) DO NOTHING`,
    [
      config.STORE_TIMEZONE,
      config.PICKUP_OPEN_HOUR,
      config.PICKUP_CLOSE_HOUR,
      config.PICKUP_SLOT_MINUTES,
      config.PICKUP_SLOT_CAPACITY,
      config.PICKUP_DAYS_AHEAD,
    ],
  );
}

/** Upcoming slots (including full ones, so apps can show them as "Full"). */
export async function listUpcomingSlots(db: Db): Promise<PickupSlot[]> {
  await ensurePickupSlots(db);
  const { rows } = await db.query<PickupSlot>(
    `SELECT ${SLOT_COLUMNS}
     FROM pickup_slots
     WHERE starts_at > now() + make_interval(mins => $1::int)
       AND starts_at < now() + make_interval(days => $2::int + 1)
     ORDER BY starts_at`,
    [config.PICKUP_LEAD_TIME_MINUTES, config.PICKUP_DAYS_AHEAD],
  );
  return rows;
}

export async function getSlot(db: Db, slotId: number): Promise<PickupSlot | null> {
  const { rows } = await db.query<PickupSlot>(`SELECT ${SLOT_COLUMNS} FROM pickup_slots WHERE id = $2`, [
    config.PICKUP_LEAD_TIME_MINUTES,
    slotId,
  ]);
  return rows[0] ?? null;
}

/**
 * Books one place in a slot. The WHERE clause makes this safe when many
 * customers book at once: the update only succeeds while there is room.
 */
export async function reserveSlot(db: Db, slotId: number): Promise<PickupSlot | null> {
  const { rows } = await db.query<PickupSlot>(
    `UPDATE pickup_slots SET booked_count = booked_count + 1
     WHERE id = $2 AND booked_count < capacity AND starts_at > now() + make_interval(mins => $1::int)
     RETURNING ${SLOT_COLUMNS}`,
    [config.PICKUP_LEAD_TIME_MINUTES, slotId],
  );
  return rows[0] ?? null;
}

export async function releaseSlot(db: Db, slotId: number): Promise<void> {
  await db.query('UPDATE pickup_slots SET booked_count = GREATEST(booked_count - 1, 0) WHERE id = $1', [slotId]);
}
