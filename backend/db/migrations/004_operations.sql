-- =====================================================================
-- 004 — payments, notifications, substitutions, audit history, store
-- settings, roles, shopping lists, loyalty, bundles and support.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Statuses and roles
-- ---------------------------------------------------------------------
-- Orders are "confirmed" as soon as they are placed (and, for UPI, paid).
ALTER TYPE order_status RENAME VALUE 'pending' TO 'confirmed';
-- UPI orders wait here until the payment gateway confirms the payment.
ALTER TYPE order_status ADD VALUE 'awaiting_payment' BEFORE 'confirmed';

ALTER TYPE payment_method ADD VALUE 'upi';
ALTER TYPE payment_status ADD VALUE 'pending';            -- UPI started, result not known yet
ALTER TYPE payment_status ADD VALUE 'failed';
ALTER TYPE payment_status ADD VALUE 'refund_pending';
ALTER TYPE payment_status ADD VALUE 'partially_refunded';

-- "manager" = store owner/manager (everything); "staff" = pickers and cashiers.
ALTER TYPE user_role ADD VALUE 'manager';

-- ---------------------------------------------------------------------
-- Customers: language, WhatsApp consent
-- ---------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN preferred_language text NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en', 'ta')),
  ADD COLUMN whatsapp_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN whatsapp_opt_in_at timestamptz;

-- ---------------------------------------------------------------------
-- Catalogue: Tamil names, category photos
-- ---------------------------------------------------------------------
ALTER TABLE categories
  ADD COLUMN name_ta text,
  ADD COLUMN image_url text;
ALTER TABLE products
  ADD COLUMN name_ta text;

-- ---------------------------------------------------------------------
-- Orders: discounts, payment deadline, refunds
-- ---------------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN discount_cents          integer NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),        -- bundle offers
  ADD COLUMN loyalty_discount_cents  integer NOT NULL DEFAULT 0 CHECK (loyalty_discount_cents >= 0),
  ADD COLUMN loyalty_points_redeemed integer NOT NULL DEFAULT 0 CHECK (loyalty_points_redeemed >= 0),
  ADD COLUMN loyalty_points_earned   integer NOT NULL DEFAULT 0 CHECK (loyalty_points_earned >= 0),
  ADD COLUMN refunded_cents          integer NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0),
  ADD COLUMN payment_due_by          timestamptz,   -- UPI orders are cancelled if unpaid by then
  ADD COLUMN paid_at                 timestamptz,
  ADD COLUMN whatsapp_updates        boolean NOT NULL DEFAULT false;

ALTER TABLE orders DROP CONSTRAINT orders_total_matches;
ALTER TABLE orders ADD CONSTRAINT orders_total_matches
  CHECK (total_cents = subtotal_cents + delivery_fee_cents - discount_cents - loyalty_discount_cents);
ALTER TABLE orders ADD CONSTRAINT orders_total_not_negative CHECK (total_cents >= 0);

-- payment_due_by is only set while an order waits for its UPI payment.
CREATE INDEX orders_payment_due_idx ON orders (payment_due_by) WHERE payment_due_by IS NOT NULL;

-- Bundle offers applied to an order (snapshot).
CREATE TABLE order_promotions (
  order_id       integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  promotion_id   integer,
  name           text    NOT NULL,
  times_applied  integer NOT NULL CHECK (times_applied > 0),
  discount_cents integer NOT NULL CHECK (discount_cents > 0)
);
CREATE INDEX order_promotions_order_idx ON order_promotions (order_id);

-- ---------------------------------------------------------------------
-- Substitutions: what the customer asked for, and what staff did
-- ---------------------------------------------------------------------
ALTER TABLE order_items
  -- none = remove it and don't charge; similar = staff pick a close match; specific = the product chosen below
  ADD COLUMN substitution_preference text NOT NULL DEFAULT 'none'
    CHECK (substitution_preference IN ('none', 'similar', 'specific')),
  ADD COLUMN preferred_substitute_id integer REFERENCES products(id),
  -- ordered = as ordered; substituted = replaced; unavailable = removed, not charged
  ADD COLUMN fulfilment_status text NOT NULL DEFAULT 'ordered'
    CHECK (fulfilment_status IN ('ordered', 'substituted', 'unavailable')),
  ADD COLUMN substitute_product_id       integer REFERENCES products(id),
  ADD COLUMN substitute_name             text,
  ADD COLUMN substitute_unit_label       text,
  ADD COLUMN substitute_unit_price_cents integer CHECK (substitute_unit_price_cents > 0),
  ADD COLUMN substitute_quantity         integer CHECK (substitute_quantity > 0),
  -- What the customer pays for this line now (0 when unavailable).
  ADD COLUMN charged_cents integer;
