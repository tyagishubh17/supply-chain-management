-- =========================================================
-- Multi-Vendor Supply Chain Management System
-- Database schema (MySQL 8.x)
-- =========================================================

DROP DATABASE IF EXISTS supply_chain_db;
CREATE DATABASE supply_chain_db;
USE supply_chain_db;

-- ---------------------------------------------------------
-- 1. Identity & roles
-- ---------------------------------------------------------
CREATE TABLE `user` (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            ENUM('admin', 'vendor', 'enterprise', 'warehouse_staff') NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE vendor (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL UNIQUE,
    company_name    VARCHAR(150) NOT NULL,
    address         VARCHAR(255),
    rating          DECIMAL(2,1) DEFAULT 0.0 CHECK (rating BETWEEN 0 AND 5),
    FOREIGN KEY (user_id) REFERENCES `user`(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE enterprise (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL UNIQUE,
    company_name    VARCHAR(150) NOT NULL,
    address         VARCHAR(255),
    FOREIGN KEY (user_id) REFERENCES `user`(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- 2. Catalog
-- ---------------------------------------------------------
CREATE TABLE category (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE product (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    category_id     INT NOT NULL,
    name            VARCHAR(150) NOT NULL,
    description     TEXT,
    unit            VARCHAR(20) NOT NULL DEFAULT 'unit',
    FOREIGN KEY (category_id) REFERENCES category(id)
) ENGINE=InnoDB;

-- one product can be supplied by many vendors, at different prices
CREATE TABLE vendor_product (
    vendor_id       INT NOT NULL,
    product_id      INT NOT NULL,
    price           DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    lead_time_days  INT NOT NULL DEFAULT 1,
    PRIMARY KEY (vendor_id, product_id),
    FOREIGN KEY (vendor_id) REFERENCES vendor(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- 3. Warehousing & inventory
-- ---------------------------------------------------------
CREATE TABLE warehouse (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    location        VARCHAR(255) NOT NULL,
    capacity        INT NOT NULL CHECK (capacity >= 0)
) ENGINE=InnoDB;

CREATE TABLE inventory (
    warehouse_id    INT NOT NULL,
    product_id      INT NOT NULL,
    quantity        INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    reorder_level   INT NOT NULL DEFAULT 10,
    PRIMARY KEY (warehouse_id, product_id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouse(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- 4. Orders
-- ---------------------------------------------------------
CREATE TABLE purchase_order (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    enterprise_id   INT NOT NULL,
    vendor_id       INT NOT NULL,
    warehouse_id    INT,
    order_date      DATE NOT NULL DEFAULT (CURRENT_DATE),
    status          ENUM('pending', 'vendor_confirmed', 'stock_reserved', 'shipped', 'delivered', 'cancelled') NOT NULL DEFAULT 'pending',
    FOREIGN KEY (enterprise_id) REFERENCES enterprise(id),
    FOREIGN KEY (vendor_id) REFERENCES vendor(id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouse(id)
) ENGINE=InnoDB;

CREATE TABLE order_item (
    order_id        INT NOT NULL,
    product_id      INT NOT NULL,
    quantity        INT NOT NULL CHECK (quantity > 0),
    unit_price      DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (order_id, product_id),
    FOREIGN KEY (order_id) REFERENCES purchase_order(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES product(id)
) ENGINE=InnoDB;

CREATE TABLE order_status_log (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    order_id        INT NOT NULL,
    old_status      VARCHAR(20),
    new_status      VARCHAR(20) NOT NULL,
    changed_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES purchase_order(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Auto-generated restock requests when inventory falls below reorder_level
CREATE TABLE reorder_request (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    warehouse_id    INT NOT NULL,
    product_id      INT NOT NULL,
    vendor_id       INT NOT NULL,
    quantity        INT NOT NULL,
    status          ENUM('drafted', 'sent', 'fulfilled', 'cancelled') NOT NULL DEFAULT 'drafted',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouse(id),
    FOREIGN KEY (product_id) REFERENCES product(id),
    FOREIGN KEY (vendor_id) REFERENCES vendor(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- 5. Logistics
-- ---------------------------------------------------------
CREATE TABLE transporter (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    contact         VARCHAR(100),
    vehicle_type    VARCHAR(50)
) ENGINE=InnoDB;

CREATE TABLE route (
    id                      INT AUTO_INCREMENT PRIMARY KEY,
    source_warehouse_id     INT NOT NULL,
    destination             VARCHAR(255) NOT NULL,
    distance_km             DECIMAL(8,2) NOT NULL CHECK (distance_km >= 0),
    FOREIGN KEY (source_warehouse_id) REFERENCES warehouse(id)
) ENGINE=InnoDB;

CREATE TABLE shipment (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    order_id        INT NOT NULL,
    transporter_id  INT NOT NULL,
    route_id        INT NOT NULL,
    status          ENUM('pending', 'in_transit', 'delivered', 'delayed') NOT NULL DEFAULT 'pending',
    dispatch_date   DATE,
    delivery_date   DATE,
    FOREIGN KEY (order_id) REFERENCES purchase_order(id),
    FOREIGN KEY (transporter_id) REFERENCES transporter(id),
    FOREIGN KEY (route_id) REFERENCES route(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- 6. Payments
-- ---------------------------------------------------------
CREATE TABLE payment (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    order_id        INT NOT NULL,
    amount          DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
    payment_date    DATE,
    method          ENUM('card', 'bank_transfer', 'upi', 'cash') NOT NULL,
    status          ENUM('pending', 'completed', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
    FOREIGN KEY (order_id) REFERENCES purchase_order(id)
) ENGINE=InnoDB;

-- =========================================================
-- Indexes for common lookups
-- =========================================================
CREATE INDEX idx_product_category ON product(category_id);
CREATE INDEX idx_order_enterprise ON purchase_order(enterprise_id);
CREATE INDEX idx_order_vendor ON purchase_order(vendor_id);
CREATE INDEX idx_shipment_order ON shipment(order_id);
CREATE INDEX idx_inventory_product ON inventory(product_id);

-- =========================================================
-- Triggers
-- =========================================================
DELIMITER $$

-- Log every status change on a purchase order
CREATE TRIGGER trg_order_status_change
AFTER UPDATE ON purchase_order
FOR EACH ROW
BEGIN
    IF OLD.status <> NEW.status THEN
        INSERT INTO order_status_log (order_id, old_status, new_status)
        VALUES (NEW.id, OLD.status, NEW.status);
    END IF;
END$$

-- When a shipment is marked delivered, reduce vendor-side stock is not tracked here,
-- but we can auto-update the purchase_order status to 'delivered'
CREATE TRIGGER trg_shipment_delivered
AFTER UPDATE ON shipment
FOR EACH ROW
BEGIN
    IF NEW.status = 'delivered' AND OLD.status <> 'delivered' THEN
        UPDATE purchase_order SET status = 'delivered' WHERE id = NEW.order_id;
    END IF;
END$$

DELIMITER ;

-- =========================================================
-- Stored procedures: order workflow
-- Stage 1: enterprise places the order (no stock touched yet)
-- Stage 2: vendor confirms the order
-- Stage 3: warehouse reserves stock (row-locked, concurrency-safe)
-- =========================================================
DELIMITER $$

-- Stage 1: place order. Just records intent + price snapshot.
CREATE PROCEDURE place_order(
    IN p_enterprise_id INT,
    IN p_vendor_id INT,
    IN p_product_id INT,
    IN p_quantity INT,
    OUT p_order_id INT
)
BEGIN
    DECLARE v_price DECIMAL(10,2);

    SELECT price INTO v_price FROM vendor_product
    WHERE vendor_id = p_vendor_id AND product_id = p_product_id;

    IF v_price IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This vendor does not supply the requested product';
    END IF;

    INSERT INTO purchase_order (enterprise_id, vendor_id, status)
    VALUES (p_enterprise_id, p_vendor_id, 'pending');
    SET p_order_id = LAST_INSERT_ID();

    INSERT INTO order_item (order_id, product_id, quantity, unit_price)
    VALUES (p_order_id, p_product_id, p_quantity, v_price);
END$$

-- Stage 2: vendor confirms they will fulfil the order
CREATE PROCEDURE vendor_confirm_order(IN p_order_id INT)
BEGIN
    DECLARE v_status VARCHAR(20);
    SELECT status INTO v_status FROM purchase_order WHERE id = p_order_id FOR UPDATE;

    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Order not found';
    ELSEIF v_status <> 'pending' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Order is not in a pending state';
    ELSE
        UPDATE purchase_order SET status = 'vendor_confirmed' WHERE id = p_order_id;
    END IF;
END$$

-- Stage 3: warehouse staff reserve stock for a confirmed order.
-- Uses SELECT ... FOR UPDATE to lock the inventory row so two staff
-- members cannot both reserve the same last units concurrently.
CREATE PROCEDURE reserve_stock_for_order(
    IN p_order_id INT,
    IN p_warehouse_id INT
)
BEGIN
    DECLARE v_done INT DEFAULT 0;
    DECLARE v_product_id INT;
    DECLARE v_needed INT;
    DECLARE v_available INT;
    DECLARE v_status VARCHAR(20);
    DECLARE item_cursor CURSOR FOR
        SELECT product_id, quantity FROM order_item WHERE order_id = p_order_id;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

    SELECT status INTO v_status FROM purchase_order WHERE id = p_order_id;
    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Order not found';
    ELSEIF v_status <> 'vendor_confirmed' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Order must be vendor-confirmed before stock can be reserved';
    END IF;

    START TRANSACTION;

    OPEN item_cursor;
    read_loop: LOOP
        FETCH item_cursor INTO v_product_id, v_needed;
        IF v_done THEN
            LEAVE read_loop;
        END IF;

        SELECT quantity INTO v_available
        FROM inventory
        WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id
        FOR UPDATE;

        IF v_available IS NULL OR v_available < v_needed THEN
            CLOSE item_cursor;
            ROLLBACK;
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient stock at the selected warehouse for this order';
        END IF;

        UPDATE inventory
        SET quantity = quantity - v_needed
        WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id;
    END LOOP;
    CLOSE item_cursor;

    UPDATE purchase_order
    SET status = 'stock_reserved', warehouse_id = p_warehouse_id
    WHERE id = p_order_id;

    COMMIT;
END$$

-- Scans low_stock_alert-equivalent rows and drafts a reorder request
-- with the cheapest vendor for each low-stock product.
CREATE PROCEDURE auto_reorder_check()
BEGIN
    DECLARE v_done INT DEFAULT 0;
    DECLARE v_warehouse_id INT;
    DECLARE v_product_id INT;
    DECLARE v_quantity INT;
    DECLARE v_reorder_level INT;
    DECLARE v_best_vendor INT;
    DECLARE low_cursor CURSOR FOR
        SELECT warehouse_id, product_id, quantity, reorder_level
        FROM inventory
        WHERE quantity <= reorder_level;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

    OPEN low_cursor;
    reorder_loop: LOOP
        FETCH low_cursor INTO v_warehouse_id, v_product_id, v_quantity, v_reorder_level;
        IF v_done THEN
            LEAVE reorder_loop;
        END IF;

        SELECT vendor_id INTO v_best_vendor
        FROM vendor_product
        WHERE product_id = v_product_id
        ORDER BY price ASC
        LIMIT 1;

        IF v_best_vendor IS NOT NULL
           AND NOT EXISTS (
               SELECT 1 FROM reorder_request
               WHERE warehouse_id = v_warehouse_id AND product_id = v_product_id
                 AND status IN ('drafted', 'sent')
           ) THEN
            INSERT INTO reorder_request (warehouse_id, product_id, vendor_id, quantity, status)
            VALUES (v_warehouse_id, v_product_id, v_best_vendor, (v_reorder_level * 2) - v_quantity, 'drafted');
        END IF;
    END LOOP;
    CLOSE low_cursor;
END$$

DELIMITER ;

-- =========================================================
-- Views
-- =========================================================
CREATE VIEW low_stock_alert AS
SELECT w.name AS warehouse_name, p.name AS product_name, i.quantity, i.reorder_level
FROM inventory i
JOIN warehouse w ON w.id = i.warehouse_id
JOIN product p ON p.id = i.product_id
WHERE i.quantity <= i.reorder_level;

CREATE VIEW vendor_sales_summary AS
SELECT v.company_name AS vendor_name,
       COUNT(DISTINCT po.id) AS total_orders,
       COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_revenue
FROM vendor v
LEFT JOIN purchase_order po ON po.vendor_id = v.id
LEFT JOIN order_item oi ON oi.order_id = po.id
GROUP BY v.id, v.company_name;
