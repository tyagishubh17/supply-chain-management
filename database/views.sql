-- =========================================================
-- 05. VIEWS  (PostgreSQL / Supabase)
-- =========================================================
-- Three views, each backing a real screen in the application:
-- the customer catalogue, the order lists, and the vendor sales chart.
-- =========================================================

-- ---------------------------------------------------------
-- vw_available_products : the customer-facing catalogue
-- ---------------------------------------------------------
-- Requirement 5.1 / 8: only products that can actually be ordered are
-- listed, so soft-deleted and out-of-stock rows are filtered out here
-- rather than in the frontend. The supplier name is resolved through the
-- foreign key, never stored on the product row.
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


-- ---------------------------------------------------------
-- vw_order_details : one row per order, fully resolved
-- ---------------------------------------------------------
-- A four-table JOIN that both dashboards read: the vendor's incoming
-- queue filters it by vendor_id, the customer's history by customer_id.
-- line_total is computed, never stored.
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


-- ---------------------------------------------------------
-- vw_vendor_product_sales : sales analytics per product
-- ---------------------------------------------------------
-- Requirement 15. Only ACCEPTED orders count as sales, so a rejected or
-- cancelled order never inflates revenue. Aggregation lives in the view,
-- which keeps the chart endpoint down to a single filtered SELECT.
CREATE OR REPLACE VIEW vw_vendor_product_sales AS
SELECT p.vendor_id,
       p.product_id,
       p.product_name,
       count(o.order_id)                       AS orders_accepted,
       COALESCE(sum(o.quantity), 0)            AS units_sold,
       COALESCE(sum(o.quantity * o.unit_price), 0) AS revenue
  FROM products p
  LEFT JOIN orders o
         ON o.product_id = p.product_id
        AND o.status = 'ACCEPTED'
 GROUP BY p.vendor_id, p.product_id, p.product_name;
