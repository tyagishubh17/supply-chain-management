-- ============================================================================
-- Multi-Vendor Supply Chain Management System
-- COMPLETE SUPABASE SETUP SCRIPT (All-in-One)
-- ============================================================================
-- You can paste this entire script directly into the Supabase SQL Editor
-- and click "RUN". It executes the complete schema setup and initial seed data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1: CLEAN SLATE (Drop existing objects if re-running)
-- ----------------------------------------------------------------------------
DROP VIEW  IF EXISTS vw_vendor_product_sales CASCADE;
DROP VIEW  IF EXISTS vw_order_details        CASCADE;
DROP VIEW  IF EXISTS vw_available_products   CASCADE;

DROP TABLE IF EXISTS orders    CASCADE;
DROP TABLE IF EXISTS products  CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS vendors   CASCADE;

DROP TYPE  IF EXISTS order_status CASCADE;

DROP FUNCTION IF EXISTS place_order(INTEGER, INTEGER, INTEGER)          CASCADE;
DROP FUNCTION IF EXISTS accept_order(INTEGER, INTEGER)                  CASCADE;
DROP FUNCTION IF EXISTS reject_order(INTEGER, INTEGER)                  CASCADE;
DROP FUNCTION IF EXISTS cancel_order(INTEGER, INTEGER, TEXT)            CASCADE;
DROP FUNCTION IF EXISTS update_product_price(INTEGER, INTEGER, NUMERIC) CASCADE;
DROP FUNCTION IF EXISTS delete_product(INTEGER, INTEGER)                CASCADE;
DROP FUNCTION IF EXISTS trg_products_set_updated_at()                   CASCADE;
DROP FUNCTION IF EXISTS trg_check_email_unique_across_roles()           CASCADE;

-- ----------------------------------------------------------------------------
-- STEP 2: CREATE ENUM AND TABLES
-- ----------------------------------------------------------------------------
CREATE TYPE order_status AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

