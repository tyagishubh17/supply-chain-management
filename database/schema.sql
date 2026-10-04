-- =========================================================
-- Multi-Vendor Supply Chain Management System
-- 01. SCHEMA  --  master build script (PostgreSQL / Supabase)
-- =========================================================
--
-- Running this script drops and rebuilds the whole schema.
--
--   Local PostgreSQL:
--       psql "$DATABASE_URL" -f database/schema.sql
--
--   Supabase (SQL Editor has no \i include support):
--       paste and run these files in order --
--         1. database/schema.sql      (this file, for the DROP section)
--         2. database/tables.sql
--         3. database/constraints.sql
--         4. database/functions.sql
--         5. database/views.sql
--         6. database/seed.sql        (optional demo data)
--
-- =========================================================
-- Clean slate. CASCADE also removes the dependent views and the
-- triggers attached to these tables.
-- =========================================================
DROP VIEW  IF EXISTS vw_vendor_product_sales CASCADE;
DROP VIEW  IF EXISTS vw_order_details        CASCADE;
DROP VIEW  IF EXISTS vw_available_products   CASCADE;

DROP TABLE IF EXISTS orders    CASCADE;
DROP TABLE IF EXISTS products  CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS vendors   CASCADE;

DROP TYPE  IF EXISTS order_status CASCADE;

DROP FUNCTION IF EXISTS place_order(INTEGER, INTEGER, INTEGER)          CASCADE;
DROP FUNCTION IF EXISTS place_order(INTEGER, INTEGER, INTEGER, TEXT, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS accept_order(INTEGER, INTEGER)                  CASCADE;
DROP FUNCTION IF EXISTS reject_order(INTEGER, INTEGER)                  CASCADE;
DROP FUNCTION IF EXISTS cancel_order(INTEGER, INTEGER, TEXT)            CASCADE;
DROP FUNCTION IF EXISTS update_product_price(INTEGER, INTEGER, NUMERIC) CASCADE;
DROP FUNCTION IF EXISTS delete_product(INTEGER, INTEGER)                CASCADE;
DROP FUNCTION IF EXISTS restock_product(INTEGER, INTEGER, INTEGER)      CASCADE;
DROP FUNCTION IF EXISTS customer_cancel_order(INTEGER, INTEGER)         CASCADE;
DROP FUNCTION IF EXISTS trg_products_set_updated_at()                   CASCADE;
DROP FUNCTION IF EXISTS trg_check_email_unique_across_roles()           CASCADE;

-- =========================================================
-- Build (psql only -- see the Supabase note above)
-- =========================================================
-- \ir, not \i: \i resolves against the current directory, so the command
-- documented above only worked from inside this folder. \ir resolves
-- against the directory holding this script, so it works from anywhere.
\ir tables.sql
\ir constraints.sql
\ir functions.sql
\ir views.sql
