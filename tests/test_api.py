"""End-to-end API test: the 8 scenarios from the requirements."""
import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
passed, failed = 0, 0


def call(method, path, body=None, token=None):
    req = urllib.request.Request(f"{BASE}{path}", method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data, timeout=10) as r:
            return r.status, json.loads(r.read() or "null")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or "null")
        except Exception:
            return e.code, {"detail": raw.decode(errors="replace")}


def check(label, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"PASS  {label}   {detail}")
    else:
        failed += 1
        print(f"FAIL  {label}   {detail}")


def section(t):
    print(f"\n===== {t} =====")


import time
suffix = f"e2e_{int(time.time())}"
V_EMAIL = f"vendor.{suffix}@test.com"
V2_EMAIL = f"vendor2.{suffix}@test.com"
C_EMAIL = f"cust.{suffix}@test.com"
C2_EMAIL = f"cust2.{suffix}@test.com"
PW = "secret123"

P_NAME = f"E2E Laptop {suffix}"

# ---------------------------------------------------------
section("SCENARIO 1: vendor registers, logs in, creates a product")
# ---------------------------------------------------------
st, r = call("POST", "/auth/register/vendor",
             {"company_name": "E2E Supplies", "email": V_EMAIL, "password": PW})
check("vendor registration returns 201 + token", st == 201 and "access_token" in r, f"status={st}")
vtok = r.get("access_token")
check("token reports the vendor role", r.get("role") == "vendor", f"role={r.get('role')}")

st, r = call("POST", "/auth/register/vendor",
             {"company_name": "Dup Co", "email": V_EMAIL, "password": PW})
check("duplicate email is refused (409)", st == 409, f"status={st} detail={r.get('detail')}")

st, r = call("POST", "/auth/login", {"email": V_EMAIL, "password": PW, "role": "vendor"})
check("vendor login works", st == 200 and "access_token" in r, f"status={st}")
vtok = r["access_token"]

st, r = call("POST", "/auth/login", {"email": V_EMAIL, "password": "wrongpw", "role": "vendor"})
check("wrong password is refused (401)", st == 401, f"status={st}")

st, r = call("POST", "/products/mine",
             {"product_name": P_NAME, "price": "50000.00", "quantity": 10}, vtok)
check("vendor adds a product (201)", st == 201, f"status={st} {r}")
pid = r.get("product_id")
check("product starts at quantity 10", r.get("quantity") == 10, f"quantity={r.get('quantity')}")

st, r = call("GET", "/products/mine", token=vtok)
check("vendor sees own product in their catalogue",
      any(p["product_id"] == pid for p in r), f"count={len(r)}")

# second vendor, for the isolation tests
st, r = call("POST", "/auth/register/vendor",
             {"company_name": "Other Vendor", "email": V2_EMAIL, "password": PW})
v2tok = r["access_token"]
st, r = call("GET", "/products/mine", token=v2tok)
check("a new vendor sees an empty catalogue, not vendor 1's", r == [], f"rows={len(r)}")

# ---------------------------------------------------------
section("SCENARIO 2: customer registers, logs in, searches, sees the supplier")
# ---------------------------------------------------------
st, r = call("POST", "/auth/register/customer",
             {"full_name": "E2E Buyer", "email": C_EMAIL, "password": PW})
check("customer registration returns 201", st == 201, f"status={st}")
ctok = r["access_token"]

st, r = call("POST", "/auth/login", {"email": C_EMAIL, "password": PW, "role": "customer"})
check("customer login works", st == 200, f"status={st}")
ctok = r["access_token"]

st, r = call("POST", "/auth/login", {"email": C_EMAIL, "password": PW, "role": "vendor"})
check("customer cannot log in through the vendor role", st == 401, f"status={st}")

st, r = call("GET", "/products", token=ctok)
check("customer sees products from multiple vendors",
      len({p["supplier_name"] for p in r}) > 1,
      f"suppliers={sorted({p['supplier_name'] for p in r})}")

import urllib.parse
st, r = call("GET", f"/products?search={urllib.parse.quote(P_NAME)}", token=ctok)
check("search by name finds the product", len(r) == 1 and r[0]["product_id"] == pid, f"hits={len(r)}")
check("search result carries the supplier name",
      r[0]["supplier_name"] == "E2E Supplies", f"supplier={r[0]['supplier_name']}")

