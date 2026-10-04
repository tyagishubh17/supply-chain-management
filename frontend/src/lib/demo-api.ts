// Demo mode: an in-browser stand-in for the FastAPI backend so every page can be
// previewed without a server. Used only when the session token starts with "demo-".
import type { CatalogueProduct, CustomerOrder, OrderStatus, ProductDetails, Role, SalesSummary, Session, VendorOrder, VendorProduct } from "./api";

interface DProduct { id: number; name: string; price: number; qty: number; vendor_id: number; supplier: string; created: string; updated: string; deleted?: boolean }
interface DOrder { id: number; product_id: number; customer: string; qty: number; unit: number; at: string; status: OrderStatus; reason?: string | null; address?: string | null; phone?: string | null }
interface DState { products: DProduct[]; orders: DOrder[]; seq: number }

const KEY = "supply-chain-demo";
export const DEMO_VENDOR = "Acme Industrial Supplies";
export const DEMO_CUSTOMER = "Riya Sharma";
const day = (n: number, h = 10) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, 15, 0, 0); return d.toISOString(); };

function seed(): DState {
  const p = (id: number, name: string, price: number, qty: number, vendor_id: number, supplier: string, age: number): DProduct => ({ id, name, price, qty, vendor_id, supplier, created: day(age), updated: day(Math.max(0, age - 3)) });
  const products = [
    p(1, "Steel Fasteners (Box of 500)", 1250, 40, 1, DEMO_VENDOR, 30), p(2, "Industrial Safety Gloves", 340, 3, 1, DEMO_VENDOR, 25), p(3, "Corrugated Shipping Boxes", 85.5, 600, 1, DEMO_VENDOR, 20), p(4, "Pallet Wrap Film Roll", 720, 0, 1, DEMO_VENDOR, 12),
    p(5, "LED Warehouse Light 100W", 2899, 25, 2, "BrightLine Electricals", 18), p(6, "Hydraulic Pallet Jack", 18500, 6, 2, "BrightLine Electricals", 15), p(7, "Barcode Label Rolls", 210, 150, 3, "PackRight Traders", 10),
  ];
  const o = (id: number, product_id: number, customer: string, qty: number, unit: number, age: number, status: OrderStatus, extra: Partial<DOrder> = {}): DOrder => ({ id, product_id, customer, qty, unit, at: day(age, 9 + (id % 8)), status, address: "102 Market St, New Delhi", phone: "+91 98765 43210", ...extra });
  const orders = [
    o(101, 1, "Arjun Mehta", 5, 1250, 9, "ACCEPTED"), o(102, 3, DEMO_CUSTOMER, 120, 85.5, 8, "ACCEPTED"), o(103, 1, "Kavya Nair", 3, 1250, 6, "REJECTED"),
    o(104, 2, "Arjun Mehta", 10, 340, 5, "CANCELLED", { reason: "Product damaged during quality inspection." }), o(105, 3, "Kavya Nair", 200, 85.5, 4, "ACCEPTED"), o(106, 1, DEMO_CUSTOMER, 8, 1250, 2, "ACCEPTED"),
    o(107, 2, DEMO_CUSTOMER, 12, 340, 1, "PENDING"), o(108, 1, "Kavya Nair", 4, 1250, 0, "PENDING", { address: null, phone: null }), o(109, 5, DEMO_CUSTOMER, 2, 2899, 3, "PENDING"), o(110, 7, DEMO_CUSTOMER, 20, 210, 7, "CANCELLED", { reason: "Supplier stock count mismatch." }),
  ];
  return { products, orders, seq: 111 };
}
function load(): DState { try { const s = localStorage.getItem(KEY); if (s) return JSON.parse(s) as DState; } catch { /* reseed */ } const s = seed(); save(s); return s; }
function save(s: DState) { localStorage.setItem(KEY, JSON.stringify(s)); }
const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 250));
const fail = (m: string) => new Promise<never>((_, rej) => setTimeout(() => rej(new Error(m)), 250));

export function demoSession(role: Role): Session { return { access_token: `demo-${role}`, role, name: role === "vendor" ? DEMO_VENDOR : DEMO_CUSTOMER }; }

const vp = (p: DProduct): VendorProduct => ({ product_id: p.id, product_name: p.name, price: p.price, quantity: p.qty, created_at: p.created, updated_at: p.updated });
function prod(s: DState, id: number) { return s.products.find((p) => p.id === id); }
function vo(s: DState, o: DOrder): VendorOrder { const p = prod(s, o.product_id)!; return { order_id: o.id, customer_name: o.customer, product_name: p.name, quantity: o.qty, line_total: o.qty * o.unit, unit_price: o.unit, ordered_at: o.at, status: o.status, cancellation_reason: o.reason ?? null, shipping_address: o.address ?? null, contact_phone: o.phone ?? null, current_stock: p.qty }; }
function co(s: DState, o: DOrder): CustomerOrder { const p = prod(s, o.product_id)!; return { order_id: o.id, product_name: p.name, supplier_name: p.supplier, quantity: o.qty, line_total: o.qty * o.unit, unit_price: o.unit, ordered_at: o.at, status: o.status, cancellation_reason: o.reason ?? null, shipping_address: o.address ?? null, contact_phone: o.phone ?? null }; }
const mine = (s: DState) => s.orders.filter((o) => prod(s, o.product_id)?.vendor_id === 1);
const now = () => new Date().toISOString();

