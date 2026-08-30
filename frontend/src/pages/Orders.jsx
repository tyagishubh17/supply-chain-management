import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";

export default function Orders() {
  const { session } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [warehouseId, setWarehouseId] = useState(1);

  async function load() {
    setLoading(true);
    try {
      const data = await api.listOrders();
      setOrders(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleConfirm(orderId) {
    setBusyId(orderId);
    try {
      await api.confirmOrder(orderId);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleReserve(orderId) {
    setBusyId(orderId);
    try {
      await api.reserveStock(orderId, Number(warehouseId));
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>{session?.role === "enterprise" ? "My orders" : session?.role === "vendor" ? "Incoming orders" : "Orders"}</h2>
        <p>Order moves: pending → vendor confirms → warehouse reserves stock → shipped → delivered.</p>
      </div>

      {error && <div className="error-box">{error}</div>}

      {session?.role === "warehouse_staff" && (
        <div className="field" style={{ maxWidth: 200, marginBottom: 16 }}>
          <label>Reserve from warehouse ID</label>
          <input type="number" min="1" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} />
        </div>
      )}

      <div className="panel">
        {loading ? (
          <p style={{ color: "var(--text-muted)" }}>Loading orders...</p>
        ) : orders.length === 0 ? (
          <div className="empty-state">No orders yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Buyer</th>
                <th>Vendor</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Total</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="mono">#{o.id}</td>
                  <td>{o.buyer}</td>
                  <td>{o.vendor}</td>
                  <td>{o.product}</td>
                  <td className="num">{o.quantity}</td>
                  <td className="num">₹{o.line_total.toFixed(2)}</td>
                  <td><span className={`status ${o.status}`}>{o.status.replace(/_/g, " ")}</span></td>
                  <td>
                    {session?.role === "vendor" && o.status === "pending" && (
                      <button className="btn btn-small" disabled={busyId === o.id} onClick={() => handleConfirm(o.id)}>
                        {busyId === o.id ? "..." : "Confirm"}
                      </button>
                    )}
                    {(session?.role === "warehouse_staff" || session?.role === "admin") && o.status === "vendor_confirmed" && (
                      <button className="btn btn-small" disabled={busyId === o.id} onClick={() => handleReserve(o.id)}>
                        {busyId === o.id ? "..." : "Reserve stock"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