st, r = call("GET", "/products?search=zzzznotathing", token=ctok)
check("search with no match returns empty", r == [], f"rows={len(r)}")

st, r = call("GET", f"/products/{pid}", token=ctok)
check("product detail shows name, price, qty and supplier",
      all(k in r for k in ("product_name", "price", "available_quantity", "supplier_name")),
      f"supplier={r.get('supplier_name')} qty={r.get('available_quantity')}")

st, r = call("GET", "/products", token=ctok)
check("out-of-stock products are not listed",
      all(p["available_quantity"] > 0 for p in r), "all listed rows have qty > 0")

# ---------------------------------------------------------
section("SCENARIO 3: customer orders a valid quantity")
# ---------------------------------------------------------
st, r = call("POST", "/orders", {"product_id": pid, "quantity": 3}, ctok)
check("order accepted (201) and starts PENDING",
      st == 201 and r.get("status") == "PENDING", f"status={st} {r}")
oid = r.get("order_id")

st, r = call("GET", f"/products/{pid}", token=ctok)
check("REQ 4: stock still 10 while the order is PENDING",
      r["available_quantity"] == 10, f"available={r['available_quantity']}")

# ---------------------------------------------------------
section("SCENARIO 4: customer orders more than is available")
# ---------------------------------------------------------
st, r = call("POST", "/orders", {"product_id": pid, "quantity": 11}, ctok)
check("over-quantity order is refused (400)", st == 400, f"status={st}")
check("error names the real availability",
      r.get("detail") == "Only 10 units are currently available.", f"detail={r.get('detail')}")

st, r = call("POST", "/orders", {"product_id": pid, "quantity": 0}, ctok)
check("zero-quantity order is refused (422)", st == 422, f"status={st}")

st, r = call("POST", "/orders", {"product_id": pid, "quantity": -5}, ctok)
check("negative-quantity order is refused (422)", st == 422, f"status={st}")

st, r = call("GET", "/orders/mine", token=ctok)
check("only the one valid order was created", len([o for o in r if o["product_id"] == pid]) == 1,
      f"orders for this product={len([o for o in r if o['product_id'] == pid])}")

# ---------------------------------------------------------
section("SCENARIO 5: vendor accepts -> inventory decreases")
# ---------------------------------------------------------
st, r = call("GET", "/orders/incoming", token=vtok)
check("vendor sees the incoming order", any(o["order_id"] == oid for o in r), f"count={len(r)}")
row = next(o for o in r if o["order_id"] == oid)
check("incoming order shows customer, product, qty, date and status",
      row["customer_name"] == "E2E Buyer" and row["product_name"] == P_NAME
      and row["quantity"] == 3 and row["status"] == "PENDING" and row["ordered_at"],
      f"{row['customer_name']} / {row['product_name']} / qty {row['quantity']} / {row['ordered_at']}")

st, r = call("POST", f"/orders/{oid}/accept", token=v2tok)
check("SCENARIO 8: another vendor cannot accept this order", st == 400,
      f"status={st} detail={r.get('detail')}")

st, r = call("POST", f"/orders/{oid}/accept", token=vtok)
check("owner accepts the order (200)", st == 200 and r.get("status") == "ACCEPTED", f"{st} {r}")

st, r = call("GET", "/products/mine", token=vtok)
prod = next(p for p in r if p["product_id"] == pid)
check("REQ 11: stock dropped 10 -> 7 on acceptance", prod["quantity"] == 7,
      f"quantity={prod['quantity']}")

st, r = call("POST", f"/orders/{oid}/accept", token=vtok)
check("accepting twice is refused", st == 400, f"detail={r.get('detail')}")

st, r = call("GET", "/products/mine", token=vtok)
prod = next(p for p in r if p["product_id"] == pid)
check("double-accept did not double-decrement", prod["quantity"] == 7, f"quantity={prod['quantity']}")

