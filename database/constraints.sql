-- =========================================================
-- 03. CONSTRAINTS & INDEXES  (PostgreSQL / Supabase)
-- =========================================================
-- Added with ALTER TABLE so every constraint is explicit and named.
-- =========================================================

-- ---------------------------------------------------------
-- UNIQUE : an email identifies exactly one account
-- ---------------------------------------------------------
ALTER TABLE vendors   ADD CONSTRAINT uq_vendors_email   UNIQUE (email);
ALTER TABLE customers ADD CONSTRAINT uq_customers_email UNIQUE (email);

-- ---------------------------------------------------------
-- FOREIGN KEYS
-- ---------------------------------------------------------
-- products.vendor_id -> vendors.vendor_id
-- ON DELETE CASCADE: removing a vendor removes their catalogue.
ALTER TABLE products
    ADD CONSTRAINT fk_products_vendor
    FOREIGN KEY (vendor_id) REFERENCES vendors (vendor_id)
    ON DELETE CASCADE;

-- orders.customer_id -> customers.customer_id
-- ON DELETE RESTRICT: a customer with order history cannot be deleted.
ALTER TABLE orders
    ADD CONSTRAINT fk_orders_customer
    FOREIGN KEY (customer_id) REFERENCES customers (customer_id)
    ON DELETE RESTRICT;

-- orders.product_id -> products.product_id
-- ON DELETE RESTRICT is the key referential-integrity decision: a product
-- that appears in any order can never be physically deleted, so historical
-- order records can never be orphaned. Vendors "delete" such a product by
-- soft-deleting it (is_active = FALSE) instead.
ALTER TABLE orders
    ADD CONSTRAINT fk_orders_product
    FOREIGN KEY (product_id) REFERENCES products (product_id)
    ON DELETE RESTRICT;

-- ---------------------------------------------------------
-- CHECK constraints
-- ---------------------------------------------------------
ALTER TABLE products
    ADD CONSTRAINT chk_products_price_non_negative CHECK (price >= 0);

ALTER TABLE products
    ADD CONSTRAINT chk_products_quantity_non_negative CHECK (quantity >= 0);

ALTER TABLE products
    ADD CONSTRAINT chk_products_name_not_blank CHECK (length(btrim(product_name)) > 0);

-- An order must always be for at least one unit.
ALTER TABLE orders
    ADD CONSTRAINT chk_orders_quantity_positive CHECK (quantity > 0);

ALTER TABLE orders
    ADD CONSTRAINT chk_orders_unit_price_non_negative CHECK (unit_price >= 0);

-- Business rule 7: a cancellation reason is mandatory for, and only
-- meaningful on, a CANCELLED order. One CHECK enforces both directions,
-- so a cancellation can never be recorded without a stored reason.
ALTER TABLE orders
    ADD CONSTRAINT chk_orders_cancellation_reason CHECK (
        (status = 'CANCELLED' AND cancellation_reason IS NOT NULL
                              AND length(btrim(cancellation_reason)) > 0)
        OR
        (status <> 'CANCELLED' AND cancellation_reason IS NULL)
    );

-- A decision timestamp exists exactly when the order has left PENDING.
ALTER TABLE orders
    ADD CONSTRAINT chk_orders_decided_at CHECK (
        (status = 'PENDING' AND decided_at IS NULL)
        OR
        (status <> 'PENDING' AND decided_at IS NOT NULL)
    );

-- ---------------------------------------------------------
-- Cross-table email uniqueness
-- ---------------------------------------------------------
-- UNIQUE only works within one table, so a trigger stops the same email
-- being registered as both a vendor and a customer.
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

-- ---------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------
-- A vendor may not list the same product name twice, but a soft-deleted
-- name is freed up for re-use, so the unique index is partial.
CREATE UNIQUE INDEX uq_products_vendor_name_active
    ON products (vendor_id, lower(btrim(product_name)))
    WHERE is_active;

-- Supports "list my products" and the customer catalogue join.
CREATE INDEX idx_products_vendor    ON products (vendor_id);

-- Supports the customer's case-insensitive product-name search.
CREATE INDEX idx_products_name_lower ON products (lower(product_name));

-- Supports "my orders" (customer) and the vendor's incoming-order queue.
CREATE INDEX idx_orders_customer ON orders (customer_id);
CREATE INDEX idx_orders_product  ON orders (product_id);
CREATE INDEX idx_orders_status   ON orders (status);
