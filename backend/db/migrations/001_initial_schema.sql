-- =====================================================================
-- Fernway Market — initial database schema
--
-- Conventions
--   * Money is stored in the currency's smallest unit (paise for INR, cents for USD)
--     in integer columns, e.g. 4550 = ₹45.50
--     so prices never suffer from floating-point rounding errors.
--   * Every table has created_at / updated_at timestamps where useful.
--   * Orders copy ("snapshot") product names, prices and addresses so that
--     later edits never change what a customer actually ordered.
-- =====================================================================

CREATE TYPE user_role        AS ENUM ('customer', 'staff');
CREATE TYPE fulfillment_type AS ENUM ('delivery', 'pickup');
CREATE TYPE order_status     AS ENUM (
  'pending', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'completed', 'cancelled'
);
-- No real card processing in this version: either pay when the order is
-- handed over, or a clearly-labelled DEMO payment that only simulates success.
CREATE TYPE payment_method   AS ENUM ('pay_on_fulfillment', 'demo_card');
CREATE TYPE payment_status   AS ENUM ('unpaid', 'paid', 'refunded');

-- Keeps updated_at current whenever a row changes.
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Users (customers and staff share one table; "role" tells them apart)
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         text        NOT NULL,
  password_hash text        NOT NULL,             -- bcrypt hash, never the raw password
  name          text        NOT NULL,
  phone         text,
  role          user_role   NOT NULL DEFAULT 'customer',
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Customer address book
-- ---------------------------------------------------------------------
CREATE TABLE addresses (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        integer     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label          text        NOT NULL DEFAULT 'Home',
  recipient_name text        NOT NULL,
  phone          text        NOT NULL,
  line1          text        NOT NULL,
  line2          text,
  city           text        NOT NULL,
  postcode       text        NOT NULL,
  instructions   text,
  is_default     boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX addresses_user_idx ON addresses (user_id);
-- At most one default address per customer.
CREATE UNIQUE INDEX addresses_one_default_per_user ON addresses (user_id) WHERE is_default;
CREATE TRIGGER addresses_updated_at BEFORE UPDATE ON addresses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------
CREATE TABLE categories (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text        NOT NULL,
  slug        text        NOT NULL UNIQUE,
  description text        NOT NULL DEFAULT '',
  icon        text        NOT NULL DEFAULT '🛒',     -- emoji shown when a product has no photo
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX categories_name_unique ON categories (lower(name));
CREATE TRIGGER categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE products (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id integer     NOT NULL REFERENCES categories(id),
  sku         text        UNIQUE,
  name        text        NOT NULL,
  description text        NOT NULL DEFAULT '',
  price_cents integer     NOT NULL CHECK (price_cents > 0),
  unit_label  text        NOT NULL DEFAULT 'each',   -- e.g. "1 kg bag", "2 L", "pack of 4"
  image_url   text,                                  -- e.g. /uploads/products/abc.jpg
  icon        text,                                  -- optional emoji fallback
  is_active   boolean     NOT NULL DEFAULT true,     -- false = hidden from customers ("deactivated")
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_category_idx ON products (category_id);
CREATE INDEX products_name_idx ON products (lower(name));
CREATE TRIGGER products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Stock lives in its own table. The CHECK constraint is the last line of
-- defence against overselling: the database refuses negative stock.
CREATE TABLE inventory (
  product_id          integer     PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  quantity            integer     NOT NULL DEFAULT 0  CHECK (quantity >= 0),
  low_stock_threshold integer     NOT NULL DEFAULT 10 CHECK (low_stock_threshold >= 0),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER inventory_updated_at BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Delivery service area (postcode zones) and pickup time slots
-- ---------------------------------------------------------------------
CREATE TABLE delivery_zones (
  id                            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                          text        NOT NULL,
  postcode_prefixes             text[]      NOT NULL,   -- e.g. {'1000','1001'} or {'SW1','SW2'}
  fee_cents                     integer     NOT NULL CHECK (fee_cents >= 0),
  free_delivery_threshold_cents integer     CHECK (free_delivery_threshold_cents > 0),
  min_order_cents               integer     NOT NULL DEFAULT 0 CHECK (min_order_cents >= 0),
  is_active                     boolean     NOT NULL DEFAULT true,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER delivery_zones_updated_at BEFORE UPDATE ON delivery_zones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Rows are created automatically by the API for the next few days.
CREATE TABLE pickup_slots (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  starts_at    timestamptz NOT NULL UNIQUE,
  ends_at      timestamptz NOT NULL,
  capacity     integer     NOT NULL CHECK (capacity >= 0),
  booked_count integer     NOT NULL DEFAULT 0 CHECK (booked_count >= 0),
  CHECK (ends_at > starts_at)
);

-- ---------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------
CREATE TABLE orders (
  id                 integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id            integer          NOT NULL REFERENCES users(id),
  status             order_status     NOT NULL DEFAULT 'pending',
  fulfillment_type   fulfillment_type NOT NULL,
  payment_method     payment_method   NOT NULL,
  payment_status     payment_status   NOT NULL DEFAULT 'unpaid',
  subtotal_cents     integer          NOT NULL CHECK (subtotal_cents >= 0),
  delivery_fee_cents integer          NOT NULL DEFAULT 0 CHECK (delivery_fee_cents >= 0),
  total_cents        integer          NOT NULL,
  notes              text,
  cancel_reason      text,
  cancelled_by       user_role,
  idempotency_key    text,            -- stops a double-tap from creating two orders
  created_at         timestamptz      NOT NULL DEFAULT now(),
  updated_at         timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT orders_total_matches CHECK (total_cents = subtotal_cents + delivery_fee_cents),
  CONSTRAINT orders_cancel_reason_required CHECK (status <> 'cancelled' OR cancel_reason IS NOT NULL)
);
CREATE INDEX orders_user_idx ON orders (user_id, created_at DESC);
CREATE INDEX orders_status_idx ON orders (status, created_at DESC);
CREATE UNIQUE INDEX orders_idempotency_unique ON orders (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE order_items (
  id               integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id         integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       integer NOT NULL REFERENCES products(id),
  product_name     text    NOT NULL,                 -- snapshot at time of order
  unit_label       text    NOT NULL,
  unit_price_cents integer NOT NULL CHECK (unit_price_cents > 0),
  quantity         integer NOT NULL CHECK (quantity > 0),
  line_total_cents integer NOT NULL,
  CONSTRAINT order_items_line_total CHECK (line_total_cents = unit_price_cents * quantity),
  CONSTRAINT order_items_one_line_per_product UNIQUE (order_id, product_id)
);

-- Exactly one of these two tables has a row for each order.
CREATE TABLE order_deliveries (
  order_id       integer PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  zone_id        integer REFERENCES delivery_zones(id),
  zone_name      text NOT NULL,
  recipient_name text NOT NULL,
  phone          text NOT NULL,
  line1          text NOT NULL,
  line2          text,
  city           text NOT NULL,
  postcode       text NOT NULL,
  instructions   text
);

CREATE TABLE order_pickups (
  order_id       integer     PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  slot_id        integer     NOT NULL REFERENCES pickup_slots(id),
  slot_starts_at timestamptz NOT NULL,
  slot_ends_at   timestamptz NOT NULL
);

-- Timeline shown to customers and staff.
CREATE TABLE order_status_history (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id   integer      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     order_status NOT NULL,
  note       text,
  changed_by integer      REFERENCES users(id),
  created_at timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX order_status_history_order_idx ON order_status_history (order_id, created_at);