# ---------------------------------------------------------
section("SCENARIO 6: vendor rejects -> inventory unchanged")
# ---------------------------------------------------------
st, r = call("POST", "/orders", {"product_id": pid, "quantity": 2}, ctok)
rid = r["order_id"]
st, r = call("POST", f"/orders/{rid}/reject", token=vtok)
check("reject succeeds", st == 200 and r.get("status") == "REJECTED", f"{st} {r}")

st, r = call("GET", "/products/mine", token=vtok)
prod = next(p for p in r if p["product_id"] == pid)
check("REQ 12: stock still 7 after a rejection", prod["quantity"] == 7, f"quantity={prod['quantity']}")

st, r = call("GET", "/orders/mine", token=ctok)
o = next(o for o in r if o["order_id"] == rid)
check("rejected order carries no cancellation reason", o["cancellation_reason"] is None,
      f"reason={o['cancellation_reason']}")

# ---------------------------------------------------------
section("SCENARIO 7: vendor cancels with a mandatory reason")
# ---------------------------------------------------------
st, r = call("POST", "/orders", {"product_id": pid, "quantity": 1}, ctok)
cid = r["order_id"]

st, r = call("POST", f"/orders/{cid}/cancel", {"reason": ""}, vtok)
check("empty cancellation reason is refused (422)", st == 422, f"status={st}")

st, r = call("POST", f"/orders/{cid}/cancel", {}, vtok)
check("missing cancellation reason is refused (422)", st == 422, f"status={st}")

REASON = "Product failed quality inspection."
st, r = call("POST", f"/orders/{cid}/cancel", {"reason": REASON}, vtok)
check("cancel with a reason succeeds", st == 200 and r.get("status") == "CANCELLED", f"{st} {r}")

st, r = call("GET", "/orders/incoming", token=vtok)
o = next(o for o in r if o["order_id"] == cid)
check("REQ 13: reason is visible on the VENDOR dashboard",
      o["status"] == "CANCELLED" and o["cancellation_reason"] == REASON,
      f"reason={o['cancellation_reason']}")

st, r = call("GET", "/orders/mine", token=ctok)
o = next(o for o in r if o["order_id"] == cid)
check("REQ 13: reason is visible on the CUSTOMER dashboard",
      o["status"] == "CANCELLED" and o["cancellation_reason"] == REASON,
      f"reason={o['cancellation_reason']}")
check("REQ 14: customer history has product, supplier, qty, price, date, status",
      all(o[k] is not None for k in
          ("product_name", "supplier_name", "quantity", "unit_price", "line_total",
           "ordered_at", "status")),
      f"{o['product_name']} / {o['supplier_name']} / {o['quantity']} x {o['unit_price']}")

# cancelling an ACCEPTED order returns the units
st, r = call("POST", "/orders", {"product_id": pid, "quantity": 4}, ctok)
aid = r["order_id"]
call("POST", f"/orders/{aid}/accept", token=vtok)
st, r = call("GET", "/products/mine", token=vtok)
check("accepted 4 more: 7 -> 3",
      next(p for p in r if p["product_id"] == pid)["quantity"] == 3,
      f"quantity={next(p for p in r if p['product_id'] == pid)['quantity']}")
call("POST", f"/orders/{aid}/cancel", {"reason": "Courier lost the consignment."}, vtok)
st, r = call("GET", "/products/mine", token=vtok)
check("cancelling an accepted order returned the 4 units (3 -> 7)",
      next(p for p in r if p["product_id"] == pid)["quantity"] == 7,
      f"quantity={next(p for p in r if p['product_id'] == pid)['quantity']}")

# ---------------------------------------------------------
section("SCENARIO 7B: vendor restocks inventory")
# ---------------------------------------------------------
st, r = call("PATCH", f"/products/mine/{pid}/stock", {"added_quantity": 5}, v2tok)
check("vendor B cannot restock vendor A's product", st == 400, f"status={st} detail={r.get('detail')}")

st, r = call("PATCH", f"/products/mine/{pid}/stock", {"added_quantity": 0}, vtok)
check("restocking with 0 is refused (422)", st == 422, f"status={st}")

st, r = call("PATCH", f"/products/mine/{pid}/stock", {"added_quantity": -3}, vtok)
check("restocking with negative quantity is refused (422)", st == 422, f"status={st}")

