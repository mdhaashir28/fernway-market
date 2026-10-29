// Optional extras, both OFF until a manager turns them on (Store settings):
//   • Bundle offers — "buy these together and save ₹X".
//   • Loyalty points — earned on completed orders, spent at checkout.
import type { Db } from '../db/pool.js';
import type { StoreSettings } from './settings.service.js';

// ---------------------------------------------------------------------------
// Bundle offers
// ---------------------------------------------------------------------------
export interface PromotionItem {
  productId: number;
  quantity: number;
  name: string;
  nameTa: string | null;
  unitLabel: string;
  priceCents: number;
  imageUrl: string | null;
  isAvailable: boolean;
}

export interface Promotion {
  id: number;
  name: string;
  nameTa: string | null;
  description: string;
  discountCents: number;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  isRunning: boolean;
  items: PromotionItem[];
}

export async function listPromotions(db: Db, { runningOnly }: { runningOnly: boolean }): Promise<Promotion[]> {
  const { rows } = await db.query<Promotion & { itemsJson: PromotionItem[] | null }>(
    `SELECT pr.id, pr.name, pr.name_ta AS "nameTa", pr.description, pr.discount_cents AS "discountCents",
            pr.is_active AS "isActive", pr.starts_at AS "startsAt", pr.ends_at AS "endsAt",
            (pr.is_active AND (pr.starts_at IS NULL OR pr.starts_at <= now()) AND (pr.ends_at IS NULL OR pr.ends_at > now())) AS "isRunning",
            (SELECT json_agg(json_build_object(
                      'productId', p.id, 'quantity', pi.quantity, 'name', p.name, 'nameTa', p.name_ta,
                      'unitLabel', p.unit_label, 'priceCents', p.price_cents, 'imageUrl', p.image_url,
                      'isAvailable', p.is_active AND c.is_active AND i.quantity >= pi.quantity)
                    ORDER BY p.name)
             FROM promotion_items pi
             JOIN products p ON p.id = pi.product_id
             JOIN categories c ON c.id = p.category_id
             JOIN inventory i ON i.product_id = p.id
             WHERE pi.promotion_id = pr.id) AS "itemsJson"
     FROM promotions pr
     ORDER BY pr.created_at DESC, pr.id DESC`,
  );
  const all = rows.map(({ itemsJson, ...promotion }) => ({ ...promotion, items: itemsJson ?? [] }));
  return runningOnly ? all.filter((p) => p.isRunning && p.items.length > 0) : all;
}

export interface AppliedPromotion {
  promotionId: number;
  name: string;
  nameTa: string | null;
  timesApplied: number;
  discountCents: number;
}

/**
 * Works out which bundles a cart qualifies for. Each item counts towards one
 * bundle only; bigger savings are applied first. The discount never exceeds
 * the price of the bundle's items.
 */
export async function applyPromotions(
  db: Db,
  settings: StoreSettings,
  lines: { productId: number; quantity: number; unitPriceCents: number }[],
): Promise<{ applied: AppliedPromotion[]; discountCents: number }> {
  if (!settings.promotionsEnabled || lines.length === 0) return { applied: [], discountCents: 0 };
  const promotions = (await listPromotions(db, { runningOnly: true })).sort((a, b) => b.discountCents - a.discountCents);
  const remaining = new Map(lines.map((l) => [l.productId, l.quantity]));
  const prices = new Map(lines.map((l) => [l.productId, l.unitPriceCents]));
  const applied: AppliedPromotion[] = [];

  for (const promotion of promotions) {
    let times = Infinity;
    for (const item of promotion.items) times = Math.min(times, Math.floor((remaining.get(item.productId) ?? 0) / item.quantity));
    if (!Number.isFinite(times) || times <= 0) continue;
    const bundleValue = promotion.items.reduce((sum, item) => sum + (prices.get(item.productId) ?? 0) * item.quantity, 0);
    const discountCents = Math.min(promotion.discountCents, bundleValue) * times;
    if (discountCents <= 0) continue;
    for (const item of promotion.items) remaining.set(item.productId, (remaining.get(item.productId) ?? 0) - item.quantity * times);
    applied.push({ promotionId: promotion.id, name: promotion.name, nameTa: promotion.nameTa, timesApplied: times, discountCents });
  }
  return { applied, discountCents: applied.reduce((sum, a) => sum + a.discountCents, 0) };
}

// ---------------------------------------------------------------------------
// Loyalty points
// ---------------------------------------------------------------------------
export async function getLoyaltyBalance(db: Db, userId: number): Promise<number> {
  const { rows } = await db.query<{ balance: number }>('SELECT COALESCE(sum(points), 0)::int AS balance FROM loyalty_ledger WHERE user_id = $1', [userId]);
  return rows[0].balance;
}

/** How many points a customer can spend on an order, and what they are worth. */
export function loyaltyRedemption(settings: StoreSettings, balance: number, orderAmountCents: number) {
  if (!settings.loyaltyEnabled || balance < settings.loyaltyMinRedeemPoints || balance <= 0) return { points: 0, discountCents: 0 };
  const maxDiscount = Math.floor((orderAmountCents * settings.loyaltyMaxRedeemPercent) / 100);
  const points = Math.min(balance, Math.floor(maxDiscount / settings.loyaltyPointValueCents));
  return { points, discountCents: points * settings.loyaltyPointValueCents };
}

/** Points earned for an amount actually paid (e.g. 1 point per ₹100). */
export const pointsEarnedFor = (settings: StoreSettings, paidCents: number) =>
  settings.loyaltyEnabled ? Math.floor(paidCents / 10000) * settings.loyaltyPointsPer100 : 0;