export const demoApi = {
  getVendorProducts: () => { const s = load(); return wait(s.products.filter((p) => p.vendor_id === 1 && !p.deleted).map(vp)); },
  addProduct: (d: { product_name: string; price: number; quantity: number }) => { const s = load(); const p: DProduct = { id: s.seq++, name: d.product_name, price: d.price, qty: d.quantity, vendor_id: 1, supplier: DEMO_VENDOR, created: now(), updated: now() }; s.products.push(p); save(s); return wait(vp(p)); },
  editPrice: (id: number, price: number) => { const s = load(); const p = prod(s, id); if (!p) return fail("Product not found."); p.price = price; p.updated = now(); save(s); return wait(vp(p)); },
  restock: (id: number, quantity: number) => { const s = load(); const p = prod(s, id); if (!p) return fail("Product not found."); p.qty += quantity; p.updated = now(); save(s); return wait(vp(p)); },
  deleteProduct: (id: number) => { const s = load(); const p = prod(s, id); if (p) p.deleted = true; save(s); return wait(undefined); },
  getVendorOrders: () => { const s = load(); return wait(mine(s).map((o) => vo(s, o))); },
  updateVendorOrder: (id: number, action: "accept" | "reject" | "cancel", reason?: string) => {
    const s = load(); const o = s.orders.find((x) => x.id === id); if (!o) return fail("Order not found."); const p = prod(s, o.product_id)!;
    if (action === "accept") { if (o.status !== "PENDING") return fail("Only pending orders can be accepted."); if (o.qty > p.qty) return fail("Insufficient stock to accept this order."); p.qty -= o.qty; o.status = "ACCEPTED"; }
    else if (action === "reject") { if (o.status !== "PENDING") return fail("Only pending orders can be rejected."); o.status = "REJECTED"; }
    else { if (o.status !== "PENDING" && o.status !== "ACCEPTED") return fail("This order cannot be cancelled."); if (o.status === "ACCEPTED") p.qty += o.qty; o.status = "CANCELLED"; o.reason = reason ?? null; }
    save(s); return wait(vo(s, o));
  },
  getSales: () => {
    const s = load(); const orders = mine(s); const acc = orders.filter((o) => o.status === "ACCEPTED");
    const byP = new Map<string, { product_name: string; orders_accepted: number; units_sold: number; revenue: number }>();
    acc.forEach((o) => { const n = prod(s, o.product_id)!.name; const r = byP.get(n) ?? { product_name: n, orders_accepted: 0, units_sold: 0, revenue: 0 }; r.orders_accepted++; r.units_sold += o.qty; r.revenue += o.qty * o.unit; byP.set(n, r); });
    const byD = new Map<string, { order_day: string; order_count: number; accepted_count: number; revenue: number }>();
    orders.forEach((o) => { const k = o.at.slice(0, 10); const r = byD.get(k) ?? { order_day: k, order_count: 0, accepted_count: 0, revenue: 0 }; r.order_count++; if (o.status === "ACCEPTED") { r.accepted_count++; r.revenue += o.qty * o.unit; } byD.set(k, r); });
    const summary: SalesSummary = { total_revenue: acc.reduce((t, o) => t + o.qty * o.unit, 0), accepted_orders: acc.length, pending_orders: orders.filter((o) => o.status === "PENDING").length, sales_by_product: [...byP.values()].sort((a, b) => b.revenue - a.revenue), orders_over_time: [...byD.values()].sort((a, b) => a.order_day.localeCompare(b.order_day)) };
    return wait(summary);
  },
  getCatalogue: (search = "") => { const s = load(); const q = search.toLowerCase(); return wait<CatalogueProduct[]>(s.products.filter((p) => !p.deleted && p.name.toLowerCase().includes(q)).map((p) => ({ product_id: p.id, product_name: p.name, price: p.price, available_quantity: p.qty, vendor_id: p.vendor_id, supplier_name: p.supplier }))); },
  getProduct: (id: number) => { const s = load(); const p = prod(s, id); if (!p) return fail("Product not found."); return wait<ProductDetails>({ product_name: p.name, price: p.price, available_quantity: p.qty, supplier_name: p.supplier }); },
  placeOrder: (d: { product_id: number; quantity: number; shipping_address?: string; contact_phone?: string }) => { const s = load(); const p = prod(s, d.product_id); if (!p) return fail("Product not found."); if (d.quantity > p.qty) return fail(`Only ${p.qty} units available.`); const o: DOrder = { id: s.seq++, product_id: p.id, customer: DEMO_CUSTOMER, qty: d.quantity, unit: p.price, at: now(), status: "PENDING", address: d.shipping_address ?? null, phone: d.contact_phone ?? null }; s.orders.push(o); save(s); return wait(co(s, o)); },
  getCustomerOrders: () => { const s = load(); return wait(s.orders.filter((o) => o.customer === DEMO_CUSTOMER).map((o) => co(s, o)).sort((a, b) => b.ordered_at.localeCompare(a.ordered_at))); },
  cancelCustomerOrder: (id: number) => { const s = load(); const o = s.orders.find((x) => x.id === id && x.customer === DEMO_CUSTOMER); if (!o || o.status !== "PENDING") return fail("Only your pending orders can be cancelled."); o.status = "CANCELLED"; save(s); return wait(co(s, o)); },
};
