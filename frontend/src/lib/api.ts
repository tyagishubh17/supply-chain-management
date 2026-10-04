export type Role = "customer" | "vendor";
export type OrderStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED";

export interface Session { access_token: string; role: Role; name: string }
export interface VendorProduct { product_id: number | string; product_name: string; price: number; quantity: number; created_at: string; updated_at: string }
export interface VendorOrder { order_id: number | string; customer_name: string; product_name: string; quantity: number; line_total: number; unit_price: number; ordered_at: string; status: OrderStatus; cancellation_reason?: string | null; shipping_address?: string | null; contact_phone?: string | null; current_stock: number }
export interface SalesProduct { product_name: string; orders_accepted: number; units_sold: number; revenue: number }
export interface SalesDay { order_day: string; order_count: number; accepted_count: number; revenue: number }
export interface SalesSummary { total_revenue: number; accepted_orders: number; pending_orders: number; sales_by_product: SalesProduct[]; orders_over_time: SalesDay[] }
export interface CatalogueProduct { product_id: number | string; product_name: string; price: number; available_quantity: number; vendor_id: number | string; supplier_name: string }
export interface ProductDetails { product_name: string; price: number; available_quantity: number; supplier_name: string }
export interface CustomerOrder { order_id: number | string; product_name: string; supplier_name: string; quantity: number; line_total: number; unit_price: number; ordered_at: string; status: OrderStatus; cancellation_reason?: string | null; shipping_address?: string | null; contact_phone?: string | null }

const API_URL = (import.meta.env["VITE_API_URL"] as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

// This is the only file that assumes endpoint paths. These map to the
// existing FastAPI backend in the main project; the new UI never calls a
// replacement backend.
const endpoints = {
  login: "/auth/login",
  vendorProducts: "/products/mine",
  vendorOrders: "/orders/incoming",
  vendorSales: "/sales/summary",
  catalogue: "/products",
  customerOrders: "/orders",
};

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

function token() {
  if (typeof window === "undefined") return null;
  try { return (JSON.parse(localStorage.getItem("supply-chain-session") ?? "null") as Session | null)?.access_token ?? null; } catch { return null; }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const accessToken = token();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...init.headers },
  });
  if (!response.ok) {
    let message = "The request could not be completed.";
    try { const body = await response.json() as { detail?: string; message?: string }; message = body.detail ?? body.message ?? message; } catch { /* retain safe message */ }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const json = (value: unknown): RequestInit => ({ body: JSON.stringify(value) });

import { demoApi, demoSession } from "./demo-api";
const isDemo = () => token()?.startsWith("demo-") ?? false;
const n = (id: number | string) => Number(id);

const realApi = {
  login: (data: { email: string; password: string; role: Role }) => request<Session>(endpoints.login, { method: "POST", ...json(data) }),
  register: (data: { name: string; email: string; password: string; role: Role }) => request<Session>(
    `/auth/register/${data.role}`,
    { method: "POST", ...json(data.role === "vendor"
      ? { company_name: data.name, email: data.email, password: data.password }
      : { full_name: data.name, email: data.email, password: data.password }) },
  ),
  getVendorProducts: () => request<VendorProduct[]>(endpoints.vendorProducts),
  addProduct: (data: { product_name: string; price: number; quantity: number }) => request<VendorProduct>(endpoints.vendorProducts, { method: "POST", ...json(data) }),
  editPrice: (id: VendorProduct["product_id"], price: number) => request<VendorProduct>(`${endpoints.vendorProducts}/${id}/price`, { method: "PATCH", ...json({ price }) }),
  restock: (id: VendorProduct["product_id"], quantity: number) => request<VendorProduct>(`${endpoints.vendorProducts}/${id}/stock`, { method: "PATCH", ...json({ added_quantity: quantity }) }),
  deleteProduct: (id: VendorProduct["product_id"]) => request<void>(`${endpoints.vendorProducts}/${id}`, { method: "DELETE" }),
  getVendorOrders: () => request<VendorOrder[]>(endpoints.vendorOrders),
  updateVendorOrder: (id: VendorOrder["order_id"], action: "accept" | "reject" | "cancel", reason?: string) => request<VendorOrder>(`/orders/${id}/${action}`, { method: "POST", ...json(reason ? { reason } : {}) }),
  getSales: () => request<SalesSummary>(endpoints.vendorSales),
  getCatalogue: (search = "") => request<CatalogueProduct[]>(`${endpoints.catalogue}${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  getProduct: (id: CatalogueProduct["product_id"]) => request<ProductDetails>(`${endpoints.catalogue}/${id}`),
  placeOrder: (data: { product_id: CatalogueProduct["product_id"]; quantity: number; shipping_address?: string; contact_phone?: string }) => request<CustomerOrder>(endpoints.customerOrders, { method: "POST", ...json(data) }),
  getCustomerOrders: () => request<CustomerOrder[]>(`${endpoints.customerOrders}/mine`),
  cancelCustomerOrder: (id: CustomerOrder["order_id"]) => request<CustomerOrder>(`${endpoints.customerOrders}/${id}/cancel-my-order`, { method: "POST" }),
};

type Api = typeof realApi;
// Routes every call to the in-browser demo backend while a demo session is active.
export const api: Api & { demoSession: typeof demoSession } = {
  ...realApi,
  demoSession,
  getVendorProducts: () => isDemo() ? demoApi.getVendorProducts() : realApi.getVendorProducts(),
  addProduct: (d) => isDemo() ? demoApi.addProduct(d) : realApi.addProduct(d),
  editPrice: (id, price) => isDemo() ? demoApi.editPrice(n(id), price) : realApi.editPrice(id, price),
  restock: (id, q) => isDemo() ? demoApi.restock(n(id), q) : realApi.restock(id, q),
  deleteProduct: (id) => isDemo() ? demoApi.deleteProduct(n(id)) : realApi.deleteProduct(id),
  getVendorOrders: () => isDemo() ? demoApi.getVendorOrders() : realApi.getVendorOrders(),
  updateVendorOrder: (id, a, r) => isDemo() ? demoApi.updateVendorOrder(n(id), a, r) : realApi.updateVendorOrder(id, a, r),
  getSales: () => isDemo() ? demoApi.getSales() : realApi.getSales(),
  getCatalogue: (q) => isDemo() ? demoApi.getCatalogue(q) : realApi.getCatalogue(q),
  getProduct: (id) => isDemo() ? demoApi.getProduct(n(id)) : realApi.getProduct(id),
  placeOrder: (d) => isDemo() ? demoApi.placeOrder({ ...d, product_id: n(d.product_id) }) : realApi.placeOrder(d),
  getCustomerOrders: () => isDemo() ? demoApi.getCustomerOrders() : realApi.getCustomerOrders(),
  cancelCustomerOrder: (id) => isDemo() ? demoApi.cancelCustomerOrder(n(id)) : realApi.cancelCustomerOrder(id),
};
