"""Verify every field the frontend components read exists in the live API
responses. Catches the "page renders but every cell is blank" class of bug
that a build cannot detect."""
import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
ok = bad = 0


def call(method, path, body=None, token=None):
    req = urllib.request.Request(f"{BASE}{path}", method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data, timeout=15) as r:
            return r.status, json.loads(r.read() or "null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or "null")


def check(label, obj, fields):
    """Assert every named field is present (may be null) on obj."""
    global ok, bad
    if obj is None:
        print(f"FAIL  {label}: no object returned")
        bad += 1
        return
    missing = [f for f in fields if f not in obj]
    if missing:
        print(f"FAIL  {label}: missing {missing}")
        bad += 1
    else:
        print(f"OK    {label}: all {len(fields)} fields present")
        ok += 1


PW = "password123"
_, v = call("POST", "/auth/login", {"email": "abc@vendor.com", "password": PW, "role": "vendor"})
check("Login/Register session (access_token, role, name)", v, ["access_token", "role", "name"])
vtok = v["access_token"]

_, c = call("POST", "/auth/login",
            {"email": "rahul@customer.com", "password": PW, "role": "customer"})
ctok = c["access_token"]

# --- VendorProducts.jsx ---
_, rows = call("GET", "/products/mine", token=vtok)
check("VendorProducts row", rows[0] if rows else None,
      ["product_id", "product_name", "price", "quantity", "created_at", "updated_at"])

# --- VendorOrders.jsx ---
_, rows = call("GET", "/orders/incoming", token=vtok)
check("VendorOrders row", rows[0] if rows else None,
      ["order_id", "customer_name", "product_name", "quantity", "line_total",
       "unit_price", "ordered_at", "status", "cancellation_reason"])
cancelled = next((o for o in rows if o["status"] == "CANCELLED"), None)
if cancelled and cancelled["cancellation_reason"]:
    print(f"OK    VendorOrders shows a stored reason: {cancelled['cancellation_reason'][:52]}…")
    ok += 1
else:
    print("FAIL  VendorOrders: no cancelled order with a reason in seed data")
    bad += 1

# --- VendorSales.jsx ---
_, s = call("GET", "/sales/summary", token=vtok)
check("VendorSales summary", s,
      ["total_revenue", "accepted_orders", "pending_orders",
       "sales_by_product", "orders_over_time"])
check("VendorSales sales_by_product row", s["sales_by_product"][0] if s["sales_by_product"] else None,
      ["product_name", "orders_accepted", "units_sold", "revenue"])
check("VendorSales orders_over_time row", s["orders_over_time"][0] if s["orders_over_time"] else None,
      ["order_day", "order_count", "accepted_count", "revenue"])

# The chart parses order_day with new Date(`${day}T00:00:00`).
day = s["orders_over_time"][0]["order_day"]
if len(day) == 10 and day[4] == "-" and day[7] == "-":
    print(f"OK    order_day is YYYY-MM-DD as the chart expects: {day}")
    ok += 1
else:
    print(f"FAIL  order_day is not YYYY-MM-DD: {day!r}")
    bad += 1

# --- CustomerShop.jsx ---
_, rows = call("GET", "/products", token=ctok)
check("CustomerShop row", rows[0] if rows else None,
      ["product_id", "product_name", "price", "available_quantity",
       "vendor_id", "supplier_name"])
_, one = call("GET", f"/products/{rows[0]['product_id']}", token=ctok)
check("CustomerShop product detail", one,
      ["product_name", "price", "available_quantity", "supplier_name"])

# --- CustomerOrders.jsx ---
_, rows = call("GET", "/orders/mine", token=ctok)
check("CustomerOrders row", rows[0] if rows else None,
      ["order_id", "product_name", "supplier_name", "quantity", "line_total",
       "unit_price", "ordered_at", "status", "cancellation_reason"])
cancelled = next((o for o in rows if o["status"] == "CANCELLED"), None)
if cancelled and cancelled["cancellation_reason"]:
    print(f"OK    CustomerOrders shows the same stored reason: {cancelled['cancellation_reason'][:52]}…")
    ok += 1
else:
    print("FAIL  CustomerOrders: no cancelled order with a reason")
    bad += 1

# status values must match the CSS class names .status.PENDING etc.
_, vrows = call("GET", "/orders/incoming", token=vtok)
statuses = sorted({o["status"] for o in vrows})
allowed = {"PENDING", "ACCEPTED", "REJECTED", "CANCELLED"}
if set(statuses) <= allowed:
    print(f"OK    status values match the CSS pill classes: {statuses}")
    ok += 1
else:
    print(f"FAIL  unexpected status values: {statuses}")
    bad += 1

# The delete endpoint response shape the UI reads.
_, created = call("POST", "/products/mine",
                  {"product_name": "Contract Check Item", "price": "5.00", "quantity": 1}, vtok)
_, res = call("DELETE", f"/products/mine/{created['product_id']}", token=vtok)
check("delete response", res, ["outcome", "message"])

print(f"\n================  {ok} OK, {bad} bad  ================")
raise SystemExit(1 if bad else 0)