st, r = call("PATCH", f"/products/mine/{pid}/stock", {"added_quantity": 5}, vtok)
check("vendor can restock product (7 -> 12)", st == 200 and r.get("quantity") == 12,
      f"status={st} quantity={r.get('quantity')}")

st, r = call("GET", "/products/mine", token=vtok)
check("catalogue confirms restocked quantity 12",
      next(p for p in r if p["product_id"] == pid)["quantity"] == 12,
      f"quantity={next(p for p in r if p['product_id'] == pid)['quantity']}")

st, r = call("GET", f"/products/{pid}", token=ctok)
check("customer sees updated available quantity 12",
      r.get("available_quantity") == 12, f"available={r.get('available_quantity')}")

# ---------------------------------------------------------
section("SCENARIO 7C: shipping details and customer self-service cancellation")
# ---------------------------------------------------------
SHIP_ADDR = "Flat 402, Green Valley Apartments, Bengaluru"
SHIP_PHONE = "+91 98765 43210"
st, r = call("POST", "/orders",
             {"product_id": pid, "quantity": 2, "shipping_address": SHIP_ADDR, "contact_phone": SHIP_PHONE},
             ctok)
check("customer places order with shipping address & phone",
      st == 201 and r.get("status") == "PENDING", f"status={st} {r}")
cust_oid = r["order_id"]
check("order response includes shipping address", r.get("shipping_address") == SHIP_ADDR,
      f"shipping_address={r.get('shipping_address')}")
check("order response includes contact phone", r.get("contact_phone") == SHIP_PHONE,
      f"contact_phone={r.get('contact_phone')}")

st, r = call("GET", "/orders/incoming", token=vtok)
v_row = next((o for o in r if o["order_id"] == cust_oid), None)
check("vendor sees shipping address on incoming order",
      v_row is not None and v_row.get("shipping_address") == SHIP_ADDR,
      f"shipping_address={v_row.get('shipping_address') if v_row else None}")
check("vendor sees contact phone on incoming order",
      v_row is not None and v_row.get("contact_phone") == SHIP_PHONE,
      f"contact_phone={v_row.get('contact_phone') if v_row else None}")

st, r = call("GET", "/orders/mine", token=ctok)
c_row = next((o for o in r if o["order_id"] == cust_oid), None)
check("customer sees shipping details on order history",
      c_row is not None and c_row.get("shipping_address") == SHIP_ADDR,
      f"shipping_address={c_row.get('shipping_address') if c_row else None}")

# Customer 2 registration for isolation checks
st, r = call("POST", "/auth/register/customer",
             {"full_name": "Second Buyer", "email": C2_EMAIL, "password": PW})
c2tok = r["access_token"]

# Customer 2 cannot cancel customer 1's order
st, r = call("POST", f"/orders/{cust_oid}/cancel-my-order", token=c2tok)
check("customer B cannot cancel customer A's order", st == 400, f"status={st} detail={r.get('detail')}")

# Customer 1 cancels their own pending order
st, r = call("POST", f"/orders/{cust_oid}/cancel-my-order", token=ctok)
check("customer cancels their own pending order",
      st == 200 and r.get("status") == "CANCELLED" and r.get("cancellation_reason") == "Cancelled by customer",
      f"status={st} {r}")

# Customer cannot cancel an already accepted order
st, r = call("POST", "/orders", {"product_id": pid, "quantity": 1}, ctok)
acc_oid = r["order_id"]
call("POST", f"/orders/{acc_oid}/accept", token=vtok)
st, r = call("POST", f"/orders/{acc_oid}/cancel-my-order", token=ctok)
check("customer cannot cancel an accepted order", st == 400, f"status={st} detail={r.get('detail')}")

# Vendor cancels the accepted order to return stock and maintain test isolation
call("POST", f"/orders/{acc_oid}/cancel", {"reason": "Cancelled by agreement."}, vtok)

# ---------------------------------------------------------
section("SCENARIO 8: authorisation and cross-account isolation")
# ---------------------------------------------------------
st, r = call("PATCH", f"/products/mine/{pid}/price", {"price": "1.00"}, v2tok)
check("vendor B cannot reprice vendor A's product", st == 400, f"status={st} detail={r.get('detail')}")
st, r = call("GET", "/products/mine", token=vtok)
check("price was untouched by the denied attempt",
      float(next(p for p in r if p["product_id"] == pid)["price"]) == 50000.0,
      f"price={next(p for p in r if p['product_id'] == pid)['price']}")

