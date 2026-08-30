from typing import List

from fastapi import APIRouter, Depends

from app.auth import get_current_user, require_role
from app.database import get_connection
from app.schemas import ProductOut, VendorListingIn, VendorListingOut, VendorOfferOut

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=List[ProductOut])
def list_products(current_user: dict = Depends(get_current_user)):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT p.id, p.name, c.name AS category, p.unit
                FROM product p
                JOIN category c ON c.id = p.category_id
                ORDER BY p.name
            """)
            return cur.fetchall()
    finally:
        conn.close()


@router.get("/{product_id}/vendors", response_model=List[VendorOfferOut])
def compare_vendors(product_id: int, current_user: dict = Depends(get_current_user)):
    """The multi-vendor price comparison feature: every vendor offering
    this product, side by side, cheapest first."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT v.id AS vendor_id, v.company_name AS vendor_name,
                       vp.price, vp.lead_time_days, v.rating
                FROM vendor_product vp
                JOIN vendor v ON v.id = vp.vendor_id
                WHERE vp.product_id = %s
                ORDER BY vp.price ASC
            """, (product_id,))
            return cur.fetchall()
    finally:
        conn.close()


@router.get("/my-listings", response_model=List[VendorListingOut])
def my_listings(current_user: dict = Depends(require_role("vendor"))):
    """A vendor's own product catalog: what they currently sell, and at what price."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM vendor WHERE user_id = %s", (current_user["id"],))
            vendor = cur.fetchone()
            cur.execute("""
                SELECT vp.product_id, p.name AS product_name, vp.price, vp.lead_time_days
                FROM vendor_product vp
                JOIN product p ON p.id = vp.product_id
                WHERE vp.vendor_id = %s
                ORDER BY p.name
            """, (vendor["id"],))
            return cur.fetchall()
    finally:
        conn.close()


@router.post("/my-listings", status_code=201)
def upsert_listing(body: VendorListingIn, current_user: dict = Depends(require_role("vendor"))):
    """Vendor adds a product to their catalog, or updates their price/lead time for it."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM vendor WHERE user_id = %s", (current_user["id"],))
            vendor = cur.fetchone()
            cur.execute("""
                INSERT INTO vendor_product (vendor_id, product_id, price, lead_time_days)
                VALUES (%s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE price = VALUES(price), lead_time_days = VALUES(lead_time_days)
            """, (vendor["id"], body.product_id, body.price, body.lead_time_days))
        return {"status": "ok"}
    finally:
        conn.close()
