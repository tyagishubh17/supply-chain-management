-- =========================================================
-- 04. FUNCTIONS & TRIGGERS  (PostgreSQL / Supabase)
-- =========================================================
-- All order/inventory state changes go through these functions.
-- A PL/pgSQL function runs inside a single transaction, so each one
-- either completes fully or leaves the database untouched -- the
-- inventory can never be decremented without the order also moving
-- to ACCEPTED, and vice versa.
--
-- Every function a vendor can invoke takes p_vendor_id and checks
-- ownership itself, so authorisation is enforced in the database and
-- not only in the API layer.
--
-- Lock ordering is always  orders -> products  to avoid deadlocks.
-- =========================================================

-- ---------------------------------------------------------
-- TRIGGER: keep products.updated_at accurate
-- ---------------------------------------------------------
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


-- ---------------------------------------------------------
-- place_order : customer places an order
-- ---------------------------------------------------------
-- Business rules 4 and 5:
--   * the requested quantity must not exceed the available quantity
--   * the available quantity is NOT touched here -- placing an order
--     only records intent. Stock moves on acceptance.
-- SELECT ... FOR UPDATE locks the product row so two customers cannot
-- both pass the availability check against the same last units.
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

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found.';
    END IF;

    IF NOT v_active THEN
        RAISE EXCEPTION 'This product is no longer available.';
    END IF;

    IF v_available = 0 THEN
        RAISE EXCEPTION 'This product is out of stock.';
    END IF;

    IF p_quantity > v_available THEN
        RAISE EXCEPTION 'Only % units are currently available.', v_available;
    END IF;

    INSERT INTO orders (customer_id, product_id, quantity, unit_price, status)
    VALUES (p_customer_id, p_product_id, p_quantity, v_price, 'PENDING')
    RETURNING order_id INTO v_order_id;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql;


-- ---------------------------------------------------------
-- accept_order : vendor accepts -- the only place stock decreases
-- ---------------------------------------------------------
-- Business rule 5. Availability is re-checked at acceptance time,
-- because the vendor may have accepted other orders in the meantime.
CREATE OR REPLACE FUNCTION accept_order(
    p_order_id  INTEGER,
    p_vendor_id INTEGER
) RETURNS VOID AS $$
DECLARE
    v_status     order_status;
    v_product_id INTEGER;
    v_ordered    INTEGER;
    v_owner_id   INTEGER;
    v_available  INTEGER;
BEGIN
    SELECT o.status, o.product_id, o.quantity
      INTO v_status, v_product_id, v_ordered
      FROM orders o
     WHERE o.order_id = p_order_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found.';
    END IF;

    SELECT vendor_id, quantity
      INTO v_owner_id, v_available
      FROM products
     WHERE product_id = v_product_id
     FOR UPDATE;

    IF v_owner_id <> p_vendor_id THEN
        RAISE EXCEPTION 'This order belongs to another vendor.';
    END IF;

    IF v_status <> 'PENDING' THEN
        RAISE EXCEPTION 'Only a pending order can be accepted (this one is %).', v_status;
    END IF;

    IF v_available < v_ordered THEN
        RAISE EXCEPTION 'Not enough stock to accept this order: % ordered, % available.',
                        v_ordered, v_available;
    END IF;

    UPDATE products
       SET quantity = quantity - v_ordered
     WHERE product_id = v_product_id;

    UPDATE orders
       SET status = 'ACCEPTED', decided_at = now()
     WHERE order_id = p_order_id;
END;
$$ LANGUAGE plpgsql;


-- ---------------------------------------------------------
-- reject_order : vendor rejects -- stock is NOT touched
-- ---------------------------------------------------------
-- Business rule 6.
CREATE OR REPLACE FUNCTION reject_order(
    p_order_id  INTEGER,
    p_vendor_id INTEGER
) RETURNS VOID AS $$
DECLARE
    v_status   order_status;
    v_owner_id INTEGER;
BEGIN
    SELECT o.status, p.vendor_id
      INTO v_status, v_owner_id
      FROM orders o
      JOIN products p ON p.product_id = o.product_id
     WHERE o.order_id = p_order_id
     FOR UPDATE OF o;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found.';
    END IF;

    IF v_owner_id <> p_vendor_id THEN
        RAISE EXCEPTION 'This order belongs to another vendor.';
    END IF;

    IF v_status <> 'PENDING' THEN
        RAISE EXCEPTION 'Only a pending order can be rejected (this one is %).', v_status;
    END IF;

    UPDATE orders
       SET status = 'REJECTED', decided_at = now()
     WHERE order_id = p_order_id;
END;
$$ LANGUAGE plpgsql;


-- ---------------------------------------------------------
-- cancel_order : vendor cancels, with a mandatory stored reason
-- ---------------------------------------------------------
-- Business rules 7 and 8. A PENDING or an already ACCEPTED order can be
-- cancelled. Cancelling an ACCEPTED order returns its units to stock,
-- because those units were deducted when it was accepted.
CREATE OR REPLACE FUNCTION cancel_order(
    p_order_id  INTEGER,
    p_vendor_id INTEGER,
    p_reason    TEXT
) RETURNS VOID AS $$
DECLARE
    v_status     order_status;
    v_product_id INTEGER;
    v_ordered    INTEGER;
    v_owner_id   INTEGER;
