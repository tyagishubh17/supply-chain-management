-- =========================================================
-- Multi-Vendor Supply Chain Management System
-- 02. TABLES  (PostgreSQL / Supabase)
-- =========================================================
-- Four entities only: vendors, customers, products, orders.
-- Foreign keys, CHECKs and UNIQUEs are added separately in
-- constraints.sql so the ALTER TABLE syntax is visible.
-- =========================================================

-- Controlled set of order states. An enum type is used instead of
-- several boolean flags (is_accepted / is_rejected / ...) so an order
-- can only ever be in exactly one state.
DROP TYPE IF EXISTS order_status CASCADE;
CREATE TYPE order_status AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- ---------------------------------------------------------
-- vendors : a supplier who owns products and decides on orders
-- vendor_id is the stable surrogate key used by products.vendor_id
-- and by vendor-specific order operations.
-- Email identifies the account and is enforced as unique separately.
-- ---------------------------------------------------------
CREATE TABLE vendors (
    vendor_id     SERIAL       PRIMARY KEY,
    company_name  VARCHAR(150) NOT NULL,
    email         VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------
-- customers : a buyer who browses products and places orders
-- ---------------------------------------------------------
CREATE TABLE customers (
    customer_id   SERIAL       PRIMARY KEY,
    full_name     VARCHAR(150) NOT NULL,
    email         VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------
-- products : owned by exactly one vendor (Vendor 1 : N Product)
-- ---------------------------------------------------------
-- quantity is the vendor's own stock. It is decremented ONLY when the
-- vendor accepts an order (see accept_order() in functions.sql).
-- is_active supports soft deletion: a product referenced by historical
-- orders is hidden rather than physically removed.
CREATE TABLE products (
    product_id   SERIAL         PRIMARY KEY,
    vendor_id    INTEGER        NOT NULL,
    product_name VARCHAR(150)   NOT NULL,
    price        NUMERIC(10, 2) NOT NULL,
    quantity     INTEGER        NOT NULL DEFAULT 0,
    is_active    BOOLEAN        NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ    NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------
-- orders : one customer ordering one product
-- ---------------------------------------------------------
-- unit_price is a deliberate historical price snapshot. It stores the
-- product price that applied when the order was created, so later changes
-- to products.price do not change existing order totals.
--
-- The vendor_id is intentionally not duplicated in orders. The vendor is
-- resolved through products.vendor_id, avoiding a transitive dependency
-- and keeping the order relation consistent with the 3NF design.
--
-- This design preserves both:
--   1. historical order pricing
--   2. normalized vendor-product-order relationships
CREATE TABLE orders (
    order_id            SERIAL         PRIMARY KEY,
    customer_id         INTEGER        NOT NULL,
    product_id          INTEGER        NOT NULL,
    quantity            INTEGER        NOT NULL,
    unit_price          NUMERIC(10, 2) NOT NULL,
    status              order_status    NOT NULL DEFAULT 'PENDING',
    cancellation_reason TEXT,
    shipping_address    TEXT,
    contact_phone       VARCHAR(25),
    ordered_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
    decided_at          TIMESTAMPTZ
);
