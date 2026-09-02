-- =========================================================
-- 06. SEED DATA  (PostgreSQL / Supabase)  -- optional
-- =========================================================
-- Demo data for a presentation: three vendors, three customers, a
-- catalogue, and orders spread across all four statuses and several
-- weeks so the sales charts have something real to draw.
--
-- Every demo account logs in with the password:   password123
-- The stored value is a real bcrypt hash of that password -- the
-- application never sees or stores a plaintext password.
--
--   psql "$DATABASE_URL" -f database/seed.sql
-- =========================================================

-- Start from empty. TRUNCATE ... CASCADE also clears orders, and
-- RESTART IDENTITY resets the SERIAL counters so the ids below are
-- predictable.
TRUNCATE orders, products, customers, vendors RESTART IDENTITY CASCADE;


-- ---------------------------------------------------------
-- Vendors  (vendor_id 1..3)
-- ---------------------------------------------------------
INSERT INTO vendors (company_name, email, password_hash) VALUES
('ABC Electronics',  'abc@vendor.com',    '$2b$10$m24vYDrZzTlWA5KZGHyRfeO.mtLV6RhuddIjoQJSgOc0aed79mTZG'),
('Sharma Textiles',  'sharma@vendor.com', '$2b$10$m24vYDrZzTlWA5KZGHyRfeO.mtLV6RhuddIjoQJSgOc0aed79mTZG'),
('Verma Packaging',  'verma@vendor.com',  '$2b$10$m24vYDrZzTlWA5KZGHyRfeO.mtLV6RhuddIjoQJSgOc0aed79mTZG');


-- ---------------------------------------------------------
-- Customers  (customer_id 1..3)
-- ---------------------------------------------------------
INSERT INTO customers (full_name, email, password_hash) VALUES
('Rahul Mehta',   'rahul@customer.com',  '$2b$10$m24vYDrZzTlWA5KZGHyRfeO.mtLV6RhuddIjoQJSgOc0aed79mTZG'),
('Priya Nair',    'priya@customer.com',  '$2b$10$m24vYDrZzTlWA5KZGHyRfeO.mtLV6RhuddIjoQJSgOc0aed79mTZG'),
('TechMart Pvt',  'orders@techmart.com', '$2b$10$m24vYDrZzTlWA5KZGHyRfeO.mtLV6RhuddIjoQJSgOc0aed79mTZG');


-- ---------------------------------------------------------
-- Products  (product_id 1..8)
-- ---------------------------------------------------------
-- quantity here is the STARTING stock, before any order was accepted.
-- The reconciliation step at the bottom of this file deducts the
-- accepted units, so the seeded data obeys the same inventory rule the
-- application enforces.
INSERT INTO products (vendor_id, product_name, price, quantity) VALUES
(1, 'Laptop',            45000.00,  20),
(1, 'Bluetooth Speaker',   899.00, 150),
(1, 'USB-C Cable',         120.00, 500),
(1, 'Wireless Mouse',      649.00,   0),   -- out of stock: hidden from the catalogue
(2, 'Cotton T-Shirt',      250.00, 300),
(2, 'Denim Jacket',       1899.00,  45),
(3, 'Corrugated Box',       18.50, 900),
(3, 'Bubble Wrap Roll',    340.00,  60);


-- ---------------------------------------------------------
-- Orders  (order_id 1..13)
-- ---------------------------------------------------------
-- Inserted directly with backdated timestamps so the "orders over time"
-- chart spans several weeks. The CHECK constraints still apply: a
-- non-PENDING order must carry decided_at, and only a CANCELLED order
-- may carry a cancellation_reason.
--
-- unit_price is the price at order time, which is why it is stored on
-- the order rather than read from products.
INSERT INTO orders (customer_id, product_id, quantity, unit_price, status, cancellation_reason, ordered_at, decided_at) VALUES
-- accepted (these are the only rows that count as revenue)
(1, 1, 2, 45000.00, 'ACCEPTED', NULL, now() - INTERVAL '34 days', now() - INTERVAL '33 days'),
(3, 3, 100,  120.00, 'ACCEPTED', NULL, now() - INTERVAL '28 days', now() - INTERVAL '28 days'),
(2, 5, 40,   250.00, 'ACCEPTED', NULL, now() - INTERVAL '21 days', now() - INTERVAL '20 days'),
(1, 2, 5,    899.00, 'ACCEPTED', NULL, now() - INTERVAL '14 days', now() - INTERVAL '14 days'),
(3, 7, 250,   18.50, 'ACCEPTED', NULL, now() - INTERVAL '9 days',  now() - INTERVAL '9 days'),
(2, 6, 3,   1899.00, 'ACCEPTED', NULL, now() - INTERVAL '5 days',  now() - INTERVAL '4 days'),

-- rejected: inventory was never touched
(2, 1, 10, 45000.00, 'REJECTED', NULL, now() - INTERVAL '17 days', now() - INTERVAL '16 days'),

-- cancelled by the vendor, with the stored reason both dashboards show.
-- One is included for each vendor, so whichever demo account is used the
-- cancellation reason is visible on that vendor's own dashboard too.
(1, 6, 2,   1899.00, 'CANCELLED', 'Product damaged during quality inspection.', now() - INTERVAL '11 days', now() - INTERVAL '10 days'),
(3, 8, 5,    340.00, 'CANCELLED', 'Supplier stock failed quality check; replacement batch delayed.', now() - INTERVAL '6 days', now() - INTERVAL '6 days'),
(2, 2, 4,    899.00, 'CANCELLED', 'Unit failed final inspection; awaiting a replacement batch.', now() - INTERVAL '8 days', now() - INTERVAL '7 days'),

-- still awaiting a vendor decision: must NOT have moved any stock
(2, 2, 8,    899.00, 'PENDING',  NULL, now() - INTERVAL '2 days',  NULL),
(1, 3, 25,   120.00, 'PENDING',  NULL, now() - INTERVAL '1 day',   NULL),
(3, 5, 60,   250.00, 'PENDING',  NULL, now() - INTERVAL '3 hours', NULL);


-- ---------------------------------------------------------
-- Reconcile inventory with the accepted orders
-- ---------------------------------------------------------
-- Business rules 5 and 6 in one statement: subtract the units of every
-- ACCEPTED order, and nothing for PENDING, REJECTED or CANCELLED ones.
-- (A cancelled order that had been accepted would have had its units
-- returned, so it nets to zero either way.)
UPDATE products p
   SET quantity = p.quantity - sold.units
  FROM (SELECT product_id, sum(quantity) AS units
          FROM orders
         WHERE status = 'ACCEPTED'
         GROUP BY product_id) AS sold
 WHERE p.product_id = sold.product_id;


-- ---------------------------------------------------------
-- Sanity check the seed
-- ---------------------------------------------------------
SELECT 'vendors' AS table_name, count(*) FROM vendors
UNION ALL SELECT 'customers', count(*) FROM customers
UNION ALL SELECT 'products',  count(*) FROM products
UNION ALL SELECT 'orders',    count(*) FROM orders;

SELECT p.product_name, p.quantity AS stock_on_hand
  FROM products p ORDER BY p.product_id;