BEGIN
    IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
        RAISE EXCEPTION 'A cancellation reason is required.';
    END IF;

    SELECT o.status, o.product_id, o.quantity
      INTO v_status, v_product_id, v_ordered
      FROM orders o
     WHERE o.order_id = p_order_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found.';
    END IF;

    SELECT vendor_id INTO v_owner_id
      FROM products
     WHERE product_id = v_product_id
     FOR UPDATE;

    IF v_owner_id <> p_vendor_id THEN
        RAISE EXCEPTION 'This order belongs to another vendor.';
    END IF;

    IF v_status NOT IN ('PENDING', 'ACCEPTED') THEN
        RAISE EXCEPTION 'A % order cannot be cancelled.', v_status;
    END IF;

    -- Return the units that acceptance had already deducted.
    IF v_status = 'ACCEPTED' THEN
        UPDATE products
           SET quantity = quantity + v_ordered
         WHERE product_id = v_product_id;
    END IF;

    UPDATE orders
       SET status = 'CANCELLED',
           cancellation_reason = btrim(p_reason),
           decided_at = now()
     WHERE order_id = p_order_id;
END;
$$ LANGUAGE plpgsql;


-- ---------------------------------------------------------
-- update_product_price : vendor edits their own product price
-- ---------------------------------------------------------
-- Business rule 2. The ownership test lives in the WHERE clause, so a
-- vendor touching another vendor's product matches zero rows.
CREATE OR REPLACE FUNCTION update_product_price(
    p_product_id INTEGER,
    p_vendor_id  INTEGER,
    p_price      NUMERIC
) RETURNS VOID AS $$
DECLARE
    v_rows INTEGER;
BEGIN
    IF p_price IS NULL OR p_price < 0 THEN
        RAISE EXCEPTION 'Price cannot be negative.';
    END IF;

    UPDATE products
       SET price = p_price
     WHERE product_id = p_product_id
       AND vendor_id  = p_vendor_id
       AND is_active;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
        RAISE EXCEPTION 'Product not found in your catalogue.';
    END IF;
END;
$$ LANGUAGE plpgsql;


-- ---------------------------------------------------------
-- delete_product : vendor removes their own product
-- ---------------------------------------------------------
-- Business rule 2, without destroying order history. A product that has
-- never been ordered is deleted outright; one that appears in any order
-- is soft-deleted, so the FK from orders stays valid and the historical
-- record survives. Returns 'deleted' or 'archived' so the UI can report
-- which of the two happened.
CREATE OR REPLACE FUNCTION delete_product(
    p_product_id INTEGER,
    p_vendor_id  INTEGER
) RETURNS TEXT AS $$
DECLARE
    v_owner_id    INTEGER;
    v_order_count INTEGER;
BEGIN
    SELECT vendor_id INTO v_owner_id
      FROM products
     WHERE product_id = p_product_id
       AND is_active
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found in your catalogue.';
    END IF;

    IF v_owner_id <> p_vendor_id THEN
        RAISE EXCEPTION 'You can only delete your own products.';
    END IF;

    SELECT count(*) INTO v_order_count
      FROM orders
     WHERE product_id = p_product_id;

    IF v_order_count = 0 THEN
        DELETE FROM products WHERE product_id = p_product_id;
        RETURN 'deleted';
    END IF;

    UPDATE products
       SET is_active = FALSE
     WHERE product_id = p_product_id;
    RETURN 'archived';
END;
$$ LANGUAGE plpgsql;


-- ---------------------------------------------------------
-- restock_product : vendor replenishes stock for an active product
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION restock_product(
    p_product_id     INTEGER,
    p_vendor_id      INTEGER,
    p_added_quantity INTEGER
) RETURNS INTEGER AS $$
DECLARE
    v_owner_id  INTEGER;
    v_new_stock INTEGER;
BEGIN
    IF p_added_quantity IS NULL OR p_added_quantity <= 0 THEN
        RAISE EXCEPTION 'Restock quantity must be at least 1.';
    END IF;

    SELECT vendor_id
      INTO v_owner_id
      FROM products
     WHERE product_id = p_product_id
       AND is_active
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % not found in your catalogue.', p_product_id;
    END IF;

    IF v_owner_id <> p_vendor_id THEN
        RAISE EXCEPTION 'You can only restock your own products.';
    END IF;

    UPDATE products
       SET quantity = quantity + p_added_quantity
     WHERE product_id = p_product_id
     RETURNING quantity INTO v_new_stock;

    RETURN v_new_stock;
END;
$$ LANGUAGE plpgsql;


-- ---------------------------------------------------------
-- customer_cancel_order : customer cancels their own PENDING order
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION customer_cancel_order(
    p_order_id    INTEGER,
    p_customer_id INTEGER
) RETURNS VOID AS $$
DECLARE
    v_customer_id INTEGER;
    v_status      order_status;
BEGIN
    SELECT customer_id, status
      INTO v_customer_id, v_status
      FROM orders
     WHERE order_id = p_order_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found.', p_order_id;
    END IF;

    IF v_customer_id <> p_customer_id THEN
        RAISE EXCEPTION 'You can only cancel your own orders.';
    END IF;

    IF v_status <> 'PENDING' THEN
        RAISE EXCEPTION 'Only pending orders can be cancelled by customer (current status: %).', v_status;
    END IF;

    UPDATE orders
       SET status = 'CANCELLED',
           cancellation_reason = 'Cancelled by customer',
           decided_at = now()
     WHERE order_id = p_order_id;
END;
$$ LANGUAGE plpgsql;
