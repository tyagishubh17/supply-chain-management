from datetime import date
from typing import Optional

from pydantic import BaseModel, EmailStr


class VendorRegister(BaseModel):
    name: str
    email: EmailStr
    password: str
    company_name: str
    address: Optional[str] = None


class EnterpriseRegister(BaseModel):
    name: str
    email: EmailStr
    password: str
    company_name: str
    address: Optional[str] = None


class Login(BaseModel):
    email: EmailStr
    password: str


class StaffRegister(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str  # 'warehouse_staff' or 'admin'


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    name: str


class ProductOut(BaseModel):
    id: int
    name: str
    category: str
    unit: str


class VendorOfferOut(BaseModel):
    vendor_id: int
    vendor_name: str
    price: float
    lead_time_days: int
    rating: float


class VendorListingIn(BaseModel):
    product_id: int
    price: float
    lead_time_days: int


class VendorListingOut(BaseModel):
    product_id: int
    product_name: str
    price: float
    lead_time_days: int


class PlaceOrderRequest(BaseModel):
    vendor_id: int
    product_id: int
    quantity: int


class ReserveStockRequest(BaseModel):
    warehouse_id: int


class OrderOut(BaseModel):
    id: int
    buyer: str
    vendor: str
    product: str
    quantity: int
    unit_price: float
    line_total: float
    status: str
    order_date: date
