// Store settings that managers change in the dashboard: pickup slots, opening
// hours, closures, substitutions, loyalty points and bundle offers.
// The first time they are needed they are created from the PICKUP_* settings in .env.
import { config } from '../config.js';
import type { Db } from '../db/pool.js';

export interface StoreSettings {
  pickupSlotMinutes: number;
  pickupSlotCapacity: number;
  pickupDaysAhead: number;
  pickupLeadTimeMinutes: number;
  substitutionsEnabled: boolean;
  loyaltyEnabled: boolean;
  /** Points earned for every ₹100 paid. */
  loyaltyPointsPer100: number;
  /** What one point is worth, in paise. */
  loyaltyPointValueCents: number;
  loyaltyMinRedeemPoints: number;
  /** The most of an order (in %) that points can pay for. */
  loyaltyMaxRedeemPercent: number;
  promotionsEnabled: boolean;
  updatedAt: Date;
}

export interface OpeningHours {
  weekday: number; // 0 = Sunday … 6 = Saturday
  opensAt: string; // "09:00"
  closesAt: string; // "20:00"
  isClosed: boolean;
}

export interface StoreClosure {
  date: string; // "2026-11-01"
  reason: string;
}

const SETTINGS_COLUMNS = `
  pickup_slot_minutes AS "pickupSlotMinutes", pickup_slot_capacity AS "pickupSlotCapacity",
  pickup_days_ahead AS "pickupDaysAhead", pickup_lead_time_minutes AS "pickupLeadTimeMinutes",
  substitutions_enabled AS "substitutionsEnabled",
  loyalty_enabled AS "loyaltyEnabled", loyalty_points_per_100 AS "loyaltyPointsPer100",
  loyalty_point_value_cents AS "loyaltyPointValueCents", loyalty_min_redeem_points AS "loyaltyMinRedeemPoints",
  loyalty_max_redeem_percent AS "loyaltyMaxRedeemPercent", promotions_enabled AS "promotionsEnabled",
  updated_at AS "updatedAt"`;

const pad = (hour: number) => `${String(Math.min(hour, 23)).padStart(2, '0')}:${hour >= 24 ? '59' : '00'}`;

export async function getStoreSettings(db: Db): Promise<StoreSettings> {
  const { rows } = await db.query<StoreSettings>(`SELECT ${SETTINGS_COLUMNS} FROM store_settings`);
  if (rows[0]) return rows[0];
  const inserted = await db.query<StoreSettings>(
    `INSERT INTO store_settings (pickup_slot_minutes, pickup_slot_capacity, pickup_days_ahead, pickup_lead_time_minutes)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
     RETURNING ${SETTINGS_COLUMNS}`,
    [config.PICKUP_SLOT_MINUTES, config.PICKUP_SLOT_CAPACITY, config.PICKUP_DAYS_AHEAD, config.PICKUP_LEAD_TIME_MINUTES],
  );
  return inserted.rows[0];
}

export async function getOpeningHours(db: Db): Promise<OpeningHours[]> {
  const select = () =>
    db.query<OpeningHours>(
      `SELECT weekday, to_char(opens_at, 'HH24:MI') AS "opensAt", to_char(closes_at, 'HH24:MI') AS "closesAt", is_closed AS "isClosed"
       FROM opening_hours ORDER BY weekday`,
    );
  let { rows } = await select();
  if (rows.length < 7) {
    await db.query(
      `INSERT INTO opening_hours (weekday, opens_at, closes_at)
       SELECT d, $1::time, $2::time FROM generate_series(0, 6) d
       ON CONFLICT (weekday) DO NOTHING`,
      [pad(config.PICKUP_OPEN_HOUR), pad(config.PICKUP_CLOSE_HOUR)],
    );
    ({ rows } = await select());
  }
  return rows;
}

export async function listClosures(db: Db, { upcomingOnly = true } = {}): Promise<StoreClosure[]> {
  const select = `SELECT to_char(date, 'YYYY-MM-DD') AS date, reason FROM store_closures`;
  const { rows } = upcomingOnly
    ? await db.query<StoreClosure>(`${select} WHERE date >= (now() AT TIME ZONE $1)::date ORDER BY date`, [config.STORE_TIMEZONE])
    : await db.query<StoreClosure>(`${select} ORDER BY date`);
  return rows;
}

const SETTING_COLUMNS: Record<keyof Omit<StoreSettings, 'updatedAt'>, string> = {
  pickupSlotMinutes: 'pickup_slot_minutes',
  pickupSlotCapacity: 'pickup_slot_capacity',
  pickupDaysAhead: 'pickup_days_ahead',
  pickupLeadTimeMinutes: 'pickup_lead_time_minutes',
  substitutionsEnabled: 'substitutions_enabled',
  loyaltyEnabled: 'loyalty_enabled',
  loyaltyPointsPer100: 'loyalty_points_per_100',
  loyaltyPointValueCents: 'loyalty_point_value_cents',
  loyaltyMinRedeemPoints: 'loyalty_min_redeem_points',
  loyaltyMaxRedeemPercent: 'loyalty_max_redeem_percent',
  promotionsEnabled: 'promotions_enabled',
};

export async function updateStoreSettings(db: Db, changes: Partial<StoreSettings>, userId: number): Promise<StoreSettings> {
  await getStoreSettings(db); // make sure the row exists
  const params: unknown[] = [userId];
  const sets: string[] = ['updated_at = now()', 'updated_by = $1'];
  for (const [field, column] of Object.entries(SETTING_COLUMNS)) {
    const value = changes[field as keyof StoreSettings];
    if (value !== undefined) {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    }
  }
  await db.query(`UPDATE store_settings SET ${sets.join(', ')}`, params);
  return getStoreSettings(db);
}

export async function setOpeningHours(db: Db, hours: OpeningHours[]): Promise<void> {
  for (const day of hours) {
    await db.query(
      `INSERT INTO opening_hours (weekday, opens_at, closes_at, is_closed) VALUES ($1, $2, $3, $4)
       ON CONFLICT (weekday) DO UPDATE SET opens_at = EXCLUDED.opens_at, closes_at = EXCLUDED.closes_at, is_closed = EXCLUDED.is_closed`,
      [day.weekday, day.opensAt, day.closesAt, day.isClosed],
    );
  }
}

export async function addClosure(db: Db, closure: StoreClosure): Promise<void> {
  await db.query(
    `INSERT INTO store_closures (date, reason) VALUES ($1, $2) ON CONFLICT (date) DO UPDATE SET reason = EXCLUDED.reason`,
    [closure.date, closure.reason],
  );
}

export async function removeClosure(db: Db, date: string): Promise<boolean> {
  const { rowCount } = await db.query('DELETE FROM store_closures WHERE date = $1', [date]);
  return Boolean(rowCount);
}
