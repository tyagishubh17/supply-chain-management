from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user, require_role
from app.database import get_connection
from app.schemas import OrderOut, PlaceOrderRequest, ReserveStockRequest

router = APIRouter(prefix="/orders", tags=["orders"])


def _get_enterprise_id(cur, user_id: int) -> int:
    cur.execute("SELECT id FROM enterprise WHERE user_id = %s", (user_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=403, detail="No enterprise profile for this user")
    return row["id"]


def _get_vendor_id(cur, user_id: int) -> int:
    cur.execute("SELECT id FROM vendor WHERE user_id = %s", (user_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=403, detail="No vendor profile for this user")
    return row["id"]


@router.post("", status_code=201)
def place_order(body: PlaceOrderRequest, current_user: dict = Depends(require_role("enterprise"))):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            enterprise_id = _get_enterprise_id(cur, current_user["id"])
            try:
                cur.callproc(
                    "place_order",
                    (enterprise_id, body.vendor_id, body.product_id, body.quantity, 0),
                )
                cur.execute("SELECT @_place_order_4 AS order_id")
                order_id = cur.fetchone()["order_id"]
            except Exception as exc:  # stored procedure SIGNALs surface here
                raise HTTPException(status_code=400, detail=str(exc))
        return {"order_id": order_id, "status": "pending"}
    finally:
        conn.close()


@router.post("/{order_id}/confirm")
def confirm_order(order_id: int, current_user: dict = Depends(require_role("vendor"))):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            vendor_id = _get_vendor_id(cur, current_user["id"])
            cur.execute("SELECT vendor_id FROM purchase_order WHERE id = %s", (order_id,))
            order = cur.fetchone()
            if not order:
                raise HTTPException(status_code=404, detail="Order not found")
            if order["vendor_id"] != vendor_id:
                raise HTTPException(status_code=403, detail="This order does not belong to your vendor account")
            try:
                cur.callproc("vendor_confirm_order", (order_id,))
            except Exception as exc:
                raise HTTPException(status_code=400, detail=str(exc))
        return {"order_id": order_id, "status": "vendor_confirmed"}
    finally:
        conn.close()


@router.post("/{order_id}/reserve-stock")
def reserve_stock(
    order_id: int,
    body: ReserveStockRequest,
    current_user: dict = Depends(require_role("warehouse_staff", "admin")),
):
    """Row-locks the inventory rows for this order's items (SELECT ... FOR UPDATE
    inside the stored procedure) so concurrent reservations can't oversell stock."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            try:
                cur.callproc("reserve_stock_for_order", (order_id, body.warehouse_id))
            except Exception as exc:
                raise HTTPException(status_code=400, detail=str(exc))
        return {"order_id": order_id, "status": "stock_reserved", "warehouse_id": body.warehouse_id}
    finally:
        conn.close()


@router.get("", response_model=List[OrderOut])
def list_orders(current_user: dict = Depends(get_current_user)):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            base_query = """
                SELECT po.id, e.company_name AS buyer, v.company_name AS vendor,
                       p.name AS product, oi.quantity, oi.unit_price,
                       (oi.quantity * oi.unit_price) AS line_total,
                       po.status, po.order_date
                FROM purchase_order po
                JOIN enterprise e ON e.id = po.enterprise_id
                JOIN vendor v ON v.id = po.vendor_id
                JOIN order_item oi ON oi.order_id = po.id
                JOIN product p ON p.id = oi.product_id
            """
            role = current_user["role"]
            if role == "enterprise":
                enterprise_id = _get_enterprise_id(cur, current_user["id"])
                cur.execute(base_query + " WHERE po.enterprise_id = %s ORDER BY po.id DESC", (enterprise_id,))
            elif role == "vendor":
                vendor_id = _get_vendor_id(cur, current_user["id"])
                cur.execute(base_query + " WHERE po.vendor_id = %s ORDER BY po.id DESC", (vendor_id,))
            else:
                cur.execute(base_query + " ORDER BY po.id DESC")
            return cur.fetchall()
    finally:
        conn.close()
