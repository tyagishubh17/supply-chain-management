-- =========================================================
-- 07. REPRESENTATIVE QUERIES  (PostgreSQL / Supabase)
-- =========================================================
-- Reference queries covering the SQL operations this project
-- demonstrates. Every query below runs against the real schema and
-- most of them are the actual statements the API issues.
--
-- Run interactively:  psql "$DATABASE_URL" -f database/queries.sql
-- =========================================================


-- ---------------------------------------------------------
-- 1. DDL : CREATE TABLE
-- ---------------------------------------------------------
-- See tables.sql. The core ownership relationship is:
--
--   CREATE TABLE products (
--       product_id   SERIAL PRIMARY KEY,
--       vendor_id    INTEGER NOT NULL REFERENCES vendors(vendor_id),
--       ...
--   );


-- ---------------------------------------------------------
-- 2. DDL : ALTER TABLE
-- ---------------------------------------------------------
-- Every foreign key and CHECK is attached with ALTER TABLE in
-- constraints.sql. Example of adding a new rule to a live table:

-- ALTER TABLE products
--     ADD CONSTRAINT chk_products_price_ceiling CHECK (price <= 10000000);

-- ALTER TABLE products DROP CONSTRAINT chk_products_price_ceiling;


-- ---------------------------------------------------------
-- 3. INSERT
-- ---------------------------------------------------------
-- Vendor registration (the API supplies a bcrypt hash, never a plaintext).
INSERT INTO vendors (company_name, email, password_hash)
VALUES ('Demo Traders', 'demo.vendor@example.com', '$2b$12$notarealhashjustfordemo0000000000000000000000000000')
RETURNING vendor_id, company_name, email;

-- A vendor adds a product to their own catalogue.
INSERT INTO products (vendor_id, product_name, price, quantity)
VALUES ((SELECT vendor_id FROM vendors WHERE email = 'demo.vendor@example.com'),
        'Demo Widget', 199.00, 25)
RETURNING product_id, product_name, price, quantity;


-- ---------------------------------------------------------
-- 4. SELECT + WHERE : customer product search (requirement 5.2)
-- ---------------------------------------------------------
-- Case-insensitive substring match on the product name, over the
-- orderable-products view only.
SELECT product_id, product_name, price, available_quantity, supplier_name
  FROM vw_available_products
 WHERE product_name ILIKE '%widget%'
 ORDER BY product_name;


-- ---------------------------------------------------------
-- 5. JOIN : supplier resolved through the foreign key (requirement 6)
-- ---------------------------------------------------------
-- The vendor name is never duplicated onto the product row; it is
-- always reached with a join.
SELECT p.product_id,
       p.product_name,
       p.price,
       p.quantity      AS available_quantity,
       v.company_name  AS supplier_name
  FROM products p
  INNER JOIN vendors v ON v.vendor_id = p.vendor_id
 WHERE p.is_active
 ORDER BY v.company_name, p.product_name;


-- ---------------------------------------------------------
-- 6. Multi-table JOIN : full order detail
-- ---------------------------------------------------------
-- orders -> customers, orders -> products -> vendors.
SELECT o.order_id,
       c.full_name    AS customer,
       p.product_name AS product,
       v.company_name AS supplier,
       o.quantity,
       o.unit_price,
       (o.quantity * o.unit_price) AS line_total,
       o.status,
       o.cancellation_reason,
       o.ordered_at::date AS order_date,
       o.ordered_at::time AS order_time
  FROM orders    o
  JOIN customers c ON c.customer_id = o.customer_id
  JOIN products  p ON p.product_id  = o.product_id
  JOIN vendors   v ON v.vendor_id   = p.vendor_id
 ORDER BY o.ordered_at DESC;


-- ---------------------------------------------------------
-- 7. LEFT JOIN : every vendor product, including the unsold ones
-- ---------------------------------------------------------
-- An INNER JOIN would silently drop products that have never sold, which
-- would distort the sales chart. LEFT JOIN keeps them at zero.
SELECT p.product_name,
       COALESCE(sum(o.quantity), 0) AS units_sold
  FROM products p
  LEFT JOIN orders o ON o.product_id = p.product_id
                    AND o.status = 'ACCEPTED'
 GROUP BY p.product_id, p.product_name
 ORDER BY units_sold DESC;


-- ---------------------------------------------------------
-- 8. GROUP BY + aggregate : revenue per product (requirement 15)
-- ---------------------------------------------------------
-- Only ACCEPTED orders are revenue.
SELECT p.product_name,
       count(o.order_id)                AS orders_accepted,
       sum(o.quantity)                  AS units_sold,
       sum(o.quantity * o.unit_price)   AS revenue
  FROM orders   o
  JOIN products p ON p.product_id = o.product_id
 WHERE o.status = 'ACCEPTED'
 GROUP BY p.product_id, p.product_name
 ORDER BY revenue DESC;


-- ---------------------------------------------------------
-- 9. GROUP BY on a date : orders over time (requirement 15)
-- ---------------------------------------------------------
SELECT o.ordered_at::date AS order_day,
       count(*)           AS order_count,
       sum(CASE WHEN o.status = 'ACCEPTED' THEN o.quantity * o.unit_price ELSE 0 END) AS revenue
  FROM orders o
 GROUP BY order_day
 ORDER BY order_day;


-- ---------------------------------------------------------
-- 10. GROUP BY ... HAVING : the vendors worth paying attention to
-- ---------------------------------------------------------
-- HAVING filters the aggregate; WHERE cannot, because count() is not
-- known until after grouping.
SELECT v.company_name,
       count(o.order_id) AS accepted_orders,
       sum(o.quantity * o.unit_price) AS revenue
  FROM vendors  v
  JOIN products p ON p.vendor_id  = v.vendor_id
  JOIN orders   o ON o.product_id = p.product_id
 WHERE o.status = 'ACCEPTED'
 GROUP BY v.vendor_id, v.company_name
