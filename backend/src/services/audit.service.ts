// Audit history.
//
// Stock: a database trigger records EVERY change to a stock level in
// inventory_movements. Before changing stock, code calls setStockContext() so
// the record says why (order placed, delivery received, …) and who did it.
// The context lasts until the end of the current transaction.
//
// Orders: addOrderEvent() records everything that happens to an order
// (payments, refunds, substitutions, cancellations, notes) in order_events.
import type { Db } from '../db/pool.js';

export type StockReason =
  | 'order_placed'
  | 'order_cancelled'
  | 'payment_expired'
  | 'substitution'
  | 'item_unavailable'
  | 'delivery_received'
  | 'damaged'
  | 'stock_count'
  | 'adjustment'
  | 'new_product'
  | 'sample_data';

export const STOCK_REASON_LABELS: Record<StockReason | 'opening_balance', string> = {
  order_placed: 'Order placed',
  order_cancelled: 'Order cancelled (back in stock)',
  payment_expired: 'Unpaid order released',
  substitution: 'Used as a substitute',
  item_unavailable: 'Not found on the shelf',
  delivery_received: 'Delivery received',
  damaged: 'Damaged / expired',
  stock_count: 'Stock count',
  adjustment: 'Adjustment',
  new_product: 'New product',
  sample_data: 'Sample data',
  opening_balance: 'Opening balance',
};

export interface StockContext {
  reason: StockReason;
  orderId?: number | null;
  userId?: number | null;
  note?: string | null;
}

/** Must be called inside a transaction (withTransaction), before the stock update. */
export async function setStockContext(db: Db, ctx: StockContext): Promise<void> {
  await db.query(
    `SELECT set_config('app.stock_reason', $1, true), set_config('app.stock_order_id', $2, true),
            set_config('app.stock_user_id', $3, true), set_config('app.stock_note', $4, true)`,
    [ctx.reason, ctx.orderId ? String(ctx.orderId) : '', ctx.userId ? String(ctx.userId) : '', ctx.note ?? ''],
  );
}

export type ActorRole = 'customer' | 'staff' | 'manager' | 'system' | 'gateway';

export interface Actor {
  id?: number | null;
  role: ActorRole;
}

export const SYSTEM: Actor = { role: 'system' };
export const GATEWAY: Actor = { role: 'gateway' };

export interface OrderEvent {
  type: string;
  message: string;
  details?: Record<string, unknown>;
  visibleToCustomer?: boolean;
}

export async function addOrderEvent(db: Db, orderId: number, actor: Actor, event: OrderEvent): Promise<void> {
  await db.query(
    `INSERT INTO order_events (order_id, type, message, details, actor_user_id, actor_role, visible_to_customer)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [orderId, event.type, event.message, event.details ? JSON.stringify(event.details) : null, actor.id ?? null, actor.role, event.visibleToCustomer ?? false],
  );
}
