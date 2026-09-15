// Thin wrapper over fetch. The backend base URL comes from an env var so
// it is not hardcoded; Vite exposes any VITE_-prefixed variable.
const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const TOKEN_KEY = "scm_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // Some responses (or network errors) carry no JSON body.
  }

  if (!res.ok) throw new Error(errorMessage(data, res.status));
  return data;
}

// FastAPI returns a string `detail` for our own HTTPExceptions and an array
// of field errors for validation failures. Turn both into one readable line,
// so the database's own message (e.g. "Only 5 units are currently
// available.") reaches the user unchanged.
function errorMessage(data, status) {
  const detail = data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail
      .map((e) => {
        const field = Array.isArray(e.loc) ? e.loc[e.loc.length - 1] : "";
        return field ? `${field}: ${e.msg}` : e.msg;
      })
      .join("; ");
  }
  if (status === 401) return "Your session has expired. Please sign in again.";
  return `Request failed (${status})`;
}

export const api = {
  // --- auth ---
  registerVendor: (body) =>
    request("/auth/register/vendor", { method: "POST", body, auth: false }),
  registerCustomer: (body) =>
    request("/auth/register/customer", { method: "POST", body, auth: false }),
  login: (body) => request("/auth/login", { method: "POST", body, auth: false }),

  // --- vendor: products ---
  myProducts: () => request("/products/mine"),
  addProduct: (body) => request("/products/mine", { method: "POST", body }),
  updatePrice: (productId, price) =>
    request(`/products/mine/${productId}/price`, { method: "PATCH", body: { price } }),
  deleteProduct: (productId) =>
    request(`/products/mine/${productId}`, { method: "DELETE" }),

  // --- vendor: orders + sales ---
  incomingOrders: () => request("/orders/incoming"),
  acceptOrder: (orderId) => request(`/orders/${orderId}/accept`, { method: "POST" }),
  rejectOrder: (orderId) => request(`/orders/${orderId}/reject`, { method: "POST" }),
  cancelOrder: (orderId, reason) =>
    request(`/orders/${orderId}/cancel`, { method: "POST", body: { reason } }),
  salesSummary: () => request("/sales/summary"),

  // --- customer ---
  catalogue: (search) =>
    request(`/products${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  productDetail: (productId) => request(`/products/${productId}`),
  placeOrder: (productId, quantity) =>
    request("/orders", { method: "POST", body: { product_id: productId, quantity } }),
  myOrders: () => request("/orders/mine"),
};
