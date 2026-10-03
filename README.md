# Multi-Vendor Supply Chain Management System

A DBMS course project: a minimal multi-vendor supply chain system where
**vendors** manage their products and decide on incoming orders, and
**customers** browse the catalogue, identify each product's supplier, and
place orders.

Built on **Supabase PostgreSQL**, with a FastAPI backend and a React
frontend. The emphasis is on database design — relationships, constraints,
normalisation, transactions and SQL — rather than on breadth of features.

The single most important rule in the system:

> **A product's quantity does not change when an order is placed.
> It decreases only when the vendor accepts the order.**

---

## Table of contents

1. [Project overview](#1-project-overview)
2. [Features](#2-features)
3. [Technology stack](#3-technology-stack)
4. [Setup](#4-setup)
5. [Database schema](#5-database-schema)
6. [ER diagram](#6-er-diagram)
7. [Relational schema](#7-relational-schema)
8. [Normalisation](#8-normalisation-unf--3nf)
9. [SQL queries](#9-sql-queries)
10. [Functions, views and triggers](#10-functions-views-and-triggers)
11. [Business rules](#11-business-rules)
12. [Security](#12-security)
13. [Testing](#13-testing)
14. [Screenshots](#14-screenshots)
15. [Team contributions](#15-team-contributions)

---

## 1. Project overview

The system models the supply side of a marketplace. Multiple independent
vendors each maintain their own catalogue of products with a price and a
stock quantity. Customers see the combined catalogue of everything that is
actually orderable, can search it by product name, can see which vendor
supplies any given product, and can place an order for a quantity they can
actually be given.

An order does not immediately consume stock. It is created as `PENDING` and
waits for the owning vendor, who can **accept** it (stock decreases),
**reject** it (stock untouched), or **cancel** it with a mandatory reason
that both sides can then see.

Everything else — payments, delivery tracking, warehouses, reviews,
recommendations — is deliberately out of scope.

---

## 2. Features

### Vendor features

| Feature | Where |
|---|---|
| Register, log in, log out | `/register`, `/login` |
| Add a product (name, price, quantity) | My products |
| View own products, with created/updated dates | My products |
| Change the price of an own product | My products → Edit price |
| Delete an own product, preserving order history | My products → Delete |
| See incoming orders for own products, with customer, product, quantity, date, time and status | Incoming orders |
| Accept an order — the only action that reduces stock | Incoming orders → Accept |
| Reject an order — stock unchanged | Incoming orders → Reject |
| Cancel an order with a mandatory stored reason | Incoming orders → Cancel |
| Sales analytics: revenue by product, orders over time, totals | Sales |

A vendor can only ever see and change **their own** products and the orders
placed against them.

### Customer features

| Feature | Where |
|---|---|
| Register, log in, log out | `/register`, `/login` |
| Browse available products from all vendors | Browse products |
| Search products by name | Browse products → search box |
| View a product's details and its supplier | Browse products → View & order |
| Place an order for a valid quantity | Product dialog → Place order |
| Order history with product, supplier, quantity, price, date, time and status | My orders |
| See the vendor's cancellation reason | My orders |

A customer can only see their own orders.

---

## 3. Technology stack

| Layer | Technology |
|---|---|
| Database | **Supabase PostgreSQL** (PostgreSQL 16) |
| Backend | **Python** + **FastAPI**, `psycopg` 3 (PostgreSQL driver), `psycopg_pool` |
| Auth | JWT (`PyJWT`), password hashing with `bcrypt` |
| Frontend | **React 19** + **Vite**, React Router, **Recharts** for charts |
| Styling | Plain CSS with custom properties (no framework) |

There is no ORM: all database access is explicit SQL, which is the point of
the exercise. The SQL is plain PostgreSQL, so it runs unchanged on Supabase
or on a local PostgreSQL instance.

### Repository layout

```
database/          all SQL, in build order
  schema.sql         master build script
  tables.sql         CREATE TYPE + 4 CREATE TABLEs
  constraints.sql    PK/FK/UNIQUE/CHECK via ALTER TABLE, indexes, email trigger
  functions.sql      order workflow functions + updated_at trigger
  views.sql          3 views
  seed.sql           demo data
  queries.sql        21 documented reference queries
backend/
  app/
    main.py          FastAPI app, CORS, lifespan, /health
    database.py      connection pool, SQL error -> HTTP mapping
    auth.py          JWT, bcrypt, role dependencies
    schemas.py       Pydantic request/response models
    routers/
      auth.py        register + login for both roles
      products.py    vendor CRUD, customer catalogue + search
      orders.py      place, list, accept/reject/cancel
      sales.py       vendor analytics
  .env.example       configuration template
frontend/
  src/
    App.jsx          routes + role guards
    api.js           API client
    format.js        shared money/date formatting
    chartTheme.js    chart palette
    auth/            AuthContext
    components/      Layout, ChartTooltip
    pages/           Login, Register, Vendor*, Customer*
tests/
  test_business_rules.sql   44 database-level checks
  test_api.py               67 end-to-end API checks
```

---

## 4. Setup

### 4.1 Database

**On Supabase:** create a project, open the **SQL Editor**, and run these
files in order (the editor has no `\i` include support, so paste them one at
a time):

1. `database/schema.sql` — for the `DROP` section at the top
2. `database/tables.sql`
3. `database/constraints.sql`
4. `database/functions.sql`
5. `database/views.sql`
6. `database/seed.sql` — optional demo data

**On a local PostgreSQL**, `schema.sql` does the whole build itself:

```bash
createdb supply_chain_db
psql "postgresql://postgres:postgres@127.0.0.1:5432/supply_chain_db" -f database/schema.sql
psql "postgresql://postgres:postgres@127.0.0.1:5432/supply_chain_db" -f database/seed.sql
```

The seed data creates three vendors, three customers, eight products and
twelve orders spanning all four statuses, so the dashboards and charts have
something real to show. Every demo account uses the password
`password123`:

| Role | Emails |
|---|---|
| Vendor | `abc@vendor.com`, `sharma@vendor.com`, `verma@vendor.com` |
| Customer | `rahul@customer.com`, `priya@customer.com`, `orders@techmart.com` |

### 4.2 Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows;  source venv/bin/activate  elsewhere
pip install -r requirements.txt

copy .env.example .env         # Windows;  cp .env.example .env  elsewhere
# then edit .env: set DATABASE_URL and a fresh JWT_SECRET

python -m uvicorn app.main:app --reload --port 8000
```

Check it came up: <http://127.0.0.1:8000/health> should return
`{"status":"ok","database":"connected"}`. Interactive API docs are at
<http://127.0.0.1:8000/docs>.

`DATABASE_URL` comes from the Supabase dashboard under
**Project Settings → Database → Connection string → URI**. Generate a
secret with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

### 4.3 Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens <http://localhost:5173>. It expects the API at
`http://127.0.0.1:8000`; override with `VITE_API_URL` in `frontend/.env`.

> **Windows note.** Use `127.0.0.1` rather than `localhost` in
> `DATABASE_URL`. `localhost` resolves to the IPv6 address `::1` first, and
> if PostgreSQL only listens on IPv4 (a Docker published port, for example)
> every connection stalls for about ten seconds before falling back — which
> makes the whole app appear broken. This was measured at 10.2 s per request
> with `localhost` versus 0.055 s with `127.0.0.1`.

---

## 5. Database schema

Four tables. Names are plural, primary keys are `<entity>_id`.

### `vendors` — a supplier

| Column | Type | Notes |
|---|---|---|
| `vendor_id` | `SERIAL` | **PK** |
| `company_name` | `VARCHAR(150)` | `NOT NULL`. Shown to customers as the supplier |
| `email` | `VARCHAR(150)` | `NOT NULL`, **UNIQUE** — the login identifier |
| `password_hash` | `VARCHAR(255)` | `NOT NULL`. bcrypt hash; never a plaintext password |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` |

**Purpose:** a vendor account. Owns products and decides on the orders
placed against them.

### `customers` — a buyer

| Column | Type | Notes |
|---|---|---|
| `customer_id` | `SERIAL` | **PK** |
| `full_name` | `VARCHAR(150)` | `NOT NULL` |
| `email` | `VARCHAR(150)` | `NOT NULL`, **UNIQUE** |
| `password_hash` | `VARCHAR(255)` | `NOT NULL`. bcrypt hash |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` |

**Purpose:** a customer account. Browses products and places orders.

### `products` — a product, owned by exactly one vendor

| Column | Type | Notes |
|---|---|---|
| `product_id` | `SERIAL` | **PK** |
| `vendor_id` | `INTEGER` | `NOT NULL`, **FK → `vendors(vendor_id)`** `ON DELETE CASCADE` |
| `product_name` | `VARCHAR(150)` | `NOT NULL`, must not be blank |
| `price` | `NUMERIC(10,2)` | `NOT NULL`, `CHECK (price >= 0)` |
| `quantity` | `INTEGER` | `NOT NULL DEFAULT 0`, `CHECK (quantity >= 0)`. The vendor's stock |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT TRUE`. Supports soft deletion |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()`, maintained by a trigger |

**Purpose:** the catalogue. `quantity` is the single source of truth for
stock, and is only ever changed by the order-workflow functions.

### `orders` — one customer ordering one product

| Column | Type | Notes |
|---|---|---|
| `order_id` | `SERIAL` | **PK** |
| `customer_id` | `INTEGER` | `NOT NULL`, **FK → `customers(customer_id)`** `ON DELETE RESTRICT` |
| `product_id` | `INTEGER` | `NOT NULL`, **FK → `products(product_id)`** `ON DELETE RESTRICT` |
| `quantity` | `INTEGER` | `NOT NULL`, `CHECK (quantity > 0)` |
| `unit_price` | `NUMERIC(10,2)` | `NOT NULL`, `CHECK (unit_price >= 0)`. Price **at order time** |
| `status` | `order_status` | `NOT NULL DEFAULT 'PENDING'`. Enum: `PENDING`/`ACCEPTED`/`REJECTED`/`CANCELLED` |
| `cancellation_reason` | `TEXT` | Required when `CANCELLED`, must be `NULL` otherwise |
| `ordered_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()`. Gives both order date and time |
| `decided_at` | `TIMESTAMPTZ` | Set exactly when the order leaves `PENDING` |

**Purpose:** the order record and its lifecycle.

Two design points worth noting:

- **`status` is a single enum column**, not three booleans. An order cannot
  be simultaneously accepted and rejected, because the type only permits one
  value.
- **The vendor is not stored on the order.** It is reached through
  `products.vendor_id`. Copying it onto `orders` would be a transitive
  dependency, and would allow the two to disagree.

### Constraints summary

| Kind | Constraints |
|---|---|
| Primary keys | `vendors.vendor_id`, `customers.customer_id`, `products.product_id`, `orders.order_id` |
| Foreign keys | `products.vendor_id → vendors`, `orders.customer_id → customers`, `orders.product_id → products` |
| Unique | `vendors.email`, `customers.email`, plus a partial unique index on `(vendor_id, lower(product_name)) WHERE is_active` |
| Check | `price >= 0`, `quantity >= 0` (products), `quantity > 0`, `unit_price >= 0` (orders), non-blank product name, the cancellation-reason rule, the `decided_at` rule |
| Not null | every column above except `cancellation_reason` and `decided_at` |

**Referential-integrity strategy.** `orders.product_id` uses
`ON DELETE RESTRICT`, so a product that appears in any order can never be
physically deleted and an order can never be orphaned. `delete_product()`
therefore hard-deletes a product that has never been ordered, and
soft-deletes (`is_active = FALSE`) one that has, which hides it from the
catalogue while keeping the history intact. `orders.customer_id` is likewise
`RESTRICT`. `products.vendor_id` is `ON DELETE CASCADE`, since a vendor's
catalogue has no meaning without the vendor.

---

## 6. ER diagram

```
┌─────────────────────────┐                  ┌──────────────────────────┐
│        VENDORS          │                  │       CUSTOMERS          │
├─────────────────────────┤                  ├──────────────────────────┤
│ vendor_id      PK       │                  │ customer_id     PK       │
│ company_name            │                  │ full_name                │
│ email          UNIQUE   │                  │ email           UNIQUE   │
│ password_hash           │                  │ password_hash            │
│ created_at              │                  │ created_at               │
└───────────┬─────────────┘                  └────────────┬─────────────┘
            │                                             │
            │ 1                                           │ 1
            │                                             │
            │ supplies                                    │ places
            │                                             │
            │ N                                           │ N
┌───────────┴─────────────┐                  ┌────────────┴─────────────┐
│        PRODUCTS         │ 1              N │         ORDERS           │
├─────────────────────────┤────────────────▶ ├──────────────────────────┤
│ product_id     PK       │   is ordered in  │ order_id         PK      │
│ vendor_id      FK       │                  │ customer_id      FK      │
│ product_name            │                  │ product_id       FK      │
│ price          ≥ 0      │                  │ quantity         > 0     │
│ quantity       ≥ 0      │                  │ unit_price       ≥ 0     │
│ is_active               │                  │ status           ENUM    │
│ created_at              │                  │ cancellation_reason      │
│ updated_at              │                  │ ordered_at               │
└─────────────────────────┘                  │ decided_at               │
                                             └──────────────────────────┘

Cardinalities
  VENDORS   (1) ──────── (N) PRODUCTS      one vendor supplies many products
  CUSTOMERS (1) ──────── (N) ORDERS        one customer places many orders
  PRODUCTS  (1) ──────── (N) ORDERS        one product is ordered many times

  A vendor reaches their orders through PRODUCTS:
      VENDORS → PRODUCTS → ORDERS
```

Note that `VENDORS` and `PRODUCTS` is **1:N, not M:N**. Each product row
belongs to exactly one vendor; if two vendors sell the same thing, each has
their own product row with their own price and stock. This is what makes the
system "multi-vendor" while keeping the relationship simple.

---

## 7. Relational schema

```
vendors   ( vendor_id,   company_name, email, password_hash, created_at )
              └─ PK                      └─ UNIQUE

customers ( customer_id, full_name,    email, password_hash, created_at )
              └─ PK                      └─ UNIQUE

products  ( product_id, vendor_id, product_name, price, quantity,
              └─ PK       └─ FK → vendors(vendor_id)
            is_active, created_at, updated_at )

orders    ( order_id, customer_id, product_id, quantity, unit_price,
              └─ PK     └─ FK →      └─ FK →
                        customers     products
            status, cancellation_reason, ordered_at, decided_at )
```

Relationships in words:

```
Vendor   (1) ──── (N) Product      products.vendor_id   → vendors.vendor_id
Customer (1) ──── (N) Order        orders.customer_id   → customers.customer_id
Product  (1) ──── (N) Order        orders.product_id    → products.product_id
```

The vendor of an order is derived:

```sql
SELECT v.company_name
  FROM orders   o
  JOIN products p ON p.product_id = o.product_id
  JOIN vendors  v ON v.vendor_id  = p.vendor_id
 WHERE o.order_id = 1;
```

---

## 8. Normalisation (UNF → 3NF)

Worked through with this project's actual data. Suppose we had started with
one flat table recording everything about an order:

### Unnormalised form (UNF)

| order_id | customer_name | customer_email | products_ordered | vendor_name | vendor_email | order_date |
|---|---|---|---|---|---|---|
| 1 | Rahul Mehta | rahul@customer.com | Laptop×2 @45000, USB-C Cable×3 @120 | ABC Electronics | abc@vendor.com | 2026-08-27 |
| 2 | Priya Nair | priya@customer.com | Cotton T-Shirt×40 @250 | Sharma Textiles | sharma@vendor.com | 2026-09-09 |

Problems: `products_ordered` holds a **repeating group** — several values in
one cell — so it cannot be queried, summed or constrained.

### First normal form (1NF)

*Rule: every attribute holds a single atomic value; no repeating groups.*

Split the repeating group into one row per ordered product:

| order_id | customer_name | customer_email | product_name | qty | unit_price | vendor_name | vendor_email | order_date |
|---|---|---|---|---|---|---|---|---|
| 1 | Rahul Mehta | rahul@customer.com | Laptop | 2 | 45000 | ABC Electronics | abc@vendor.com | 2026-08-27 |
| 1 | Rahul Mehta | rahul@customer.com | USB-C Cable | 3 | 120 | ABC Electronics | abc@vendor.com | 2026-08-27 |
| 2 | Priya Nair | priya@customer.com | Cotton T-Shirt | 40 | 250 | Sharma Textiles | sharma@vendor.com | 2026-09-09 |

Now in 1NF, with composite key `(order_id, product_name)`. But the customer
and vendor details are duplicated on every row.

### Second normal form (2NF)

*Rule: 1NF, and no non-key attribute depends on only part of a composite
key.*

Against the key `(order_id, product_name)`:

- `customer_name`, `customer_email`, `order_date` depend on `order_id`
  alone — a **partial dependency**.
- `unit_price`, `vendor_name` depend on `product_name` alone — another
  **partial dependency**.

So each is moved to a table keyed by what it actually depends on:

```
customers ( customer_id, full_name, email )
products  ( product_id, product_name, price, vendor_name, vendor_email )
orders    ( order_id, customer_id, product_id, quantity, unit_price, order_date )
```

### Third normal form (3NF)

*Rule: 2NF, and no non-key attribute depends on another non-key attribute
(no transitive dependency).*

`products` still violates this:

```
product_id → vendor_name → vendor_email
```

`vendor_email` depends on `vendor_name`, which is not a key. The vendor's
details are repeated on every one of that vendor's products, so changing an
email means updating many rows and risks them disagreeing. Extract the
vendor:

```
vendors   ( vendor_id, company_name, email, password_hash, created_at )
customers ( customer_id, full_name, email, password_hash, created_at )
products  ( product_id, vendor_id → vendors, product_name, price, quantity,
            is_active, created_at, updated_at )
orders    ( order_id, customer_id → customers, product_id → products,
            quantity, unit_price, status, cancellation_reason,
            ordered_at, decided_at )
```

This is the shipped schema, and it is in **3NF**: every non-key attribute
depends on the whole key and nothing but the key. A vendor's name lives in
exactly one row, so the supplier shown to a customer is always resolved by a
join and can never go stale.

### Two deliberate decisions

**`orders.unit_price` is not redundant.** It looks like a copy of
`products.price`, but it is not derivable from it: the vendor may reprice the
product at any time, and the order must keep the price that applied when it
was placed. It is a historical fact about the order, functionally dependent
on `order_id` alone, so it belongs in `orders`. Without it, repricing a
product would silently rewrite the value of every past order.

**Line totals are never stored.** `quantity × unit_price` is computed in
`vw_order_details`, because a stored copy could contradict its inputs.

---

## 9. SQL queries

`database/queries.sql` holds 21 documented, runnable queries. The headline
examples:

### CREATE TABLE

```sql
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
```

### ALTER TABLE

Every constraint is attached explicitly and named:

```sql
ALTER TABLE orders
    ADD CONSTRAINT fk_orders_product
    FOREIGN KEY (product_id) REFERENCES products (product_id)
    ON DELETE RESTRICT;

ALTER TABLE orders
    ADD CONSTRAINT chk_orders_cancellation_reason CHECK (
        (status = 'CANCELLED' AND cancellation_reason IS NOT NULL
                              AND length(btrim(cancellation_reason)) > 0)
        OR
        (status <> 'CANCELLED' AND cancellation_reason IS NULL)
    );
```

### INSERT

```sql
INSERT INTO products (vendor_id, product_name, price, quantity)
VALUES (1, 'Laptop', 45000.00, 20)
RETURNING product_id, product_name, price, quantity;
```

### SELECT with a search filter

The customer's product search — case-insensitive, over orderable products
only:

```sql
SELECT product_id, product_name, price, available_quantity, supplier_name
  FROM vw_available_products
 WHERE product_name ILIKE '%laptop%'
 ORDER BY product_name;
```

### JOIN — resolving the supplier

```sql
SELECT p.product_id, p.product_name, p.price,
       p.quantity AS available_quantity,
       v.company_name AS supplier_name
  FROM products p
  INNER JOIN vendors v ON v.vendor_id = p.vendor_id
 WHERE p.is_active
 ORDER BY v.company_name, p.product_name;
```

### Multi-table JOIN — full order detail

```sql
SELECT o.order_id,
       c.full_name    AS customer,
       p.product_name AS product,
       v.company_name AS supplier,
       o.quantity, o.unit_price,
       (o.quantity * o.unit_price) AS line_total,
       o.status, o.cancellation_reason,
       o.ordered_at::date AS order_date,
       o.ordered_at::time AS order_time
  FROM orders    o
  JOIN customers c ON c.customer_id = o.customer_id
  JOIN products  p ON p.product_id  = o.product_id
  JOIN vendors   v ON v.vendor_id   = p.vendor_id
 ORDER BY o.ordered_at DESC;
```

### LEFT JOIN — keeping products that never sold

An inner join would silently drop them and distort the chart:

```sql
SELECT p.product_name, COALESCE(sum(o.quantity), 0) AS units_sold
  FROM products p
  LEFT JOIN orders o ON o.product_id = p.product_id
                    AND o.status = 'ACCEPTED'
 GROUP BY p.product_id, p.product_name
 ORDER BY units_sold DESC;
```

### GROUP BY with aggregates — revenue per product

```sql
SELECT p.product_name,
       count(o.order_id)              AS orders_accepted,
       sum(o.quantity)                AS units_sold,
       sum(o.quantity * o.unit_price) AS revenue
  FROM orders   o
  JOIN products p ON p.product_id = o.product_id
 WHERE o.status = 'ACCEPTED'
 GROUP BY p.product_id, p.product_name
 ORDER BY revenue DESC;
```

### GROUP BY ... HAVING

`HAVING` filters on the aggregate, which `WHERE` cannot do because
`count()` is not known until after grouping:

```sql
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
```

### Subqueries

Scalar subquery — products priced above the catalogue average:

```sql
SELECT product_name, price
  FROM products
 WHERE is_active
   AND price > (SELECT avg(price) FROM products WHERE is_active);
```

Correlated subquery — each vendor's most expensive product:

```sql
SELECT v.company_name, p.product_name, p.price
  FROM vendors  v
  JOIN products p ON p.vendor_id = v.vendor_id
 WHERE p.is_active
   AND p.price = (SELECT max(p2.price) FROM products p2
                   WHERE p2.vendor_id = v.vendor_id AND p2.is_active);
```

`EXISTS` — which products are safe to hard-delete (the test
`delete_product()` performs):

```sql
SELECT product_id, product_name
  FROM products p
 WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.product_id = p.product_id);
```

`IN` — customers who have ever had an order cancelled:

```sql
SELECT customer_id, full_name, email
  FROM customers
 WHERE customer_id IN (SELECT customer_id FROM orders WHERE status = 'CANCELLED');
```

### UPDATE — with authorisation in the WHERE clause

The `vendor_id` predicate *is* the permission check: with the wrong vendor
the statement updates zero rows rather than someone else's product.

```sql
UPDATE products
   SET price = 43000.00
 WHERE product_id = 1
   AND vendor_id  = 1
   AND is_active
RETURNING product_id, product_name, price, updated_at;
```

### DELETE

```sql
DELETE FROM products
 WHERE product_id = 7
   AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.product_id = 7);
```

### Verifying the inventory rule

Stock on hand beside the units in each order state. Pending units must
never have moved stock:

```sql
SELECT p.product_name,
       p.quantity AS stock_on_hand,
       COALESCE(sum(CASE WHEN o.status = 'PENDING'  THEN o.quantity END), 0) AS units_pending,
       COALESCE(sum(CASE WHEN o.status = 'ACCEPTED' THEN o.quantity END), 0) AS units_accepted,
       COALESCE(sum(CASE WHEN o.status = 'REJECTED' THEN o.quantity END), 0) AS units_rejected
  FROM products p
  LEFT JOIN orders o ON o.product_id = p.product_id
 GROUP BY p.product_id, p.product_name, p.quantity
 ORDER BY p.product_name;
```

---

## 10. Functions, views and triggers

All state changes to orders and inventory go through PL/pgSQL functions in
`database/functions.sql`. A function body runs in a single transaction, so
each one either completes fully or changes nothing — the inventory can never
be decremented without the order also moving to `ACCEPTED`. Each function
also takes the acting vendor's id and checks ownership itself, so
authorisation is enforced by the database rather than only by the API.

### Functions

| Function | What it does |
|---|---|
| `place_order(customer_id, product_id, quantity) → order_id` | Locks the product row, refuses an out-of-stock, archived or over-quantity request with the message `Only N units are currently available.`, snapshots the price, inserts a `PENDING` order. **Does not touch stock.** |
| `accept_order(order_id, vendor_id)` | Verifies ownership, verifies the order is still `PENDING`, re-checks stock, decrements `products.quantity`, sets `ACCEPTED` — atomically. |
| `reject_order(order_id, vendor_id)` | Verifies ownership and pending status, sets `REJECTED`. Stock untouched. |
| `cancel_order(order_id, vendor_id, reason)` | Requires a non-blank reason, allows `PENDING` or `ACCEPTED`, returns the units to stock if they had been deducted, stores the reason. |
| `update_product_price(product_id, vendor_id, price)` | Repricing with the ownership test in the `WHERE` clause. |
| `delete_product(product_id, vendor_id) → 'deleted' \| 'archived'` | Hard-deletes a never-ordered product; soft-deletes one with order history. |

`accept_order` and `place_order` use `SELECT ... FOR UPDATE` on the product
row, so two concurrent requests cannot both pass the availability check
against the same last units. Locks are always taken in the order
`orders → products` to avoid deadlocks.

### Views

| View | Purpose |
|---|---|
| `vw_available_products` | The customer catalogue. Joins `products → vendors` and filters to `is_active AND quantity > 0`, so nothing unorderable is ever listed. |
| `vw_order_details` | One fully-resolved row per order, joining all four tables and computing `line_total`. Both dashboards read it, filtered by `vendor_id` or `customer_id`. |
| `vw_vendor_product_sales` | Aggregated sales per product, counting `ACCEPTED` orders only, with a `LEFT JOIN` so unsold products stay at zero. |

### Triggers

| Trigger | Purpose |
|---|---|
| `trg_products_updated_at` | Sets `products.updated_at = now()` on every update, so the timestamp cannot be forgotten or faked by the application. |
| `trg_vendors_email_unique` / `trg_customers_email_unique` | `UNIQUE` only applies within one table, so these stop the same email being registered as both a vendor and a customer. |

No trigger silently changes business data — inventory movement is explicit
in the functions, where it can be read and reasoned about.

---

## 11. Business rules

1. **A product belongs to exactly one vendor.** Enforced by
   `products.vendor_id NOT NULL` with a foreign key to `vendors`.
2. **A vendor can add, reprice and delete only their own products.**
   `update_product_price()` and `delete_product()` both take the acting
   vendor and refuse anything they do not own; the API never accepts a
   vendor id from the request.
3. **A customer can browse products from all vendors.** Served by
   `vw_available_products`, which resolves each supplier through the foreign
   key rather than storing a copy of the name.
4. **A customer cannot order more than the available quantity.** Checked in
   `place_order()` against a locked product row; the customer sees
   `Only N units are currently available.` The frontend checks too, for a
   faster message, but the database is what actually prevents it.
5. **Quantity decreases only when the vendor accepts.** `accept_order()` is
   the only code path that decrements `products.quantity`, and it does so in
   the same transaction that sets the status.
6. **Rejected orders do not reduce inventory.** `reject_order()` touches
   only `orders.status`.
7. **Cancelled orders require a cancellation reason.** Enforced twice: by
   `cancel_order()`, and by the `chk_orders_cancellation_reason` CHECK
   constraint, which also forbids a reason on a non-cancelled order. A
   cancellation with no stored reason is not representable.
8. **The cancellation reason is visible to both vendor and customer.**
   Stored in `orders.cancellation_reason`, exposed by `vw_order_details`,
   and rendered on both the vendor's incoming-orders page and the customer's
   order history.
9. **Only authorised users reach their own dashboard.** The role is carried
   in the signed JWT; `require_vendor` / `require_customer` reject the wrong
   role with 403; and no endpoint accepts a user id from the URL or body, so
   changing an id cannot reach another account's data.

Additional rule not in the original list but needed for consistency:
cancelling an order that had already been **accepted** returns its units to
stock, since acceptance had removed them.

---

## 12. Security

| Concern | How it is handled |
|---|---|
| Database credentials | Only in `backend/.env`, which is git-ignored. `.env.example` is the committed template. The app refuses to start if `DATABASE_URL` is missing. |
| Supabase keys | The service-role key is never used and never reaches the frontend. The browser talks only to the API; only the backend holds database credentials. |
| JWT secret | From `JWT_SECRET` in the environment; required at import time, so the app cannot start with a default. |
| Password storage | bcrypt hashes. Plaintext passwords are never stored or logged. |
| Vendor isolation | Ownership is re-checked inside the PL/pgSQL functions, so it holds even if a request reaches the database by another route. |
| Customer isolation | `orders/mine` filters by the id from the token, never from the request. |
| URL tampering | No endpoint takes a user id as a parameter. Editing the URL or the role in `localStorage` changes nothing, because the server reads the role from the signed token. |
| Server-side validation | Pydantic validates shapes, and every rule is *also* a CHECK constraint or a function check. Frontend validation is only for fast feedback. |
| Account enumeration | Login returns one identical message for an unknown email and a wrong password. |
| CORS | Restricted to the dev frontend origin, configurable via `CORS_ORIGINS`. It was previously `["*"]`. |

**On Row Level Security.** RLS is not used, and under this architecture it
would add complexity without adding protection: the browser never connects
to PostgreSQL, so there is no untrusted client holding database credentials
for RLS to constrain. The equivalent guarantee is provided by the
ownership checks inside the PL/pgSQL functions, which is where the security
boundary actually sits. RLS would become necessary if the frontend were ever
changed to query Supabase directly with an anon key — at that point every
table would need policies keyed on `auth.uid()`.

---

## 13. Testing

Three harnesses, 125 checks, all run against a live PostgreSQL. See
`tests/README.md`.

| Harness | Scope | Result |
|---|---|---|
| `tests/test_business_rules.sql` | 44 checks at the database level: constraints, the inventory rule, vendor isolation, the delete strategy, catalogue visibility | **44 / 44 passed** |
| `tests/test_api.py` | 67 end-to-end checks over HTTP, covering all 8 required scenarios | **67 / 67 passed** |
| `tests/test_ui_contract.py` | 14 checks that every field the React pages read exists in the live API responses, in the shape the UI assumes | **14 / 14 passed** |

Verified against PostgreSQL 16.15; the frontend builds clean with
`npm run build`. Scenario coverage:

| Scenario | Expected | Verified |
|---|---|---|
| 1. Vendor registers, logs in, creates a product | Product tied to that vendor | ✅ |
| 2. Customer registers, logs in, searches, views supplier | Supplier resolved by join | ✅ |
| 3. Customer orders a valid quantity | Order `PENDING`, **stock unchanged** | ✅ 10 → 10 |
| 4. Customer orders more than available | Refused before creation | ✅ `Only 10 units are currently available.` |
| 5. Vendor accepts | `ACCEPTED`, stock decreases | ✅ 10 → 7 |
| 6. Vendor rejects | `REJECTED`, stock unchanged | ✅ stays 7 |
| 7. Vendor cancels with reason | `CANCELLED`, reason stored and shown to both | ✅ |
| 8. Vendor modifies another vendor's product | Denied | ✅ `Product not found in your catalogue.` |

Also verified: accepting twice does not double-decrement; a blank or missing
cancellation reason is refused; a customer token cannot reach any vendor
endpoint and vice versa; a forged or absent token is rejected; a new
customer sees none of another customer's orders; deleting an ordered product
archives it and the order history survives; and vendor B's sales figures are
zero rather than vendor A's.

**Not yet covered:** the pages have not been walked through in a real
browser, so the data contract and the production build are verified but the
rendered layout is not. Run `npm run dev` and click through both portals
before the demo, and capture the screenshots listed below while doing so.

---

## 14. Screenshots

> Add the following screenshots to a `docs/screenshots/` folder and they
> will render here.

| Screen | Image |
|---|---|
| Login | `![Login](docs/screenshots/login.png)` |
| Registration | `![Register](docs/screenshots/register.png)` |
| Vendor — add product | `![Add product](docs/screenshots/vendor-add-product.png)` |
| Vendor — product management | `![Products](docs/screenshots/vendor-products.png)` |
| Vendor — incoming orders | `![Vendor orders](docs/screenshots/vendor-orders.png)` |
| Vendor — cancellation dialog | `![Cancel](docs/screenshots/vendor-cancel.png)` |
| Vendor — sales charts | `![Sales](docs/screenshots/vendor-sales.png)` |
| Customer — product listing | `![Catalogue](docs/screenshots/customer-shop.png)` |
| Customer — search | `![Search](docs/screenshots/customer-search.png)` |
| Customer — product details | `![Product detail](docs/screenshots/customer-product-detail.png)` |
| Customer — order history | `![My orders](docs/screenshots/customer-orders.png)` |
| Cancellation reason shown to customer | `![Reason](docs/screenshots/cancellation-reason.png)` |

---

## 15. Team contributions

> Replace the names below with the actual team members.

| Member | Area | Contribution |
|---|---|---|
| **Member 1** | Database design | ER model and relational schema, normalisation to 3NF, `tables.sql` and `constraints.sql`, the referential-integrity strategy for product deletion, indexes |
| **Member 2** | SQL logic | The order-workflow functions in `functions.sql` (place/accept/reject/cancel), row locking and transaction handling, the three views, `queries.sql`, `seed.sql` |
| **Member 3** | Backend | FastAPI routers, JWT authentication and the role dependencies, mapping database errors to API responses, environment-based configuration, the API test suite |
| **Member 4** | Frontend | React pages for both roles, the cream-and-green design system, product search, the order and cancellation dialogs, the Recharts sales views, responsive layout |

Shared: requirement analysis, end-to-end testing, and this documentation.
