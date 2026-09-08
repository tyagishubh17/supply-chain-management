"""Order endpoints.

Customer: place an order, see own order history.
Vendor: see incoming orders for own products, then accept / reject / cancel.

Every state change delegates to a PL/pgSQL function, so the quantity check,
the ownership check and the inventory update happen in one transaction
inside the database rather than as separate API steps.
"""

from fastapi import APIRouter, Depends

from app.auth import require_customer, require_vendor
from app.database import call_function, fetch_all
from app.schemas import CancelRequest, Order, OrderCreate

router = APIRouter(prefix="/orders", tags=["orders"])

# vw_order_details already joins orders -> customers, products, vendors.
_ORDER_COLUMNS = """
    order_id, status, quantity, unit_price, line_total, cancellation_reason,
    ordered_at, decided_at, customer_name, product_id, product_name, supplier_name
"""


# =========================================================
# Customer
# =========================================================
@router.post("", status_code=201)
def place_order(body: OrderCreate, customer: dict = Depends(require_customer)):
    """Requirements 7 and 8.

    place_order() rejects a quantity above what is available and returns
    the database's own message ("Only N units are currently available."),
    so the check cannot be bypassed by calling the API directly. The
    product quantity is deliberately left untouched here.
    """
    row = call_function(
        "SELECT place_order(%s, %s, %s) AS order_id",
        (customer["id"], body.product_id, body.quantity),
    )
    return {"order_id": row["order_id"], "status": "PENDING"}


@router.get("/mine", response_model=list[Order])
def my_orders(customer: dict = Depends(require_customer)):
    """Requirement 14 -- own order history only, including the cancellation
    reason when a vendor has cancelled."""
    return fetch_all(
        f"SELECT {_ORDER_COLUMNS} FROM vw_order_details "
        f"WHERE customer_id = %s ORDER BY ordered_at DESC",
        (customer["id"],),
    )


# =========================================================
# Vendor
# =========================================================
@router.get("/incoming", response_model=list[Order])
def incoming_orders(vendor: dict = Depends(require_vendor)):
    """Requirement 10 -- orders for this vendor's products only. Pending
    ones first, since those are the ones needing a decision."""
    return fetch_all(
        f"""
        SELECT {_ORDER_COLUMNS} FROM vw_order_details
         WHERE vendor_id = %s
         ORDER BY (status = 'PENDING') DESC, ordered_at DESC
        """,
        (vendor["id"],),
    )


@router.post("/{order_id}/accept")
def accept_order(order_id: int, vendor: dict = Depends(require_vendor)):
    """Requirement 11 -- the single place inventory decreases. Verifying
    the order is pending, re-verifying stock, decrementing the product and
    setting the status all happen atomically in accept_order()."""
    call_function("SELECT accept_order(%s, %s)", (order_id, vendor["id"]))
    return {"order_id": order_id, "status": "ACCEPTED"}


@router.post("/{order_id}/reject")
def reject_order(order_id: int, vendor: dict = Depends(require_vendor)):
    """Requirement 12 -- status only; inventory is not touched."""
    call_function("SELECT reject_order(%s, %s)", (order_id, vendor["id"]))
    return {"order_id": order_id, "status": "REJECTED"}


@router.post("/{order_id}/cancel")
def cancel_order(order_id: int, body: CancelRequest, vendor: dict = Depends(require_vendor)):
    """Requirement 13 -- the reason is mandatory and is persisted on the
    order row, so both dashboards can display it. Cancelling an order that
    was already accepted returns its units to stock."""
    call_function("SELECT cancel_order(%s, %s, %s)", (order_id, vendor["id"], body.reason))
    return {"order_id": order_id, "status": "CANCELLED", "cancellation_reason": body.reason.strip()}