UPDATE order_items SET charged_cents = line_total_cents;
ALTER TABLE order_items ALTER COLUMN charged_cents SET NOT NULL;
ALTER TABLE order_items ADD CONSTRAINT order_items_charged_not_negative CHECK (charged_cents >= 0);

-- ---------------------------------------------------------------------
-- Payments (UPI through a gateway such as Razorpay, or the local DEMO)
-- Only references, amounts, statuses and times are stored — never card,
-- bank or UPI credentials (the customer enters those with the gateway/UPI app).
-- ---------------------------------------------------------------------
CREATE TABLE payments (
  id                  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id            integer     NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider            text        NOT NULL CHECK (provider IN ('razorpay', 'demo')),
  method              text        NOT NULL DEFAULT 'upi',
  status              text        NOT NULL DEFAULT 'created'
                      CHECK (status IN ('created', 'pending', 'paid', 'failed', 'cancelled', 'expired')),
  amount_cents        integer     NOT NULL CHECK (amount_cents > 0),
  currency            text        NOT NULL DEFAULT 'INR',
  provider_order_id   text,       -- e.g. order_Abc123 (Razorpay)
  provider_payment_id text,       -- e.g. pay_Xyz789 (Razorpay)
  failure_reason      text,       -- the gateway's explanation, e.g. "Payment declined by bank"
  checkout_token      text        NOT NULL UNIQUE,   -- random; identifies the hosted payment page
  return_url          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  paid_at             timestamptz,
  failed_at           timestamptz,
  cancelled_at        timestamptz
);
CREATE INDEX payments_order_idx ON payments (order_id, created_at DESC);
CREATE UNIQUE INDEX payments_provider_order_unique ON payments (provider, provider_order_id) WHERE provider_order_id IS NOT NULL;
CREATE UNIQUE INDEX payments_provider_payment_unique ON payments (provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL;
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE refunds (
  id                 integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id           integer     NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_id         integer     NOT NULL REFERENCES payments(id),
  provider           text        NOT NULL,
  provider_refund_id text,
  amount_cents       integer     NOT NULL CHECK (amount_cents > 0),
  status             text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  reason             text        NOT NULL,
  failure_reason     text,
  created_by         integer     REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  processed_at       timestamptz
);
CREATE INDEX refunds_order_idx ON refunds (order_id);
CREATE UNIQUE INDEX refunds_provider_unique ON refunds (provider, provider_refund_id) WHERE provider_refund_id IS NOT NULL;
CREATE TRIGGER refunds_updated_at BEFORE UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Gateway webhooks can arrive more than once; each event is processed once.
CREATE TABLE processed_webhooks (
  provider    text        NOT NULL,
  event_id    text        NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

-- ---------------------------------------------------------------------
-- Customer notifications
-- ---------------------------------------------------------------------
-- In-app updates (shown in the app's Updates list).
CREATE TABLE notifications (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    integer     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id   integer     REFERENCES orders(id) ON DELETE CASCADE,
  event      text        NOT NULL,   -- e.g. order_confirmed, order_preparing, refund_processed
  title      text        NOT NULL,
  body       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at    timestamptz
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

-- WhatsApp messages: an outbox + log. In DEMO mode messages are only recorded here.
CREATE TABLE whatsapp_messages (
  id                  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id             integer     REFERENCES users(id) ON DELETE SET NULL,
  order_id            integer     REFERENCES orders(id) ON DELETE CASCADE,
  event               text        NOT NULL,
  to_phone            text,       -- E.164 digits, e.g. 919789562928
  language            text        NOT NULL,
  template_name       text        NOT NULL,
  template_params     jsonb       NOT NULL,
  preview_text        text        NOT NULL,   -- the message as the customer would read it
  mode                text        NOT NULL CHECK (mode IN ('demo', 'cloud_api')),
  status              text        NOT NULL
                      CHECK (status IN ('demo_recorded', 'queued', 'sent', 'delivered', 'read', 'failed', 'skipped')),
  skip_reason         text,
  provider_message_id text,
  error               text,
  attempts            integer     NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_messages_created_idx ON whatsapp_messages (created_at DESC);
CREATE INDEX whatsapp_messages_status_idx ON whatsapp_messages (status) WHERE status IN ('queued', 'failed');
CREATE UNIQUE INDEX whatsapp_messages_provider_unique ON whatsapp_messages (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE TRIGGER whatsapp_messages_updated_at BEFORE UPDATE ON whatsapp_messages FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Audit history
-- ---------------------------------------------------------------------
-- Every change to a stock level, recorded automatically by a trigger.
-- The code says WHY (order placed, delivery received, …) with set_config('app.stock_*').
CREATE TABLE inventory_movements (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id     integer     NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  change         integer     NOT NULL,
  quantity_after integer     NOT NULL,
  reason         text        NOT NULL,
  order_id       integer     REFERENCES orders(id) ON DELETE SET NULL,
  user_id        integer     REFERENCES users(id) ON DELETE SET NULL,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_product_idx ON inventory_movements (product_id, created_at DESC, id DESC);

INSERT INTO inventory_movements (product_id, change, quantity_after, reason, note)
SELECT product_id, quantity, quantity, 'opening_balance', 'Stock level when history tracking started'
FROM inventory;

CREATE FUNCTION log_inventory_change() RETURNS trigger AS $$
DECLARE
  delta integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    delta := NEW.quantity;
  ELSE
    delta := NEW.quantity - OLD.quantity;
  END IF;
  IF TG_OP = 'UPDATE' AND delta = 0 THEN
    RETURN NULL;
  END IF;
  INSERT INTO inventory_movements (product_id, change, quantity_after, reason, order_id, user_id, note)
  VALUES (
    NEW.product_id,
    delta,
    NEW.quantity,
    COALESCE(NULLIF(current_setting('app.stock_reason', true), ''), CASE WHEN TG_OP = 'INSERT' THEN 'new_product' ELSE 'adjustment' END),
    NULLIF(current_setting('app.stock_order_id', true), '')::integer,
    NULLIF(current_setting('app.stock_user_id', true), '')::integer,
    NULLIF(current_setting('app.stock_note', true), '')
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_audit AFTER INSERT OR UPDATE OF quantity ON inventory
  FOR EACH ROW EXECUTE FUNCTION log_inventory_change();

-- Everything that happens to an order (status, payments, refunds, substitutions, notes…).
CREATE TABLE order_events (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id            integer     NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type                text        NOT NULL,
  message             text        NOT NULL,
  details             jsonb,
  actor_user_id       integer     REFERENCES users(id) ON DELETE SET NULL,
  actor_role          text        NOT NULL,   -- customer, staff, manager, system, gateway
  visible_to_customer boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order_idx ON order_events (order_id, created_at, id);

INSERT INTO order_events (order_id, type, message, actor_user_id, actor_role, visible_to_customer, created_at)
SELECT h.order_id,
       'status_changed',
       -- "Order placed", not "Order placed: Order placed"
       label.text || CASE WHEN h.note IS NULL OR h.note = label.text THEN '' ELSE ': ' || h.note END,
       h.changed_by,
       COALESCE(u.role::text, 'system'),
       true,
       h.created_at
FROM order_status_history h
LEFT JOIN users u ON u.id = h.changed_by
CROSS JOIN LATERAL (
  SELECT CASE h.status::text
           WHEN 'confirmed' THEN 'Order placed'
           WHEN 'preparing' THEN 'Status changed to Preparing'
           WHEN 'ready_for_pickup' THEN 'Status changed to Ready for pickup'
           WHEN 'out_for_delivery' THEN 'Status changed to Out for delivery'
           WHEN 'completed' THEN 'Status changed to Completed'
           WHEN 'cancelled' THEN 'Order cancelled'
           ELSE 'Status changed'
         END AS text
) AS label;

-- ---------------------------------------------------------------------
-- Store settings (one row), opening hours and closures
-- Rows are created by the API on first use from the PICKUP_* settings.
-- ---------------------------------------------------------------------
CREATE TABLE store_settings (
  id                          boolean PRIMARY KEY DEFAULT true CHECK (id),
  pickup_slot_minutes         integer NOT NULL CHECK (pickup_slot_minutes BETWEEN 15 AND 240),
  pickup_slot_capacity        integer NOT NULL CHECK (pickup_slot_capacity BETWEEN 1 AND 500),
  pickup_days_ahead           integer NOT NULL CHECK (pickup_days_ahead BETWEEN 0 AND 14),
  pickup_lead_time_minutes    integer NOT NULL CHECK (pickup_lead_time_minutes BETWEEN 0 AND 1440),
  substitutions_enabled       boolean NOT NULL DEFAULT true,
  loyalty_enabled             boolean NOT NULL DEFAULT false,
  loyalty_points_per_100      integer NOT NULL DEFAULT 1 CHECK (loyalty_points_per_100 BETWEEN 0 AND 100),
  loyalty_point_value_cents   integer NOT NULL DEFAULT 100 CHECK (loyalty_point_value_cents BETWEEN 1 AND 10000),
  loyalty_min_redeem_points   integer NOT NULL DEFAULT 50 CHECK (loyalty_min_redeem_points >= 0),
  loyalty_max_redeem_percent  integer NOT NULL DEFAULT 20 CHECK (loyalty_max_redeem_percent BETWEEN 0 AND 100),
  promotions_enabled          boolean NOT NULL DEFAULT false,
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by                  integer REFERENCES users(id)
);

-- weekday: 0 = Sunday … 6 = Saturday (store time zone)
CREATE TABLE opening_hours (
  weekday   smallint PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6),
  opens_at  time    NOT NULL,
  closes_at time    NOT NULL,
  is_closed boolean NOT NULL DEFAULT false,
  CHECK (closes_at > opens_at)
);

CREATE TABLE store_closures (
  date   date PRIMARY KEY,
  reason text NOT NULL
);

-- ---------------------------------------------------------------------
-- Shopping lists
-- ---------------------------------------------------------------------
CREATE TABLE shopping_lists (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    integer     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shopping_lists_user_idx ON shopping_lists (user_id);
CREATE TRIGGER shopping_lists_updated_at BEFORE UPDATE ON shopping_lists FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE shopping_list_items (
  list_id    integer     NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  product_id integer     NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity   integer     NOT NULL CHECK (quantity BETWEEN 1 AND 50),
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, product_id)
);

-- ---------------------------------------------------------------------
-- Loyalty points (optional — off until enabled in store settings)
-- ---------------------------------------------------------------------
CREATE TABLE loyalty_ledger (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    integer     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id   integer     REFERENCES orders(id) ON DELETE SET NULL,
  points     integer     NOT NULL CHECK (points <> 0),
  reason     text        NOT NULL CHECK (reason IN ('earned', 'redeemed', 'redeem_reversed', 'adjustment')),
  note       text,
  created_by integer     REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX loyalty_ledger_user_idx ON loyalty_ledger (user_id, created_at DESC);

-- ---------------------------------------------------------------------
-- Bundle offers (optional — off until enabled in store settings)
-- "Buy all of these together and save ₹X"
-- ---------------------------------------------------------------------
CREATE TABLE promotions (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           text        NOT NULL,
  name_ta        text,
  description    text        NOT NULL DEFAULT '',
  discount_cents integer     NOT NULL CHECK (discount_cents > 0),
  is_active      boolean     NOT NULL DEFAULT true,
  starts_at      timestamptz,
  ends_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE TRIGGER promotions_updated_at BEFORE UPDATE ON promotions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE promotion_items (
  promotion_id integer NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  product_id   integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity     integer NOT NULL CHECK (quantity BETWEEN 1 AND 50),
  PRIMARY KEY (promotion_id, product_id)
);

-- ---------------------------------------------------------------------
-- Customer support requests ("Report a problem")
-- ---------------------------------------------------------------------
CREATE TABLE support_requests (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     integer     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id    integer     REFERENCES orders(id) ON DELETE SET NULL,
  topic       text        NOT NULL CHECK (topic IN ('missing_item', 'damaged_item', 'wrong_item', 'late', 'payment', 'refund', 'other')),
  message     text        NOT NULL,
  status      text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  staff_reply text,
  resolved_by integer     REFERENCES users(id),
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_requests_status_idx ON support_requests (status, created_at DESC);
CREATE INDEX support_requests_user_idx ON support_requests (user_id, created_at DESC);
CREATE TRIGGER support_requests_updated_at BEFORE UPDATE ON support_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
