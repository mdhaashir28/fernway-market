-- =====================================================================
-- 005 — where photos come from, and Razorpay test-mode payments
-- =====================================================================

-- Where an uploaded product or category photo came from, typed by staff when
-- they upload it (for example "Taken in our shop, Oct 2026" or "From the
-- distributor, permission given"). The licensed sample photos are described in
-- backend/seed-images/sources.json instead.
ALTER TABLE products ADD COLUMN image_source text;
ALTER TABLE categories ADD COLUMN image_source text;

-- Payments made with Razorpay TEST keys: no real money moved.
ALTER TABLE payments ADD COLUMN test_mode boolean NOT NULL DEFAULT false;

-- Catalogue pictures are real photos only. The old emoji "icons" that were shown
-- when there was no photo are no longer used anywhere, so remove them.
ALTER TABLE products DROP COLUMN icon;
ALTER TABLE categories DROP COLUMN icon;
