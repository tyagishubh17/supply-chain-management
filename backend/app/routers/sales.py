"""Vendor sales analytics (requirement 15).

Three figures and two small charts, all computed by the database from real
rows. Only ACCEPTED orders count as a sale, so a rejected or cancelled
order never appears as revenue.
"""

from fastapi import APIRouter, Depends

from app.auth import require_vendor
from app.database import fetch_all, fetch_one
from app.schemas import SalesSummary

router = APIRouter(prefix="/sales", tags=["sales"])


@router.get("/summary", response_model=SalesSummary)
def sales_summary(vendor: dict = Depends(require_vendor)):
    # Headline numbers. The FILTER clause counts each status in one pass
    # over the vendor's orders instead of running three separate queries.
    totals = fetch_one(
        """
        SELECT COALESCE(sum(o.quantity * o.unit_price)
                        FILTER (WHERE o.status = 'ACCEPTED'), 0) AS total_revenue,
               count(*) FILTER (WHERE o.status = 'ACCEPTED') AS accepted_orders,
               count(*) FILTER (WHERE o.status = 'PENDING')  AS pending_orders
          FROM orders   o
          JOIN products p ON p.product_id = o.product_id
         WHERE p.vendor_id = %s
        """,
        (vendor["id"],),
    )

    # Sales by product, from the aggregating view. Products with no
    # accepted orders are kept (at zero) so the chart shows the whole
    # catalogue, not just the bestsellers.
    sales_by_product = fetch_all(
        """
        SELECT product_name, orders_accepted, units_sold, revenue
          FROM vw_vendor_product_sales
         WHERE vendor_id = %s
         ORDER BY revenue DESC, product_name
        """,
        (vendor["id"],),
    )

    # Orders over time: one row per day this vendor received orders.
    orders_over_time = fetch_all(
        """
        SELECT to_char(o.ordered_at, 'YYYY-MM-DD') AS order_day,
               count(*)                            AS order_count,
               count(*) FILTER (WHERE o.status = 'ACCEPTED') AS accepted_count,
               COALESCE(sum(o.quantity * o.unit_price)
                        FILTER (WHERE o.status = 'ACCEPTED'), 0) AS revenue
          FROM orders   o
          JOIN products p ON p.product_id = o.product_id
         WHERE p.vendor_id = %s
         GROUP BY order_day
         ORDER BY order_day
        """,
        (vendor["id"],),
    )

    return SalesSummary(
        total_revenue=totals["total_revenue"],
        accepted_orders=totals["accepted_orders"],
        pending_orders=totals["pending_orders"],
        sales_by_product=sales_by_product,
        orders_over_time=orders_over_time,
    )
