-- Product photos stored inside the database (used when IMAGE_STORAGE=database).
-- Handy on hosting plans whose disk is wiped on every deploy, so uploaded
-- photos don't disappear. Served by GET /api/images/:id.
CREATE TABLE product_images (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  content_type text        NOT NULL,
  data         bytea       NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
