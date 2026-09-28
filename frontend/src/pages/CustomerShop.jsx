import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { money } from "../format";

/**
 * Requirements 5, 6, 7 and 8: browse available products from every vendor,
 * search by name, open one to see its supplier, and place an order.
 *
 * The listing only contains products that can actually be ordered -- the
 * backend view already filters out archived and out-of-stock rows. The
 * quantity is checked here for a quick message and again in the database,
 * which is what actually prevents an invalid order.
 */
export default function CustomerShop() {
  const [products, setProducts] = useState(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState("1");
  const [orderError, setOrderError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (term) => {
    try {
      setProducts(await api.catalogue(term));
    } catch (err) {
      setError(err.message);
      setProducts([]);
    }
  }, []);

  // Debounced so typing searches as you go without a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => load(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search, load]);

  function openProduct(product) {
    setSelected(product);
    setQty("1");
    setOrderError("");
  }

  async function submitOrder(e) {
    e.preventDefault();
    setOrderError("");
    const wanted = Number(qty);

    // Fast client-side guard. Requirement 8 is clear that this is not
    // sufficient on its own, so place_order() re-checks in the database.
    if (!Number.isInteger(wanted) || wanted < 1) {
      setOrderError("Enter a quantity of at least 1.");
      return;
    }
    if (wanted > selected.available_quantity) {
      setOrderError(`Only ${selected.available_quantity} units are currently available.`);
      return;
    }

    setBusy(true);
    try {
      const res = await api.placeOrder(selected.product_id, wanted);
      setNotice(
        `Order #${res.order_id} placed for ${wanted} × ${selected.product_name}. ` +
          `It is pending until ${selected.supplier_name} accepts it.`,
      );
      setSelected(null);
      await load(search.trim());
    } catch (err) {
      setOrderError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Browse products</h1>
        <p>Available products from all suppliers. Click a product to see its supplier and order.</p>
      </div>

      {error && <div className="error-box">{error}</div>}
      {notice && <div className="notice-box">{notice}</div>}

      <div className="search-bar">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by product name…"
          aria-label="Search products by name"
        />
      </div>

      <div className="panel">
        {products === null ? (
          <div className="loading">Loading…</div>
        ) : products.length === 0 ? (
          <div className="empty-state">
            {search.trim()
              ? `No products match "${search.trim()}".`
              : "No products are available right now."}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Supplier</th>
                  <th className="num">Price</th>
                  <th className="num">Available</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.product_id}>
                    <td className="name">{p.product_name}</td>
                    <td>{p.supplier_name}</td>
                    <td className="num">{money(p.price)}</td>
                    <td className="num">{p.available_quantity}</td>
                    <td>
                      <button className="btn btn-sm" onClick={() => openProduct(p)}>
                        View &amp; order
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{selected.product_name}</h2>

            <dl className="detail-list">
              <div>
                <dt>Supplier</dt>
                <dd>{selected.supplier_name}</dd>
              </div>
              <div>
                <dt>Price</dt>
                <dd>{money(selected.price)}</dd>
              </div>
              <div>
                <dt>Available quantity</dt>
                <dd>{selected.available_quantity}</dd>
              </div>
            </dl>

            {orderError && (
              <div className="error-box" style={{ marginTop: 14 }}>
                {orderError}
              </div>
            )}

            <form onSubmit={submitOrder}>
              <div className="field" style={{ marginTop: 14 }}>
                <label htmlFor="qty">Quantity to order</label>
                <input
                  id="qty"
                  type="number"
                  min="1"
                  max={selected.available_quantity}
                  step="1"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Order total:{" "}
                <strong>{money(Number(selected.price) * (Number(qty) || 0))}</strong>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setSelected(null)}>
                  Close
                </button>
                <button className="btn" disabled={busy}>
                  {busy ? "Placing…" : "Place order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