st, r = call("PATCH", f"/products/mine/{pid}/price", {"price": "47500.00"}, vtok)
check("owner can reprice their own product", st == 200 and float(r["price"]) == 47500.0,
      f"price={r.get('price')}")

st, r = call("DELETE", f"/products/mine/{pid}", token=v2tok)
check("vendor B cannot delete vendor A's product", st == 400, f"status={st}")

st, r = call("PATCH", f"/products/mine/{pid}/price", {"price": "9.00"}, ctok)
check("a customer token cannot use a vendor endpoint (403)", st == 403, f"status={st}")

st, r = call("GET", "/products/mine", token=ctok)
check("a customer cannot open the vendor catalogue (403)", st == 403, f"status={st}")

st, r = call("GET", "/orders/incoming", token=ctok)
check("a customer cannot read the vendor order queue (403)", st == 403, f"status={st}")

st, r = call("GET", "/products", token=vtok)
check("a vendor cannot browse the customer catalogue (403)", st == 403, f"status={st}")

st, r = call("GET", "/orders/mine", token=vtok)
check("a vendor cannot read customer order history (403)", st == 403, f"status={st}")

st, r = call("GET", "/orders/mine")
check("no token at all is rejected (401)", st == 401, f"status={st}")

st, r = call("GET", "/orders/mine", token="not.a.real.token")
check("a forged token is rejected (401)", st == 401, f"status={st}")

# a second customer must not see the first customer's orders
st, r = call("GET", "/orders/mine", token=c2tok)
check("a new customer sees none of the other customer's orders", r == [], f"rows={len(r)}")

st, r = call("POST", f"/orders/{oid}/accept", token=c2tok)
check("a customer cannot accept an order (403)", st == 403, f"status={st}")

# ---------------------------------------------------------
section("DELETE strategy and sales analytics")
# ---------------------------------------------------------
st, r = call("DELETE", f"/products/mine/{pid}", token=vtok)
check("deleting an ordered product archives it instead", st == 200 and r["outcome"] == "archived",
      f"{r}")
st, r = call("GET", "/orders/mine", token=ctok)
check("the customer's order history survived the archive",
      any(o["product_id"] == pid for o in r), f"rows={len(r)}")
st, r = call("GET", f"/products/{pid}", token=ctok)
check("the archived product is no longer orderable (404)", st == 404, f"status={st}")

st, r = call("POST", "/products/mine",
             {"product_name": "Never Ordered Item", "price": "10.00", "quantity": 5}, vtok)
npid = r["product_id"]
st, r = call("DELETE", f"/products/mine/{npid}", token=vtok)
check("a never-ordered product is hard-deleted", st == 200 and r["outcome"] == "deleted", f"{r}")

st, r = call("GET", "/sales/summary", token=vtok)
check("sales summary returns real figures", st == 200 and "total_revenue" in r, f"status={st}")
check("revenue counts only ACCEPTED orders (1 accepted x 3 x 50000 = 150000)",
      float(r["total_revenue"]) == 150000.0, f"total_revenue={r['total_revenue']}")
check("accepted_orders = 1 (the rejected/cancelled ones are excluded)",
      r["accepted_orders"] == 1, f"accepted_orders={r['accepted_orders']}")
check("sales_by_product has real rows", len(r["sales_by_product"]) >= 1,
      f"{[(p['product_name'], str(p['revenue'])) for p in r['sales_by_product']]}")
check("orders_over_time has real rows", len(r["orders_over_time"]) >= 1,
      f"days={[d['order_day'] for d in r['orders_over_time']]}")

st, r = call("GET", "/sales/summary", token=ctok)
check("a customer cannot read vendor sales (403)", st == 403, f"status={st}")

st, r = call("GET", "/sales/summary", token=v2tok)
check("vendor B's sales are zero, not vendor A's", float(r["total_revenue"]) == 0.0,
      f"total_revenue={r['total_revenue']}")

print(f"\n================  {passed} passed, {failed} failed  ================")
raise SystemExit(1 if failed else 0)
