const BASE_URL = "http://localhost:8000";

function getToken() {
  return localStorage.getItem("scm_token");
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // no body
  }

  if (!res.ok) {
    const message = (data && data.detail) || `Request failed (${res.status})`;
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return data;
}

export const api = {
  registerEnterprise: (body) => request("/auth/register/enterprise", { method: "POST", body, auth: false }),
  registerVendor: (body) => request("/auth/register/vendor", { method: "POST", body, auth: false }),
  registerStaff: (body) => request("/auth/register/staff", { method: "POST", body, auth: false }),
  login: (body) => request("/auth/login", { method: "POST", body, auth: false }),

  listProducts: () => request("/products"),
  compareVendors: (productId) => request(`/products/${productId}/vendors`),
  myListings: () => request("/products/my-listings"),
  upsertListing: (body) => request("/products/my-listings", { method: "POST", body }),

  placeOrder: (body) => request("/orders", { method: "POST", body }),
  confirmOrder: (orderId) => request(`/orders/${orderId}/confirm`, { method: "POST" }),
  reserveStock: (orderId, warehouseId) =>
    request(`/orders/${orderId}/reserve-stock`, { method: "POST", body: { warehouse_id: warehouseId } }),
  listOrders: () => request("/orders"),

  vendorSales: () => request("/dashboard/vendor-sales"),
  vendorSummary: () => request("/dashboard/vendor-summary"),
  enterpriseSummary: () => request("/dashboard/enterprise-summary"),
  inventoryLevels: () => request("/dashboard/inventory-levels"),
  lowStock: () => request("/dashboard/low-stock"),
  runAutoReorder: () => request("/dashboard/run-auto-reorder", { method: "POST" }),
  reorderRequests: () => request("/dashboard/reorder-requests"),
  shipments: () => request("/dashboard/shipments"),
};

export { getToken };