HAVING count(o.order_id) >= 2
 ORDER BY revenue DESC;


-- ---------------------------------------------------------
-- 11. Scalar subquery : products priced above the overall average
-- ---------------------------------------------------------
SELECT p.product_name, p.price
  FROM products p
 WHERE p.is_active
   AND p.price > (SELECT avg(price) FROM products WHERE is_active)
 ORDER BY p.price DESC;


-- ---------------------------------------------------------
-- 12. Correlated subquery : each vendor's most expensive product
-- ---------------------------------------------------------
SELECT v.company_name, p.product_name, p.price
  FROM vendors  v
  JOIN products p ON p.vendor_id = v.vendor_id
 WHERE p.is_active
   AND p.price = (SELECT max(p2.price)
                    FROM products p2
                   WHERE p2.vendor_id = v.vendor_id
                     AND p2.is_active)
 ORDER BY v.company_name;


-- ---------------------------------------------------------
-- 13. EXISTS subquery : products that are safe to hard-delete
-- ---------------------------------------------------------
-- The inverse of this test is what delete_product() uses to decide
-- between a real DELETE and a soft delete.
SELECT p.product_id, p.product_name
  FROM products p
 WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.product_id = p.product_id);


-- ---------------------------------------------------------
-- 14. IN subquery : customers who have ever had an order cancelled
-- ---------------------------------------------------------
SELECT c.customer_id, c.full_name, c.email
  FROM customers c
 WHERE c.customer_id IN (SELECT o.customer_id
                           FROM orders o
                          WHERE o.status = 'CANCELLED');


-- ---------------------------------------------------------
-- 15. UPDATE : vendor changes their own price (requirement 3.3)
-- ---------------------------------------------------------
-- The vendor_id predicate is the authorisation check: with the wrong
-- vendor the statement updates 0 rows instead of another vendor's row.
UPDATE products
   SET price = 249.00
 WHERE product_id = (SELECT product_id FROM products WHERE product_name = 'Demo Widget')
   AND vendor_id  = (SELECT vendor_id  FROM vendors  WHERE email = 'demo.vendor@example.com')
RETURNING product_id, product_name, price, updated_at;


-- ---------------------------------------------------------
-- 16. UPDATE : soft delete (requirement 3.4)
-- ---------------------------------------------------------
UPDATE products
   SET is_active = FALSE
 WHERE product_id = (SELECT product_id FROM products WHERE product_name = 'Demo Widget')
RETURNING product_id, is_active;

-- ...and restore it, so this script leaves nothing half-finished.
UPDATE products
   SET is_active = TRUE
 WHERE product_name = 'Demo Widget';


-- ---------------------------------------------------------
-- 17. Calling the order-workflow functions (requirements 7, 11-13)
-- ---------------------------------------------------------
-- Uncomment against real ids to walk the workflow by hand:

-- SELECT place_order(1, 1, 3);              -- customer 1 orders 3 units of product 1
-- SELECT accept_order(1, 1);                -- vendor 1 accepts order 1  -> stock drops
-- SELECT reject_order(2, 1);                -- vendor 1 rejects order 2  -> stock unchanged
-- SELECT cancel_order(3, 1, 'Product damaged during quality inspection.');


-- ---------------------------------------------------------
-- 18. Proof of the inventory rule (requirements 4, 12)
-- ---------------------------------------------------------
-- Stock on hand, next to units locked in by acceptance and units still
-- awaiting a decision. Pending units must never have moved stock.
SELECT p.product_name,
       p.quantity AS stock_on_hand,
       COALESCE(sum(CASE WHEN o.status = 'PENDING'  THEN o.quantity END), 0) AS units_pending,
       COALESCE(sum(CASE WHEN o.status = 'ACCEPTED' THEN o.quantity END), 0) AS units_accepted,
       COALESCE(sum(CASE WHEN o.status = 'REJECTED' THEN o.quantity END), 0) AS units_rejected
  FROM products p
  LEFT JOIN orders o ON o.product_id = p.product_id
 GROUP BY p.product_id, p.product_name, p.quantity
 ORDER BY p.product_name;


-- ---------------------------------------------------------
-- 19. Reading the views
-- ---------------------------------------------------------
SELECT * FROM vw_available_products    ORDER BY supplier_name, product_name;
SELECT * FROM vw_order_details         ORDER BY ordered_at DESC;
SELECT * FROM vw_vendor_product_sales  ORDER BY revenue DESC;


-- ---------------------------------------------------------
-- 20. DELETE : clean up the demo rows created by this script
-- ---------------------------------------------------------
-- Ordered child-first. products would in any case be blocked by the
-- ON DELETE RESTRICT on orders.product_id if it had been ordered.
DELETE FROM products
 WHERE product_name = 'Demo Widget'
   AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.product_id = products.product_id);

DELETE FROM vendors
 WHERE email = 'demo.vendor@example.com';


-- ---------------------------------------------------------
-- 21. Inspecting the constraints themselves
-- ---------------------------------------------------------
-- Useful in a viva: shows every PK, FK, UNIQUE and CHECK actually in force.
SELECT tc.table_name,
       tc.constraint_name,
       tc.constraint_type,
       cc.check_clause
  FROM information_schema.table_constraints tc
  LEFT JOIN information_schema.check_constraints cc
         ON cc.constraint_name = tc.constraint_name
 WHERE tc.table_schema = 'public'
   AND tc.table_name IN ('vendors', 'customers', 'products', 'orders')
 ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;
