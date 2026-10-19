-- Product brand (e.g. "Surf Excel", "Maggi", or "Store packed" for loose
-- staples the store packs itself). Optional: existing products keep NULL.
ALTER TABLE products ADD COLUMN brand text;

-- Remembers which version of the sample catalogue has been loaded, so new
-- sample products are added to an existing database exactly once (see
-- syncSampleCatalog in src/db/seed.ts). Products you later edit, deactivate
-- or give a new SKU are never re-added.
CREATE TABLE sample_data_versions (
  version   text PRIMARY KEY,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
