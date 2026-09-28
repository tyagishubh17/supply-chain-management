import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { money, orderDate } from "../format";

/**
 * Requirements 3.1 - 3.4: add a product, view own products, change the
 * price, delete a product. Every request is scoped to the signed-in vendor
 * by the token, so this page can only ever show or change their own rows.
 */
export default function VendorProducts() {
  const [products, setProducts] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [adding, setAdding] = useState(false);

  // Which row is being repriced, and the value typed in so far.
  const [editingId, setEditingId] = useState(null);
  const [editPrice, setEditPrice] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setProducts(await api.myProducts());
    } catch (err) {
      setError(err.message);
      setProducts([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setAdding(true);
    try {
      const created = await api.addProduct({
        product_name: name.trim(),
        price,
        quantity: Number(quantity),
      });
      setName("");
      setPrice("");
      setQuantity("");
      setNotice(`Added "${created.product_name}".`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleSavePrice(productId) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await api.updatePrice(productId, editPrice);
      setEditingId(null);
      setNotice("Price updated.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(product) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const res = await api.deleteProduct(product.product_id);
      setConfirmDelete(null);
      // The backend reports whether the row was removed outright or
      // archived because existing orders reference it.
      setNotice(res.message);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>My products</h1>
        <p>Products you supply. Quantity falls only when you accept an order.</p>
      </div>

      {error && <div className="error-box">{error}</div>}
      {notice && <div className="notice-box">{notice}</div>}

      <div className="panel">
        <h2>Add a product</h2>
        <p className="panel-sub">The product is registered against your account.</p>
        <form onSubmit={handleAdd} className="form-row">
          <div className="field">
            <label htmlFor="pname">Product name</label>
            <input
              id="pname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={150}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="pprice">Price (₹)</label>
            <input
              id="pprice"
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="pqty">Quantity</label>
            <input
              id="pqty"
              type="number"
              min="0"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </div>
          <button className="btn" disabled={adding}>
            {adding ? "Adding…" : "Add product"}
          </button>
        </form>
      </div>

      <div className="panel">
        <h2>Catalogue</h2>
        <p className="panel-sub">
          {products ? `${products.length} product${products.length === 1 ? "" : "s"}` : ""}
        </p>

        {products === null ? (
          <div className="loading">Loading…</div>
        ) : products.length === 0 ? (
          <div className="empty-state">No products yet. Add your first one above.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Price</th>
                  <th className="num">Available</th>
                  <th>Added</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.product_id}>
                    <td className="name">{p.product_name}</td>
                    <td className="num">
                      {editingId === p.product_id ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          style={{ width: 110, textAlign: "right" }}
                          autoFocus
                        />
                      ) : (
                        money(p.price)
                      )}
                    </td>
                    <td className="num">{p.quantity}</td>
                    <td>{orderDate(p.created_at)}</td>
                    <td>{orderDate(p.updated_at)}</td>
                    <td>
                      <div className="actions">
                        {editingId === p.product_id ? (
                          <>
                            <button
                              className="btn btn-sm"
                              disabled={busy}
                              onClick={() => handleSavePrice(p.product_id)}
                            >
                              Save
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => {
                                setEditingId(p.product_id);
                                setEditPrice(String(p.price));
                              }}
                            >
                              Edit price
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => setConfirmDelete(p)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Delete product</h2>
            <p style={{ marginTop: 0, fontSize: "0.9rem" }}>
              Remove <strong>{confirmDelete.product_name}</strong> from your catalogue?
              If it appears in existing orders it is archived instead of deleted,
              so the order history is preserved.
            </p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>
                Keep it
              </button>
              <button
                className="btn btn-danger"
                disabled={busy}
                onClick={() => handleDelete(confirmDelete)}
              >
                {busy ? "Removing…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