CREATE TABLE vendors (
    vendor_id     SERIAL       PRIMARY KEY,
    company_name  VARCHAR(150) NOT NULL,
    email         VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE customers (
    customer_id   SERIAL       PRIMARY KEY,
    full_name     VARCHAR(150) NOT NULL,
    email         VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

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

CREATE TABLE orders (
    order_id            SERIAL         PRIMARY KEY,
    customer_id         INTEGER        NOT NULL,
    product_id          INTEGER        NOT NULL,
    quantity            INTEGER        NOT NULL,
    unit_price          NUMERIC(10, 2) NOT NULL,
    status              order_status   NOT NULL DEFAULT 'PENDING',
    cancellation_reason TEXT,
    ordered_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
    decided_at          TIMESTAMPTZ
);

-- ----------------------------------------------------------------------------
-- STEP 3: CONSTRAINTS, TRIGGERS & INDEXES
-- ----------------------------------------------------------------------------
ALTER TABLE vendors   ADD CONSTRAINT uq_vendors_email   UNIQUE (email);
ALTER TABLE customers ADD CONSTRAINT uq_customers_email UNIQUE (email);

ALTER TABLE products
    ADD CONSTRAINT fk_products_vendor
    FOREIGN KEY (vendor_id) REFERENCES vendors (vendor_id)
    ON DELETE CASCADE;

ALTER TABLE orders
    ADD CONSTRAINT fk_orders_customer
    FOREIGN KEY (customer_id) REFERENCES customers (customer_id)
    ON DELETE RESTRICT;

ALTER TABLE orders
    ADD CONSTRAINT fk_orders_product
    FOREIGN KEY (product_id) REFERENCES products (product_id)
    ON DELETE RESTRICT;

ALTER TABLE products
    ADD CONSTRAINT chk_products_price_non_negative CHECK (price >= 0);

ALTER TABLE products
    ADD CONSTRAINT chk_products_quantity_non_negative CHECK (quantity >= 0);

ALTER TABLE products
    ADD CONSTRAINT chk_products_name_not_blank CHECK (length(btrim(product_name)) > 0);

ALTER TABLE orders
    ADD CONSTRAINT chk_orders_quantity_positive CHECK (quantity > 0);

ALTER TABLE orders
    ADD CONSTRAINT chk_orders_unit_price_non_negative CHECK (unit_price >= 0);

ALTER TABLE orders
    ADD CONSTRAINT chk_orders_cancellation_reason CHECK (
        (status = 'CANCELLED' AND cancellation_reason IS NOT NULL
                              AND length(btrim(cancellation_reason)) > 0)
        OR
        (status <> 'CANCELLED' AND cancellation_reason IS NULL)
    );

ALTER TABLE orders
    ADD CONSTRAINT chk_orders_decided_at CHECK (
        (status = 'PENDING' AND decided_at IS NULL)
        OR
        (status <> 'PENDING' AND decided_at IS NOT NULL)
    );

CREATE OR REPLACE FUNCTION trg_check_email_unique_across_roles()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'vendors' THEN
        IF EXISTS (SELECT 1 FROM customers WHERE email = NEW.email) THEN
            RAISE EXCEPTION 'Email % is already registered as a customer', NEW.email;
        END IF;
    ELSE
        IF EXISTS (SELECT 1 FROM vendors WHERE email = NEW.email) THEN
            RAISE EXCEPTION 'Email % is already registered as a vendor', NEW.email;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vendors_email_unique
    BEFORE INSERT OR UPDATE OF email ON vendors
    FOR EACH ROW EXECUTE FUNCTION trg_check_email_unique_across_roles();

CREATE TRIGGER trg_customers_email_unique
    BEFORE INSERT OR UPDATE OF email ON customers
    FOR EACH ROW EXECUTE FUNCTION trg_check_email_unique_across_roles();

CREATE UNIQUE INDEX uq_products_vendor_name_active
    ON products (vendor_id, lower(btrim(product_name)))
    WHERE is_active;

CREATE INDEX idx_products_vendor    ON products (vendor_id);
CREATE INDEX idx_products_name_lower ON products (lower(product_name));
CREATE INDEX idx_orders_customer ON orders (customer_id);
CREATE INDEX idx_orders_product  ON orders (product_id);
CREATE INDEX idx_orders_status   ON orders (status);

-- ----------------------------------------------------------------------------
-- STEP 4: STORED FUNCTIONS & TRIGGERS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_products_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION trg_products_set_updated_at();

CREATE OR REPLACE FUNCTION place_order(
    p_customer_id INTEGER,
    p_product_id  INTEGER,
    p_quantity    INTEGER
) RETURNS INTEGER AS $$
DECLARE
    v_available INTEGER;
    v_price     NUMERIC(10, 2);
    v_active    BOOLEAN;
    v_order_id  INTEGER;
BEGIN
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Order quantity must be at least 1.';
    END IF;

    SELECT quantity, price, is_active
      INTO v_available, v_price, v_active
      FROM products
     WHERE product_id = p_product_id
       FOR UPDATE;

    IF NOT FOUND OR NOT v_active THEN
        RAISE EXCEPTION 'Product % is not available for ordering.', p_product_id;
    END IF;

    IF v_available < p_quantity THEN
        RAISE EXCEPTION 'Requested quantity (%) exceeds available stock (%).',
            p_quantity, v_available;
    END IF;

    INSERT INTO orders (customer_id, product_id, quantity, unit_price, status)
    VALUES (p_customer_id, p_product_id, p_quantity, v_price, 'PENDING')
    RETURNING order_id INTO v_order_id;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION accept_order(
    p_vendor_id INTEGER,
    p_order_id  INTEGER
) RETURNS VOID AS $$
DECLARE
    v_product_id INTEGER;
    v_vendor_id  INTEGER;
    v_quantity   INTEGER;
    v_status     order_status;
    v_stock      INTEGER;
BEGIN
    SELECT o.product_id, p.vendor_id, o.quantity, o.status, p.quantity
      INTO v_product_id, v_vendor_id, v_quantity, v_status, v_stock
      FROM orders o
      JOIN products p ON p.product_id = o.product_id
     WHERE o.order_id = p_order_id
       FOR UPDATE OF o, p;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found.', p_order_id;
    END IF;

    IF v_vendor_id <> p_vendor_id THEN
        RAISE EXCEPTION 'Order % does not belong to vendor %.', p_order_id, p_vendor_id;
    END IF;

    IF v_status <> 'PENDING' THEN
        RAISE EXCEPTION 'Only PENDING orders can be accepted. Order % is currently %.',
            p_order_id, v_status;
    END IF;

    IF v_stock < v_quantity THEN
        RAISE EXCEPTION 'Cannot accept: requested % units but only % remain in stock.',
            v_quantity, v_stock;
    END IF;

    UPDATE products
       SET quantity = quantity - v_quantity
     WHERE product_id = v_product_id;

    UPDATE orders
       SET status = 'ACCEPTED',
           decided_at = now()
     WHERE order_id = p_order_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reject_order(
    p_vendor_id INTEGER,
    p_order_id  INTEGER
) RETURNS VOID AS $$
DECLARE
    v_vendor_id INTEGER;
    v_status    order_status;
BEGIN
    SELECT p.vendor_id, o.status
      INTO v_vendor_id, v_status
      FROM orders o
      JOIN products p ON p.product_id = o.product_id
     WHERE o.order_id = p_order_id
       FOR UPDATE OF o;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found.', p_order_id;
    END IF;

    IF v_vendor_id <> p_vendor_id THEN
        RAISE EXCEPTION 'Order % does not belong to vendor %.', p_order_id, p_vendor_id;
    END IF;

    IF v_status <> 'PENDING' THEN
        RAISE EXCEPTION 'Only PENDING orders can be rejected. Order % is currently %.',
            p_order_id, v_status;
    END IF;

    UPDATE orders
       SET status = 'REJECTED',
           decided_at = now()
     WHERE order_id = p_order_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cancel_order(
    p_vendor_id INTEGER,
    p_order_id  INTEGER,
    p_reason    TEXT
) RETURNS VOID AS $$
DECLARE
    v_product_id INTEGER;
    v_vendor_id  INTEGER;
    v_quantity   INTEGER;
    v_status     order_status;
BEGIN
    IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
        RAISE EXCEPTION 'A cancellation reason is required.';
    END IF;

    SELECT o.product_id, p.vendor_id, o.quantity, o.status
      INTO v_product_id, v_vendor_id, v_quantity, v_status
      FROM orders o
      JOIN products p ON p.product_id = o.product_id
     WHERE o.order_id = p_order_id
       FOR UPDATE OF o, p;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found.', p_order_id;
    END IF;

    IF v_vendor_id <> p_vendor_id THEN
        RAISE EXCEPTION 'Order % does not belong to vendor %.', p_order_id, p_vendor_id;
    END IF;

    IF v_status NOT IN ('PENDING', 'ACCEPTED') THEN
        RAISE EXCEPTION 'Cannot cancel an order with status %.', v_status;
    END IF;

    IF v_status = 'ACCEPTED' THEN
        UPDATE products
           SET quantity = quantity + v_quantity
         WHERE product_id = v_product_id;
    END IF;

    UPDATE orders
       SET status = 'CANCELLED',
           cancellation_reason = btrim(p_reason),
           decided_at = now()
     WHERE order_id = p_order_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_product_price(
    p_vendor_id  INTEGER,
    p_product_id INTEGER,
    p_new_price  NUMERIC
) RETURNS VOID AS $$
DECLARE
    v_owner_id INTEGER;
BEGIN
    IF p_new_price IS NULL OR p_new_price < 0 THEN
        RAISE EXCEPTION 'Price must be non-negative.';
    END IF;

    SELECT vendor_id
      INTO v_owner_id
      FROM products
     WHERE product_id = p_product_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % not found.', p_product_id;
    END IF;

    IF v_owner_id <> p_vendor_id THEN
        RAISE EXCEPTION 'Product % does not belong to vendor %.', p_product_id, p_vendor_id;
    END IF;

    UPDATE products
       SET price = p_new_price
     WHERE product_id = p_product_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION delete_product(
    p_vendor_id  INTEGER,
    p_product_id INTEGER
) RETURNS TEXT AS $$
DECLARE
    v_owner_id    INTEGER;
    v_order_count INTEGER;
BEGIN
    SELECT vendor_id
      INTO v_owner_id
      FROM products
     WHERE product_id = p_product_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % not found.', p_product_id;
    END IF;

    IF v_owner_id <> p_vendor_id THEN
        RAISE EXCEPTION 'Product % does not belong to vendor %.', p_product_id, p_vendor_id;
    END IF;

    SELECT count(*)
      INTO v_order_count
      FROM orders
     WHERE product_id = p_product_id;

    IF v_order_count = 0 THEN
        DELETE FROM products WHERE product_id = p_product_id;
        RETURN 'HARD_DELETED';
    ELSE
        UPDATE products
           SET is_active = FALSE,
               quantity = 0
         WHERE product_id = p_product_id;
        RETURN 'SOFT_DELETED';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- STEP 5: VIEWS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_available_products AS
SELECT p.product_id,
       p.product_name,
       p.price,
       p.quantity AS available_quantity,
       v.vendor_id,
       v.company_name AS supplier_name,
       p.created_at,
       p.updated_at
  FROM products p
  JOIN vendors  v ON v.vendor_id = p.vendor_id
 WHERE p.is_active
   AND p.quantity > 0;

CREATE OR REPLACE VIEW vw_order_details AS
SELECT o.order_id,
       o.status,
       o.quantity,
       o.unit_price,
       (o.quantity * o.unit_price) AS line_total,
       o.cancellation_reason,
       o.ordered_at,
       o.decided_at,
       c.customer_id,
       c.full_name    AS customer_name,
       p.product_id,
       p.product_name,
       p.is_active    AS product_is_active,
       v.vendor_id,
       v.company_name AS supplier_name
  FROM orders    o
  JOIN customers c ON c.customer_id = o.customer_id
  JOIN products  p ON p.product_id  = o.product_id
  JOIN vendors   v ON v.vendor_id   = p.vendor_id;

CREATE OR REPLACE VIEW vw_vendor_product_sales AS
SELECT p.vendor_id,
       p.product_id,
       p.product_name,
       count(o.order_id)                           AS orders_accepted,
       COALESCE(sum(o.quantity), 0)                AS units_sold,
       COALESCE(sum(o.quantity * o.unit_price), 0) AS revenue
  FROM products p
  LEFT JOIN orders o
         ON o.product_id = p.product_id
        AND o.status = 'ACCEPTED'
 GROUP BY p.vendor_id, p.product_id, p.product_name;

-- ----------------------------------------------------------------------------
-- STEP 6: SEED DATA (Demo accounts: password123)
-- ----------------------------------------------------------------------------
TRUNCATE orders, products, customers, vendors RESTART IDENTITY CASCADE;

INSERT INTO vendors (company_name, email, password_hash) VALUES
('ABC Electronics',  'abc@vendor.com',    '$2b$10$m24vYDrZzTlWA5KZGHyRfeO.mtLV6RhuddIjoQJSgOc0aed79mTZG'),
('Sharma Textiles',  'sharma@vendor.com', '$2b$10$m24vYDrZzTlWA5KZGHyRfeO.mtLV6RhuddIjoQJSgOc0aed79mTZG'),
('Verma Packaging',  'verma@vendor.com',  '$2b$10$m24vYDrZzTlWA5KZGHyRfeO.mtLV6RhuddIjoQJSgOc0aed79mTZG');

INSERT INTO customers (full_name, email, password_hash) VALUES
('Rahul Mehta',   'rahul@customer.com',  '$2b$10$m24vYDrZzTlWA5KZGHyRfeO.mtLV6RhuddIjoQJSgOc0aed79mTZG'),
('Priya Nair',    'priya@customer.com',  '$2b$10$m24vYDrZzTlWA5KZGHyRfeO.mtLV6RhuddIjoQJSgOc0aed79mTZG'),
('TechMart Pvt',  'orders@techmart.com', '$2b$10$m24vYDrZzTlWA5KZGHyRfeO.mtLV6RhuddIjoQJSgOc0aed79mTZG');

INSERT INTO products (vendor_id, product_name, price, quantity) VALUES
(1, 'Laptop',            45000.00,  20),
(1, 'Bluetooth Speaker',   899.00, 150),
(1, 'USB-C Cable',         120.00, 500),
(1, 'Wireless Mouse',      649.00,   0),
(2, 'Cotton T-Shirt',      250.00, 300),
(2, 'Denim Jacket',       1899.00,  45),
(3, 'Corrugated Box',       18.50, 900),
(3, 'Bubble Wrap Roll',    340.00,  60);

INSERT INTO orders (customer_id, product_id, quantity, unit_price, status, cancellation_reason, ordered_at, decided_at) VALUES
(1, 1, 2, 45000.00, 'ACCEPTED', NULL, now() - INTERVAL '34 days', now() - INTERVAL '33 days'),
(3, 3, 100,  120.00, 'ACCEPTED', NULL, now() - INTERVAL '28 days', now() - INTERVAL '28 days'),
(2, 5, 40,   250.00, 'ACCEPTED', NULL, now() - INTERVAL '21 days', now() - INTERVAL '20 days'),
(1, 2, 5,    899.00, 'ACCEPTED', NULL, now() - INTERVAL '14 days', now() - INTERVAL '14 days'),
(3, 7, 250,   18.50, 'ACCEPTED', NULL, now() - INTERVAL '9 days',  now() - INTERVAL '9 days'),
(2, 6, 3,   1899.00, 'ACCEPTED', NULL, now() - INTERVAL '5 days',  now() - INTERVAL '4 days'),
(2, 1, 10, 45000.00, 'REJECTED', NULL, now() - INTERVAL '17 days', now() - INTERVAL '16 days'),
(1, 6, 2,   1899.00, 'CANCELLED', 'Product damaged during quality inspection.', now() - INTERVAL '11 days', now() - INTERVAL '10 days'),
(3, 8, 5,    340.00, 'CANCELLED', 'Supplier stock failed quality check; replacement batch delayed.', now() - INTERVAL '6 days', now() - INTERVAL '6 days'),
(2, 2, 4,    899.00, 'CANCELLED', 'Unit failed final inspection; awaiting a replacement batch.', now() - INTERVAL '8 days', now() - INTERVAL '7 days'),
(2, 2, 8,    899.00, 'PENDING',  NULL, now() - INTERVAL '2 days',  NULL),
(1, 3, 25,   120.00, 'PENDING',  NULL, now() - INTERVAL '1 day',   NULL),
(3, 5, 60,   250.00, 'PENDING',  NULL, now() - INTERVAL '3 hours', NULL);

-- Reconcile inventory with the accepted orders
UPDATE products p
   SET quantity = p.quantity - sold.units
  FROM (SELECT product_id, sum(quantity) AS units
          FROM orders
         WHERE status = 'ACCEPTED'
         GROUP BY product_id) AS sold
 WHERE p.product_id = sold.product_id;

-- Verify setup
SELECT 'Table counts:' AS check_item, NULL AS count
UNION ALL SELECT 'vendors', count(*) FROM vendors
UNION ALL SELECT 'customers', count(*) FROM customers
UNION ALL SELECT 'products',  count(*) FROM products
UNION ALL SELECT 'orders',    count(*) FROM orders;
