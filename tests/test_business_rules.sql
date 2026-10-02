-- Business-rule test harness. Each test prints PASS or FAIL.
\set QUIET on
\pset tuples_only on
\pset format unaligned

CREATE OR REPLACE FUNCTION t_expect_fail(p_sql TEXT, p_label TEXT, p_expect TEXT DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE m TEXT;
BEGIN
    EXECUTE p_sql;
    RETURN 'FAIL  ' || p_label || '  (expected an error, none raised)';
EXCEPTION WHEN others THEN
    m := SQLERRM;
    IF p_expect IS NOT NULL AND position(p_expect in m) = 0 THEN
        RETURN 'FAIL  ' || p_label || '  (wrong error: ' || m || ')';
    END IF;
    RETURN 'PASS  ' || p_label || '  -> ' || m;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION t_assert(p_cond BOOLEAN, p_label TEXT, p_detail TEXT DEFAULT '')
RETURNS TEXT AS $$
BEGIN
    IF p_cond THEN RETURN 'PASS  ' || p_label || '  ' || p_detail;
    ELSE RETURN 'FAIL  ' || p_label || '  ' || p_detail; END IF;
END;
$$ LANGUAGE plpgsql;

\echo '===== CONSTRAINTS ====='

SELECT t_expect_fail(
  $q$INSERT INTO orders (customer_id, product_id, quantity, unit_price, status, decided_at)
     VALUES (1, 1, 1, 100, 'CANCELLED', now())$q$,
  'CANCELLED order without a reason is rejected', 'chk_orders_cancellation_reason');

SELECT t_expect_fail(
  $q$INSERT INTO orders (customer_id, product_id, quantity, unit_price, status, cancellation_reason)
     VALUES (1, 1, 1, 100, 'PENDING', 'no reason should be allowed here')$q$,
  'reason on a non-cancelled order is rejected', 'chk_orders_cancellation_reason');

SELECT t_expect_fail(
  $q$INSERT INTO products (vendor_id, product_name, price, quantity) VALUES (1, 'Bad Price', -5, 10)$q$,
  'negative price is rejected', 'chk_products_price_non_negative');

SELECT t_expect_fail(
  $q$INSERT INTO products (vendor_id, product_name, price, quantity) VALUES (1, 'Bad Qty', 10, -1)$q$,
  'negative quantity is rejected', 'chk_products_quantity_non_negative');

SELECT t_expect_fail(
  $q$INSERT INTO orders (customer_id, product_id, quantity, unit_price) VALUES (1, 1, 0, 100)$q$,
  'zero-quantity order is rejected', 'chk_orders_quantity_positive');

SELECT t_expect_fail(
  $q$INSERT INTO vendors (company_name, email, password_hash) VALUES ('Dup', 'abc@vendor.com', 'x')$q$,
  'duplicate vendor email is rejected', 'uq_vendors_email');

SELECT t_expect_fail(
  $q$INSERT INTO customers (full_name, email, password_hash) VALUES ('Clash', 'abc@vendor.com', 'x')$q$,
  'email already used by a vendor is rejected for a customer', 'already registered as a vendor');

SELECT t_expect_fail(
  $q$INSERT INTO products (vendor_id, product_name, price, quantity) VALUES (999, 'Orphan', 10, 1)$q$,
  'product for a non-existent vendor is rejected', 'fk_products_vendor');

SELECT t_expect_fail(
  $q$DELETE FROM products WHERE product_id = 1$q$,
  'deleting a product referenced by an order is blocked', 'fk_orders_product');

SELECT t_expect_fail(
  $q$INSERT INTO products (vendor_id, product_name, price, quantity) VALUES (1, '  laptop ', 10, 1)$q$,
  'same product name twice for one vendor is rejected', 'uq_products_vendor_name_active');

\echo ''
\echo '===== RULE: placing an order does NOT move stock (req 4) ====='

-- Laptop (product 1) has 18 on hand.
SELECT t_assert(quantity = 18, 'baseline Laptop stock is 18', 'stock=' || quantity) FROM products WHERE product_id = 1;

SELECT t_expect_fail(
  $q$SELECT place_order(1, 1, 19)$q$,
  'ordering 19 of 18 available is refused', 'Only 18 units are currently available.');

SELECT t_assert(quantity = 18, 'refused order left stock untouched', 'stock=' || quantity) FROM products WHERE product_id = 1;

-- Valid order of 3.
SELECT set_config('t.oid', place_order(1, 1, 3)::text, false);

SELECT t_assert(quantity = 18, 'stock still 18 after a PENDING order was created', 'stock=' || quantity) FROM products WHERE product_id = 1;
SELECT t_assert(status = 'PENDING' AND quantity = 3 AND unit_price = 45000.00,
                'new order is PENDING with a price snapshot',
                'status=' || status || ' qty=' || quantity || ' price=' || unit_price)
  FROM orders WHERE order_id = current_setting('t.oid')::int;

\echo ''
\echo '===== RULE: only ACCEPT moves stock (req 11) ====='

SELECT t_expect_fail(
  $q$SELECT accept_order(current_setting('t.oid')::int, 2)$q$,
  'vendor 2 cannot accept vendor 1 order', 'belongs to another vendor');

SELECT t_assert(quantity = 18, 'denied accept left stock untouched', 'stock=' || quantity) FROM products WHERE product_id = 1;

SELECT accept_order(current_setting('t.oid')::int, 1);
SELECT t_assert(quantity = 15, 'accepting 3 units dropped stock 18 -> 15', 'stock=' || quantity) FROM products WHERE product_id = 1;
SELECT t_assert(status = 'ACCEPTED' AND decided_at IS NOT NULL, 'order is ACCEPTED with decided_at set', 'status=' || status)
  FROM orders WHERE order_id = current_setting('t.oid')::int;

SELECT t_expect_fail(
  $q$SELECT accept_order(current_setting('t.oid')::int, 1)$q$,
  'accepting an already-accepted order is refused', 'Only a pending order can be accepted');

\echo ''
\echo '===== RULE: REJECT never moves stock (req 12) ====='

SELECT set_config('t.rid', place_order(2, 1, 4)::text, false);
SELECT t_assert(quantity = 15, 'stock unchanged while the new order is pending', 'stock=' || quantity) FROM products WHERE product_id = 1;
SELECT reject_order(current_setting('t.rid')::int, 1);
SELECT t_assert(quantity = 15, 'stock still 15 after REJECT', 'stock=' || quantity) FROM products WHERE product_id = 1;
SELECT t_assert(status = 'REJECTED' AND cancellation_reason IS NULL, 'order is REJECTED, no reason stored', 'status=' || status)
  FROM orders WHERE order_id = current_setting('t.rid')::int;

\echo ''
\echo '===== RULE: CANCEL needs a stored reason (req 13) ====='

SELECT set_config('t.cid', place_order(2, 1, 2)::text, false);

SELECT t_expect_fail(
  $q$SELECT cancel_order(current_setting('t.cid')::int, 1, '   ')$q$,
  'blank cancellation reason is refused', 'A cancellation reason is required.');

SELECT t_expect_fail(
  $q$SELECT cancel_order(current_setting('t.cid')::int, 1, NULL)$q$,
  'NULL cancellation reason is refused', 'A cancellation reason is required.');

SELECT cancel_order(current_setting('t.cid')::int, 1, 'Product damaged during quality inspection.');
SELECT t_assert(status = 'CANCELLED' AND cancellation_reason = 'Product damaged during quality inspection.',
                'reason is persisted on the cancelled order', 'reason=' || cancellation_reason)
  FROM orders WHERE order_id = current_setting('t.cid')::int;
SELECT t_assert(quantity = 15, 'cancelling a PENDING order left stock alone', 'stock=' || quantity) FROM products WHERE product_id = 1;

-- Cancelling an order that was already ACCEPTED must give the units back.
SELECT set_config('t.aid', place_order(2, 1, 5)::text, false);
SELECT accept_order(current_setting('t.aid')::int, 1);
SELECT t_assert(quantity = 10, 'accepted 5 more: 15 -> 10', 'stock=' || quantity) FROM products WHERE product_id = 1;
SELECT cancel_order(current_setting('t.aid')::int, 1, 'Courier lost the consignment.');
SELECT t_assert(quantity = 15, 'cancelling an ACCEPTED order returned the 5 units', 'stock=' || quantity) FROM products WHERE product_id = 1;

\echo ''
\echo '===== RULE: vendor isolation (req 23, scenario 8) ====='

SELECT t_expect_fail(
  $q$SELECT update_product_price(1, 2, 999)$q$,
  'vendor 2 cannot reprice vendor 1 product', 'Product not found in your catalogue.');
SELECT t_assert(price = 45000.00, 'price unchanged after the denied update', 'price=' || price) FROM products WHERE product_id = 1;

SELECT update_product_price(1, 1, 43000);
SELECT t_assert(price = 43000.00, 'owner can reprice their own product', 'price=' || price) FROM products WHERE product_id = 1;

SELECT t_expect_fail(
  $q$SELECT delete_product(1, 2)$q$,
  'vendor 2 cannot delete vendor 1 product', 'only delete your own');

\echo ''
\echo '===== RULE: delete strategy preserves history (req 3.4) ====='

SELECT t_assert(delete_product(1, 1) = 'archived', 'an ordered product is archived, not destroyed');
SELECT t_assert(count(*) > 0, 'its order history survives the archive', 'orders=' || count(*)) FROM orders WHERE product_id = 1;
SELECT t_assert(NOT is_active, 'product is flagged inactive') FROM products WHERE product_id = 1;
SELECT t_assert(count(*) = 0, 'archived product disappears from the catalogue view') FROM vw_available_products WHERE product_id = 1;

-- A never-ordered product is removed for real.
INSERT INTO products (vendor_id, product_name, price, quantity) VALUES (1, 'Never Ordered', 50, 5);
SELECT t_assert(delete_product(product_id, 1) = 'deleted', 'a never-ordered product is hard-deleted')
  FROM products WHERE product_name = 'Never Ordered';
SELECT t_assert(count(*) = 0, 'it is gone from the table') FROM products WHERE product_name = 'Never Ordered';

\echo ''
\echo '===== RULE: catalogue hides what cannot be ordered (req 8) ====='

SELECT t_assert(count(*) = 0, 'zero-quantity product is not in the catalogue view')
  FROM vw_available_products WHERE product_id = 4;
SELECT t_assert(quantity = 0, 'and it really is at zero stock') FROM products WHERE product_id = 4;
SELECT t_expect_fail($q$SELECT place_order(1, 4, 1)$q$, 'ordering an out-of-stock product is refused', 'out of stock');
SELECT t_expect_fail($q$SELECT place_order(1, 1, 1)$q$, 'ordering an archived product is refused', 'no longer available');

\echo ''
\echo '===== VIEWS / analytics use only ACCEPTED orders (req 15) ====='

SELECT t_assert(
  (SELECT count(*) FROM vw_vendor_product_sales s
     JOIN orders o ON o.product_id = s.product_id AND o.status <> 'ACCEPTED'
    WHERE s.revenue > 0 AND NOT EXISTS (SELECT 1 FROM orders o2 WHERE o2.product_id = s.product_id AND o2.status='ACCEPTED')) = 0,
  'no revenue is attributed to a product with no accepted orders');

SELECT 'INFO  sales rows: ' || string_agg(product_name || '=' || revenue, ', ' ORDER BY revenue DESC)
  FROM vw_vendor_product_sales WHERE vendor_id = 1;

DROP FUNCTION t_expect_fail(TEXT, TEXT, TEXT);
DROP FUNCTION t_assert(BOOLEAN, TEXT, TEXT);
