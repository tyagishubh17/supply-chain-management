import { useEffect, useState } from "react";
import { api } from "../api";

export default function Products() {
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [placing, setPlacing] = useState(null);
  const [quantity, setQuantity] = useState(10);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.listProducts().then(setProducts).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  async function openProduct(product) {
    setSelected(product);
    setMessage("");
    setOffers([]);
    try {
      const data = await api.compareVendors(product.id);
      setOffers(data);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handlePlaceOrder(vendorId) {
    setPlacing(vendorId);
    setMessage("");
    try {
      const res = await api.placeOrder({ vendor_id: vendorId, product_id: selected.id, quantity: Number(quantity) });
      setMessage(`Order #${res.order_id} placed — status: ${res.status}. The vendor needs to confirm it next.`);
    } catch (e) {
      setMessage(`Could not place order: ${e.message}`);
    } finally {
      setPlacing(null);
    }
  }

  if (loading) return <p style={{ color: "var(--text-muted)" }}>Loading catalog...</p>;

  return (
    <div>
      <div className="page-header">
        <h2>Product catalog</h2>
        <p>Pick a product to compare every vendor supplying it, then place an order.</p>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div style={{ display: "flex", gap: 24 }}>
        <div style={{ flex: 1 }}>
          <div className="panel">
            <h3>Products</h3>
            {products.length === 0 ? (
              <div className="empty-state">No products in the catalog yet.</div>
            ) : (
              <table>
                <thead>
                  <tr><th>Name</th><th>Category</th><th>Unit</th></tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => openProduct(p)}
                      style={{ cursor: "pointer", background: selected?.id === p.id ? "var(--surface-raised)" : undefined }}
                    >
                      <td>{p.name}</td>
                      <td>{p.category}</td>
                      <td className="mono">{p.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div className="panel">
            <h3>{selected ? `Vendors supplying: ${selected.name}` : "Select a product"}</h3>
            {!selected && <div className="empty-state">Click a product on the left to compare vendors.</div>}

            {selected && offers.length === 0 && (
              <div className="empty-state">No vendor currently supplies this product.</div>
            )}

            {selected && offers.length > 0 && (
              <>
                <div className="field" style={{ maxWidth: 140, marginBottom: 16 }}>
                  <label>Quantity to order</label>
                  <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </div>

                {offers.map((o, idx) => (
                  <div key={o.vendor_id} className={`vendor-compare-row ${idx === 0 ? "cheapest" : ""}`}>
                    <div>
                      <div>
                        {o.vendor_name}
                        {idx === 0 && <span className="badge-best">lowest price</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        Rating {o.rating.toFixed(1)} · Lead time {o.lead_time_days}d
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span className="mono">₹{o.price.toFixed(2)}</span>
                      <button
                        className="btn btn-small"
                        disabled={placing === o.vendor_id}
                        onClick={() => handlePlaceOrder(o.vendor_id)}
                      >
                        {placing === o.vendor_id ? "Placing..." : "Order"}
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {message && <p style={{ marginTop: 14, fontSize: 13, color: "var(--text-muted)" }}>{message}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
