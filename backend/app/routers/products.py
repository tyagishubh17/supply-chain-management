"""Product endpoints.

Vendor side: add, list, reprice and delete -- always scoped to the
logged-in vendor, whose id comes from the token and never from the request.
Customer side: browse and search the catalogue, and open one product to
see its supplier.
"""

from typing import Optional

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_customer, require_vendor
from app.database import call_function, fetch_all, fetch_one, get_cursor
from app.schemas import CatalogueProduct, PriceUpdate, ProductCreate, VendorProduct

router = APIRouter(prefix="/products", tags=["products"])


# =========================================================
# Vendor
# =========================================================
@router.get("/mine", response_model=list[VendorProduct])
def my_products(vendor: dict = Depends(require_vendor)):
    """Requirement 3.2 -- the vendor's own catalogue, nobody else's."""
    return fetch_all(
        """
        SELECT product_id, product_name, price, quantity, created_at, updated_at
          FROM products
         WHERE vendor_id = %s
           AND is_active
         ORDER BY product_name
        """,
        (vendor["id"],),
    )


@router.post("/mine", response_model=VendorProduct, status_code=201)
def add_product(body: ProductCreate, vendor: dict = Depends(require_vendor)):
    """Requirement 3.1 -- the product is tied to the logged-in vendor."""
    try:
        with get_cursor() as cur:
            cur.execute(
                """
                INSERT INTO products (vendor_id, product_name, price, quantity)
                VALUES (%s, %s, %s, %s)
                RETURNING product_id, product_name, price, quantity, created_at, updated_at
                """,
                (vendor["id"], body.product_name.strip(), body.price, body.quantity),
            )
            return cur.fetchone()
    except psycopg.errors.UniqueViolation:
        raise HTTPException(
            status_code=409,
            detail="You already have a product with that name.",
        ) from None


@router.patch("/mine/{product_id}/price", response_model=VendorProduct)
def change_price(product_id: int, body: PriceUpdate, vendor: dict = Depends(require_vendor)):
    """Requirement 3.3. The ownership check lives in update_product_price(),
    so vendor B repricing vendor A's product is refused by the database."""
    call_function("SELECT update_product_price(%s, %s, %s)",
                  (product_id, vendor["id"], body.price))
    return fetch_one(
        """
        SELECT product_id, product_name, price, quantity, created_at, updated_at
          FROM products WHERE product_id = %s
        """,
        (product_id,),
    )


@router.delete("/mine/{product_id}")
def remove_product(product_id: int, vendor: dict = Depends(require_vendor)):
    """Requirement 3.4. delete_product() hard-deletes a product that was
    never ordered and soft-deletes one that appears in order history, so
    referential integrity and the historical record both survive."""
    row = call_function("SELECT delete_product(%s, %s) AS outcome",
                        (product_id, vendor["id"]))
    archived = row["outcome"] == "archived"
    return {
        "outcome": row["outcome"],
        "message": (
            "Product archived. It still appears in existing orders, so its history is kept."
            if archived
            else "Product deleted."
        ),
    }


# =========================================================
# Customer
# =========================================================
@router.get("", response_model=list[CatalogueProduct])
def browse_catalogue(
    search: Optional[str] = Query(None, max_length=100),
    _: dict = Depends(require_customer),
):
    """Requirements 5.1, 5.2 and 8.

    Reads vw_available_products, which already excludes archived and
    out-of-stock products, so nothing unorderable is ever listed. `search`
    is a case-insensitive match on the product name.
    """
    sql = """
        SELECT product_id, product_name, price, available_quantity,
               vendor_id, supplier_name
          FROM vw_available_products
    """
    params: tuple = ()
    if search and search.strip():
        sql += " WHERE product_name ILIKE %s"
        params = (f"%{search.strip()}%",)
    sql += " ORDER BY product_name"
    return fetch_all(sql, params)


@router.get("/{product_id}", response_model=CatalogueProduct)
def product_detail(product_id: int, _: dict = Depends(require_customer)):
    """Requirement 6 -- the supplier name comes from the vendors table
    through the foreign key, never from a value copied onto the product."""
    row = fetch_one(
        """
        SELECT product_id, product_name, price, available_quantity,
               vendor_id, supplier_name
          FROM vw_available_products
         WHERE product_id = %s
        """,
        (product_id,),
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Product is not available.")
    return row
