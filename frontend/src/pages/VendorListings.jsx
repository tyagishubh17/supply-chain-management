import { useEffect, useState } from "react";
import { api } from "../api";

export default function VendorListings() {
  const [allProducts, setAllProducts] = useState([]);
  const [listings, setListings] = useState([]);
  const [productId, setProductId] = useState("");
  const [price, setPrice] = useState("");
  const [leadTime, setLeadTime] = useState(3);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadAll() {
    setLoading(true);
    try {
      const [products, mine] = await Promise.all([api.listProducts(), api.myListings()]);
      setAllProducts(products);
      setListings(mine);
      if (products.length && !productId) setProductId(String(products[0].id));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await api.upsertListing({ product_id: Number(productId), price: Number(price), lead_time_days: Number(leadTime) });
      setMessage("Listing saved.");
      setPrice("");
      await loadAll();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>My listings</h2>
        <p>Add products you supply and set your price so enterprises can find and order from you.</p>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="panel">
        <h3>Add or update a listing</h3>
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ minWidth: 200 }}>
            <label>Product</label>
            <select value={productId} onChange={(e) => setProductId(e.target.value)}>
              {allProducts.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ maxWidth: 140 }}>
            <label>Price (₹)</label>
            <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
          </div>
          <div className="field" style={{ maxWidth: 140 }}>
            <label>Lead time (days)</label>
            <input type="number" min="0" value={leadTime} onChange={(e) => setLeadTime(e.target.value)} required />
          </div>
          <button className="btn" disabled={saving} style={{ marginBottom: 14 }}>
            {saving ? "Saving..." : "Save listing"}
          </button>
        </form>
        {message && <p style={{ fontSize: 13, color: "var(--success)" }}>{message}</p>}
      </div>

      <div className="panel">
        <h3>Your current listings</h3>
        {loading ? (
          <p style={{ color: "var(--text-muted)" }}>Loading...</p>
        ) : listings.length === 0 ? (
          <div className="empty-state">You haven't listed any products yet.</div>
        ) : (
          <table>
            <thead><tr><th>Product</th><th>Price</th><th>Lead time</th></tr></thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.product_id}>
                  <td>{l.product_name}</td>
                  <td className="mono">₹{l.price.toFixed(2)}</td>
                  <td className="mono">{l.lead_time_days}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
