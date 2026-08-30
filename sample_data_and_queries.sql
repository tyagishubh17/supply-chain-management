USE supply_chain_db;

-- =========================================================
-- Sample data
-- =========================================================
INSERT INTO `user` (name, email, password_hash, role) VALUES
('Ravi Kumar', 'ravi@vendorco.com', 'hash1', 'vendor'),
('Anita Sharma', 'anita@vendorco.com', 'hash2', 'vendor'),
('TechMart Pvt Ltd', 'ops@techmart.com', 'hash3', 'enterprise'),
('Warehouse Manager', 'wm@scm.com', 'hash4', 'warehouse_staff'),
('Admin User', 'admin@scm.com', 'hash5', 'admin');

INSERT INTO vendor (user_id, company_name, address, rating) VALUES
(1, 'Kumar Electronics Supply', 'Indore, MP', 4.5),
(2, 'Sharma Textiles', 'Bhopal, MP', 4.2);

INSERT INTO enterprise (user_id, company_name, address) VALUES
(3, 'TechMart Pvt Ltd', 'Pune, MH');

INSERT INTO category (name) VALUES ('Electronics'), ('Textiles'), ('Packaging');

INSERT INTO product (category_id, name, description, unit) VALUES
(1, 'USB-C Cable', '1m braided cable', 'piece'),
(1, 'Bluetooth Speaker', 'Portable, 10W', 'piece'),
(2, 'Cotton T-Shirt', 'Plain, size M', 'piece');

INSERT INTO vendor_product (vendor_id, product_id, price, lead_time_days) VALUES
(1, 1, 120.00, 3),
(1, 2, 899.00, 5),
(2, 3, 250.00, 2);

INSERT INTO warehouse (name, location, capacity) VALUES
('Central Warehouse', 'Bhopal, MP', 10000),
('South Hub', 'Pune, MH', 8000);

INSERT INTO inventory (warehouse_id, product_id, quantity, reorder_level) VALUES
(1, 1, 500, 50),
(1, 2, 40, 20),
(2, 3, 300, 30);

INSERT INTO transporter (name, contact, vehicle_type) VALUES
('FastTrack Logistics', '9999999999', 'Truck'),
('QuickShip', '8888888888', 'Van');

INSERT INTO route (source_warehouse_id, destination, distance_km) VALUES
(1, 'Pune, MH', 650.00),
(2, 'Mumbai, MH', 150.00);

-- =========================================================
-- Order workflow demo: place -> vendor confirms -> warehouse reserves stock
-- =========================================================
SET @new_order_id = 0;
CALL place_order(1, 1, 1, 100, @new_order_id);   -- TechMart orders 100 USB-C cables from Kumar Electronics
SELECT @new_order_id AS created_order_id;

CALL vendor_confirm_order(@new_order_id);
CALL reserve_stock_for_order(@new_order_id, 1);  -- reserved from Central Warehouse (locks the inventory row)

SELECT id, status, warehouse_id FROM purchase_order WHERE id = @new_order_id;
SELECT quantity FROM inventory WHERE warehouse_id = 1 AND product_id = 1;  -- should be reduced by 100

INSERT INTO shipment (order_id, transporter_id, route_id, status, dispatch_date) VALUES
(@new_order_id, 1, 1, 'in_transit', CURDATE());

INSERT INTO payment (order_id, amount, payment_date, method, status) VALUES
(@new_order_id, 12000.00, CURDATE(), 'bank_transfer', 'completed');

-- =========================================================
-- Auto-reorder demo: Bluetooth Speaker is at 40 units, reorder_level 20
-- Drop it below threshold to trigger a draft reorder request
-- =========================================================
UPDATE inventory SET quantity = 15 WHERE warehouse_id = 1 AND product_id = 2;
CALL auto_reorder_check();
SELECT * FROM reorder_request;

-- =========================================================
-- Demo queries (things your professor will like to see)
-- =========================================================

-- 1. Join: full order detail with vendor, enterprise, product
SELECT po.id AS order_id, e.company_name AS buyer, v.company_name AS vendor,
       p.name AS product, oi.quantity, oi.unit_price,
       (oi.quantity * oi.unit_price) AS line_total, po.status
FROM purchase_order po
JOIN enterprise e ON e.id = po.enterprise_id
JOIN vendor v ON v.id = po.vendor_id
JOIN order_item oi ON oi.order_id = po.id
JOIN product p ON p.id = oi.product_id;

-- 2. Aggregation: total revenue per vendor (uses the view)
SELECT * FROM vendor_sales_summary;

-- 3. Low stock alert (uses the view)
SELECT * FROM low_stock_alert;

-- 4. Shipment tracking with transporter and route info
SELECT s.id AS shipment_id, po.id AS order_id, t.name AS transporter,
       r.destination, r.distance_km, s.status, s.dispatch_date
FROM shipment s
JOIN purchase_order po ON po.id = s.order_id
JOIN transporter t ON t.id = s.transporter_id
JOIN route r ON r.id = s.route_id;

-- 5. Subquery: vendors who supply above-average priced products
SELECT DISTINCT v.company_name
FROM vendor v
JOIN vendor_product vp ON vp.vendor_id = v.id
WHERE vp.price > (SELECT AVG(price) FROM vendor_product);

-- 6. Trigger demo: update an order's status and check the audit log
UPDATE purchase_order SET status = 'shipped' WHERE id = @new_order_id;
SELECT * FROM order_status_log;
