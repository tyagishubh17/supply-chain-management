"""Request and response models.

Pydantic validates the shape and the obvious ranges here, which gives the
user a fast, clear error. It is deliberately not the only line of defence:
every rule below is also enforced by a CHECK constraint or a PL/pgSQL
function, because a request that bypasses this API must still be rejected.
"""

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field


# ---------------------------------------------------------
# Authentication
# ---------------------------------------------------------

class VendorRegister(BaseModel):
    company_name: str = Field(
        min_length=2,
        max_length=150,
    )
    email: EmailStr
    # bcrypt only processes passwords up to 72 bytes.
    password: str = Field(
        min_length=6,
        max_length=72,
    )


class CustomerRegister(BaseModel):
    full_name: str = Field(
        min_length=2,
        max_length=150,
    )
    email: EmailStr
    password: str = Field(
        min_length=6,
        max_length=72,
    )


class Login(BaseModel):
    """Credentials and role used when signing in."""
    email: EmailStr
    password: str
    role: Literal["vendor", "customer"]


class Session(BaseModel):
    """Authentication details returned after a successful login."""
    access_token: str
    token_type: str = "bearer"
    role: Literal["vendor", "customer"]
    name: str


# ---------------------------------------------------------
# Products
# ---------------------------------------------------------
class ProductCreate(BaseModel):
    product_name: str = Field(
        min_length=1,
        max_length=150,
    )
    price: Decimal = Field(
        ge=0,
        max_digits=10,
        decimal_places=2,
    )
    quantity: int = Field(ge=0)


class PriceUpdate(BaseModel):
    price: Decimal = Field(
        ge=0,
        max_digits=10,
        decimal_places=2,
    )


class StockRestock(BaseModel):
    """Quantity added to the existing product stock."""
    added_quantity: int = Field(gt=0)


class VendorProduct(BaseModel):
    product_id: int
    product_name: str
    price: Decimal
    quantity: int
    created_at: datetime
    updated_at: datetime


class CatalogueProduct(BaseModel):
    """Product information shown in the customer catalogue.

    The supplier is resolved through products.vendor_id -> vendors.
    """

    product_id: int
    product_name: str
    price: Decimal
    available_quantity: int
    vendor_id: int
    supplier_name: str


# ---------------------------------------------------------
# Orders
# ---------------------------------------------------------
class OrderCreate(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    shipping_address: Optional[str] = Field(
        None,
        max_length=500,
    )
    contact_phone: Optional[str] = Field(
        None,
        max_length=25,
    )


class CancelRequest(BaseModel):
    """Reason supplied when cancelling an order."""
    reason: str = Field(min_length=3, max_length=500)


class Order(BaseModel):
    """Order details returned by the API."""
    order_id: int
    status: Literal["PENDING", "ACCEPTED", "REJECTED", "CANCELLED"]
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    cancellation_reason: Optional[str] = None
    ordered_at: datetime
    decided_at: Optional[datetime] = None
    customer_name: str
    product_id: int
    product_name: str
    supplier_name: str
    shipping_address: Optional[str] = None
    contact_phone: Optional[str] = None
    current_stock: Optional[int] = None


# ---------------------------------------------------------
# Sales analytics
# ---------------------------------------------------------
class ProductSales(BaseModel):
    """Sales totals grouped by product."""
    product_name: str
    orders_accepted: int
    units_sold: int
    revenue: Decimal


class DailyOrders(BaseModel):
    """Order and revenue totals grouped by day."""
    order_day: str
    order_count: int
    accepted_count: int
    revenue: Decimal


class SalesSummary(BaseModel):
    """Overall sales metrics and supporting breakdowns."""
    total_revenue: Decimal
    accepted_orders: int
    pending_orders: int
    sales_by_product: list[ProductSales]
    orders_over_time: list[DailyOrders]
