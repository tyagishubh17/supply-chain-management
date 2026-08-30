from fastapi import APIRouter, Depends

from app.auth import get_current_user, require_role
from app.database import get_connection

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/vendor-sales")
def vendor_sales(current_user: dict = Depends(require_role("vendor", "admin"))):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM vendor_sales_summary")
            return cur.fetchall()
    finally:
        conn.close()


@router.get("/vendor-summary")
def vendor_summary(current_user: dict = Depends(require_role("vendor", "admin"))):
    """KPI cards + chart data for the vendor dashboard: revenue trend and
    order status breakdown, scoped to the logged-in vendor."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM vendor WHERE user_id = %s", (current_user["id"],))
            vendor = cur.fetchone()
            vendor_id = vendor["id"] if vendor else None

            cur.execute("""
                SELECT COUNT(DISTINCT po.id) AS total_orders,
                       COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_revenue,
                       COUNT(DISTINCT CASE WHEN po.status NOT IN ('delivered', 'cancelled') THEN po.id END) AS active_orders
                FROM purchase_order po
                LEFT JOIN order_item oi ON oi.order_id = po.id
                WHERE po.vendor_id = %s
            """, (vendor_id,))
            kpis = cur.fetchone()

            cur.execute("""
                SELECT DATE_FORMAT(po.order_date, '%%Y-%%m') AS month,
                       COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS revenue
                FROM purchase_order po
                JOIN order_item oi ON oi.order_id = po.id
                WHERE po.vendor_id = %s
                GROUP BY month
                ORDER BY month
            """, (vendor_id,))
            revenue_by_month = cur.fetchall()

            cur.execute("""
                SELECT status, COUNT(*) AS count
                FROM purchase_order
                WHERE vendor_id = %s
                GROUP BY status
            """, (vendor_id,))
            orders_by_status = cur.fetchall()

        return {"kpis": kpis, "revenue_by_month": revenue_by_month, "orders_by_status": orders_by_status}
    finally:
        conn.close()


@router.get("/enterprise-summary")
def enterprise_summary(current_user: dict = Depends(require_role("enterprise", "admin"))):
    """KPI cards + chart data for the enterprise dashboard: spend trend,
    order status breakdown, and top vendors by spend."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM enterprise WHERE user_id = %s", (current_user["id"],))
            enterprise = cur.fetchone()
            enterprise_id = enterprise["id"] if enterprise else None

            cur.execute("""
                SELECT COUNT(DISTINCT po.id) AS total_orders,
                       COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_spend,
                       COUNT(DISTINCT CASE WHEN po.status NOT IN ('delivered', 'cancelled') THEN po.id END) AS active_orders
                FROM purchase_order po
                LEFT JOIN order_item oi ON oi.order_id = po.id
                WHERE po.enterprise_id = %s
            """, (enterprise_id,))
            kpis = cur.fetchone()

            cur.execute("""
                SELECT DATE_FORMAT(po.order_date, '%%Y-%%m') AS month,
                       COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS spend
                FROM purchase_order po
                JOIN order_item oi ON oi.order_id = po.id
                WHERE po.enterprise_id = %s
                GROUP BY month
                ORDER BY month
            """, (enterprise_id,))
            spend_by_month = cur.fetchall()

            cur.execute("""
                SELECT status, COUNT(*) AS count
                FROM purchase_order
                WHERE enterprise_id = %s
                GROUP BY status
            """, (enterprise_id,))
            orders_by_status = cur.fetchall()

            cur.execute("""
                SELECT v.company_name AS vendor_name,
                       COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS spend
                FROM purchase_order po
                JOIN vendor v ON v.id = po.vendor_id
                JOIN order_item oi ON oi.order_id = po.id
                WHERE po.enterprise_id = %s
                GROUP BY v.id, v.company_name
                ORDER BY spend DESC
                LIMIT 5
            """, (enterprise_id,))
            top_vendors = cur.fetchall()

        return {
            "kpis": kpis,
            "spend_by_month": spend_by_month,
            "orders_by_status": orders_by_status,
            "top_vendors": top_vendors,
        }
    finally:
        conn.close()


@router.get("/inventory-levels")
def inventory_levels(current_user: dict = Depends(require_role("warehouse_staff", "admin"))):
    """Stock quantity per product per warehouse, for the warehouse stock-level chart."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT w.name AS warehouse_name, p.name AS product_name,
                       i.quantity, i.reorder_level
                FROM inventory i
                JOIN warehouse w ON w.id = i.warehouse_id
                JOIN product p ON p.id = i.product_id
                ORDER BY w.name, p.name
            """)
            return cur.fetchall()
    finally:
        conn.close()


@router.get("/low-stock")
def low_stock(current_user: dict = Depends(require_role("warehouse_staff", "admin"))):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM low_stock_alert")
            return cur.fetchall()
    finally:
        conn.close()


@router.post("/run-auto-reorder")
def run_auto_reorder(current_user: dict = Depends(require_role("warehouse_staff", "admin"))):
    """Manually trigger the auto-reorder scan (in production this would run on a schedule)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.callproc("auto_reorder_check")
            cur.execute("SELECT * FROM reorder_request ORDER BY id DESC")
            return cur.fetchall()
    finally:
        conn.close()


@router.get("/reorder-requests")
def reorder_requests(current_user: dict = Depends(require_role("warehouse_staff", "admin"))):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT rr.id, w.name AS warehouse, p.name AS product, v.company_name AS vendor,
                       rr.quantity, rr.status, rr.created_at
                FROM reorder_request rr
                JOIN warehouse w ON w.id = rr.warehouse_id
                JOIN product p ON p.id = rr.product_id
                JOIN vendor v ON v.id = rr.vendor_id
                ORDER BY rr.created_at DESC
            """)
            return cur.fetchall()
    finally:
        conn.close()


@router.get("/shipments")
def shipments(current_user: dict = Depends(require_role("enterprise", "vendor", "warehouse_staff", "admin"))):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT s.id AS shipment_id, po.id AS order_id, t.name AS transporter,
                       r.destination, r.distance_km, s.status, s.dispatch_date, s.delivery_date
                FROM shipment s
                JOIN purchase_order po ON po.id = s.order_id
                JOIN transporter t ON t.id = s.transporter_id
                JOIN route r ON r.id = s.route_id
                ORDER BY s.id DESC
            """)
            return cur.fetchall()
    finally:
        conn.close()
