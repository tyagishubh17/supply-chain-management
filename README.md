# Multi-Vendor Supply Chain Management System

A full-stack DBMS project: MySQL + FastAPI + React. Covers ER modeling,
normalization, SQL joins/subqueries/aggregation, triggers, stored procedures,
views, and transaction/concurrency control (row-locking) — plus a working
full-stack app with role-based dashboards for enterprises, vendors, and
warehouse staff.

Tested end-to-end: schema + procedures verified against live MySQL, backend
verified via curl, and the full user flow (vendor lists a product → enterprise
compares vendors and orders → vendor confirms → warehouse reserves stock with
row-locking → dashboards) verified through a real browser.

## 1. Database setup

Requires MySQL 8.x.

```bash
mysql -u root -p < schema.sql
mysql -u root -p supply_chain_db < sample_data_and_queries.sql   # optional demo data
```

Create an application DB user (don't use root from the app):

```sql
CREATE USER 'scm_app'@'localhost' IDENTIFIED WITH mysql_native_password BY 'scm_pass';
GRANT ALL PRIVILEGES ON supply_chain_db.* TO 'scm_app'@'localhost';
FLUSH PRIVILEGES;
```

If you use a different username/password, update `backend/app/database.py`.

## 2. Backend setup (FastAPI)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API docs (auto-generated) will be at `http://localhost:8000/docs`.

`test_flow.sh` is an end-to-end curl script exercising the full order
workflow (register → compare vendors → place order → vendor confirms →
warehouse reserves stock with locking → dashboards) — useful to sanity-check
your setup:

```bash
bash test_flow.sh
```

## 3. Frontend setup (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:5173`. The frontend expects the backend at
`http://localhost:8000` (see `src/api.js` if you need to change this).

## 4. Using the app

1. **Register as a Vendor** → land on "My listings" → add a product with a
   price and lead time (this is what makes you appear in the multi-vendor
   comparison for enterprises).
2. **Register as an Enterprise** → lands on the **Procurement overview**
   dashboard (spend trend, order status breakdown, top vendors) → browse the
   catalog → click a product to compare every vendor supplying it (cheapest
   flagged) → place an order.
3. **Log back in as the Vendor** → "Incoming orders" → confirm the pending
   order → check the **Sales summary** dashboard (revenue trend, order
   status breakdown).
4. **Register as Warehouse staff** → "Orders" → reserve stock for the
   vendor-confirmed order (this locks the inventory row and decrements
   stock — try doing it twice quickly from two tabs to see the second one
   correctly rejected once stock is depleted).
5. **Warehouse dashboard** → stock-level bar chart (in-stock vs. reorder
   threshold per product), low-stock alerts, run the auto-reorder check,
   and view shipments.

Charts are built with [Recharts](https://recharts.org/) and pull live data
from the new `/dashboard/vendor-summary`, `/dashboard/enterprise-summary`,
and `/dashboard/inventory-levels` endpoints — they'll fill out more
meaningfully as you place more orders across different months and vendors.

## What's implemented (mapped to the DBMS syllabus)

| Feature | Where | Syllabus concept |
|---|---|---|
| 14-table normalized schema | `schema.sql` | ER modeling, 3NF normalization |
| Multi-vendor price comparison | `GET /products/{id}/vendors` | Joins, `ORDER BY` |
| Vendor sales summary, low-stock alert | SQL `VIEW`s | Views |
| Order status audit trail | `trg_order_status_change` trigger | Triggers |
| Auto-delivered on shipment | `trg_shipment_delivered` trigger | Triggers |
| 3-stage order workflow | `place_order`, `vendor_confirm_order`, `reserve_stock_for_order` procedures | PL/SQL-style stored procedures |
| Concurrency-safe stock reservation | `SELECT ... FOR UPDATE` in `reserve_stock_for_order` | Transactions, concurrency control, row locking |
| Auto-reorder on low stock | `auto_reorder_check` procedure | Cursors, procedural SQL |
| Role-based access (JWT) | `backend/app/auth.py` | Applied security, not core DBMS but expected of a "production" system |

## Notes

- The JWT secret in `auth.py` is a placeholder (`dev-only-secret...`) —
  replace it before any real deployment.
- CORS is wide open (`allow_origins=["*"]`) for local development; restrict
  this in production.
- This was built and tested with MySQL 8.0. Stored procedures use cursors
  and `SIGNAL SQLSTATE` for error handling, which are MySQL/MariaDB syntax.
