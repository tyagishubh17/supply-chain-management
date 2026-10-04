import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { money, orderDate, orderTime } from "../format";

/**
 * Requirement 14: the customer's own order history, with the supplier,
 * quantity, price, date, time, status, cancellation reason, and the ability
 * to cancel a pending order.
 */
export default function CustomerOrders() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [cancellingOrder, setCancellingOrder] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    api.myOrders()
      .then((rows) => {
        setOrders(rows);
        setError("");
      })
      .catch((err) => {
        setError(err.message);
        setOrders([]);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Refetch when tab regains focus
  useEffect(() => {
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  // Escape closes cancellation modal
  useEffect(() => {
    if (!cancellingOrder) return;
    const onKey = (e) => {
      if (e.key === "Escape") setCancellingOrder(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancellingOrder]);

  async function handleCancel(order) {
    setError("");
    setNotice("");
    setBusyId(order.order_id);
    try {
      await api.cancelMyOrder(order.order_id);
      setNotice("ORDER CANCELLED");
      setCancellingOrder(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const counts = useMemo(() => {
    if (!orders) return { ALL: 0, PENDING: 0, ACCEPTED: 0, REJECTED: 0, CANCELLED: 0 };
    return {
      ALL: orders.length,
      PENDING: orders.filter((o) => o.status === "PENDING").length,
      ACCEPTED: orders.filter((o) => o.status === "ACCEPTED").length,
      REJECTED: orders.filter((o) => o.status === "REJECTED").length,
      CANCELLED: orders.filter((o) => o.status === "CANCELLED").length,
    };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (!orders) return null;
    if (statusFilter === "ALL") return orders;
    return orders.filter((o) => o.status === statusFilter);
  }, [orders, statusFilter]);

  return (
    <>
      <div className="page-header">
        <h1>My orders</h1>
        <p>Every order you have placed, newest first.</p>
      </div>

      {error && <div className="error-box" role="alert">{error}</div>}
      {notice && <div className="notice-box" role="status">{notice}</div>}

      <div className="role-toggle" style={{ marginBottom: 16 }}>
        {["ALL", "PENDING", "ACCEPTED", "REJECTED", "CANCELLED"].map((st) => (
          <button
            key={st}
            type="button"
            aria-pressed={statusFilter === st}
            onClick={() => setStatusFilter(st)}
          >
            {st === "ALL" ? "All Orders" : st} ({counts[st]})
          </button>
        ))}
      </div>

      <div className="panel">
        {filteredOrders === null ? (
          <div className="loading" role="status">Loading…</div>
        ) : filteredOrders.length === 0 ? (
          error ? null : (
            <div className="empty-state">
              {statusFilter !== "ALL"
                ? `You have no ${statusFilter.toLowerCase()} orders.`
                : "You have not placed any orders yet."}
            </div>
          )
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="num">Order</th>
                  <th>Product</th>
                  <th>Supplier</th>
                  <th className="num">Qty</th>
                  <th className="num">Price</th>
                  <th>Ordered</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((o) => (
                  <tr key={o.order_id}>
                    <td className="num">{o.order_id}</td>
                    <td className="name">
                      {o.product_name}
                      {(o.shipping_address || o.contact_phone) && (
                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 4 }}>
                          📍 Deliver to: {o.shipping_address || "Standard"}
                          {o.contact_phone ? ` (📞 ${o.contact_phone})` : ""}
                        </div>
                      )}
                    </td>
                    <td>{o.supplier_name}</td>
                    <td className="num">{o.quantity}</td>
                    <td className="num">
                      {money(o.line_total)}
                      <span className="sub">{money(o.unit_price)} each</span>
                    </td>
                    <td>
                      {orderDate(o.ordered_at)}
                      <span className="sub">{orderTime(o.ordered_at)}</span>
                    </td>
                    <td>
                      <span className={`status ${o.status}`}>{o.status}</span>
                      {o.cancellation_reason && (
                        <div className="reason-box">
                          <span className="reason-label">Reason</span>
                          {o.cancellation_reason}
                        </div>
                      )}
                    </td>
                    <td>
                      {o.status === "PENDING" && (
                        <button
                          className="btn btn-danger btn-sm"
                          disabled={busyId === o.order_id}
                          onClick={() => setCancellingOrder(o)}
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {cancellingOrder && (
        <div className="modal-backdrop" onClick={() => setCancellingOrder(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Cancel order #${cancellingOrder.order_id}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Cancel order #{cancellingOrder.order_id}?</h2>
            <p style={{ marginTop: 0, fontSize: "0.9rem", color: "var(--text-muted)" }}>
              Are you sure you want to cancel your order for <strong>{cancellingOrder.quantity} × {cancellingOrder.product_name}</strong> from <strong>{cancellingOrder.supplier_name}</strong>?
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setCancellingOrder(null)}>
                Keep order
              </button>
              <button
                className="btn btn-danger"
                disabled={busyId === cancellingOrder.order_id}
                onClick={() => handleCancel(cancellingOrder)}
              >
                {busyId === cancellingOrder.order_id ? "Cancelling…" : "Cancel order"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

