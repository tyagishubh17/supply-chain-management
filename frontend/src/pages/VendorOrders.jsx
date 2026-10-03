import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { money, orderDate, orderTime } from "../format";

/**
 * Requirements 10 - 13: the incoming order queue with Accept, Reject and
 * Cancel. Accepting is the only action that reduces stock; rejecting never
 * does; cancelling requires a reason, which is stored and then shown here
 * and on the customer's own order list.
 */
export default function VendorOrders() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState(null);

  // The order being cancelled, plus the typed reason.
  const [cancelling, setCancelling] = useState(null);
  const [reason, setReason] = useState("");
  // Rendered inside the dialog: the page-level error box sits behind the
  // modal backdrop, so the vendor would never see the refusal.
  const [cancelError, setCancelError] = useState("");

  const load = useCallback(async () => {
    try {
      setOrders(await api.incomingOrders());
    } catch (err) {
      setError(err.message);
      setOrders([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The customer places orders while this tab may be sitting open, so the
  // queue is refetched whenever the vendor comes back to the tab.
  useEffect(() => {
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  // Escape closes the dialog, the same as clicking the backdrop.
  useEffect(() => {
    if (!cancelling) return;
    const onKey = (e) => {
      if (e.key === "Escape") setCancelling(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancelling]);

  async function act(order, action) {
    setError("");
    setNotice("");
    setBusyId(order.order_id);
    try {
      if (action === "accept") {
        await api.acceptOrder(order.order_id);
        setNotice(
          `Order #${order.order_id} accepted. ${order.quantity} × ${order.product_name} removed from stock.`,
        );
      } else {
        await api.rejectOrder(order.order_id);
        setNotice(`Order #${order.order_id} rejected. Stock unchanged.`);
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function submitCancel(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setCancelError("");
    setBusyId(cancelling.order_id);
    try {
      await api.cancelOrder(cancelling.order_id, reason.trim());
      setNotice(`Order #${cancelling.order_id} cancelled. The reason is visible to the customer.`);
      setCancelling(null);
      setReason("");
      await load();
    } catch (err) {
      setCancelError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const pendingCount = orders?.filter((o) => o.status === "PENDING").length ?? 0;

  return (
    <>
      <div className="page-header">
        <h1>Incoming orders</h1>
        <p>
          {pendingCount > 0
            ? `${pendingCount} order${pendingCount === 1 ? "" : "s"} awaiting your decision.`
            : "Orders placed against your products."}
        </p>
      </div>

      {error && <div className="error-box" role="alert">{error}</div>}
      {notice && <div className="notice-box" role="status">{notice}</div>}

      <div className="panel">
        {orders === null ? (
          <div className="loading" role="status">Loading…</div>
        ) : orders.length === 0 ? (
          error ? null : <div className="empty-state">No orders yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {/* The order number identifies the row the vendor decides;
                      two orders of the same product look identical without it. */}
                  <th className="num">Order</th>
                  <th>Customer</th>
                  <th>Product</th>
                  <th className="num">Qty</th>
                  <th className="num">Value</th>
                  <th>Ordered</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.order_id}>
                    <td className="num">{o.order_id}</td>
                    <td className="name">{o.customer_name}</td>
                    <td>{o.product_name}</td>
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
                      <div className="actions">
                        {o.status === "PENDING" && (
                          <>
                            <button
                              className="btn btn-sm"
                              disabled={busyId === o.order_id}
                              onClick={() => act(o, "accept")}
                            >
                              Accept
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              disabled={busyId === o.order_id}
                              onClick={() => act(o, "reject")}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {/* A pending or already-accepted order can still be
                            cancelled; a rejected or cancelled one cannot. */}
                        {(o.status === "PENDING" || o.status === "ACCEPTED") && (
                          <button
                            className="btn btn-danger btn-sm"
                            disabled={busyId === o.order_id}
                            onClick={() => {
                              setCancelling(o);
                              setReason("");
                              setCancelError("");
                            }}
                          >
                            Cancel
                          </button>
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

      {cancelling && (
        <div className="modal-backdrop" onClick={() => setCancelling(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Cancel order #${cancelling.order_id}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Cancel order #{cancelling.order_id}</h2>
            <p style={{ marginTop: 0, fontSize: "0.9rem", color: "var(--text-muted)" }}>
              {cancelling.quantity} × {cancelling.product_name} for {cancelling.customer_name}.
              {cancelling.status === "ACCEPTED" &&
                " This order was already accepted, so the units return to your stock."}
            </p>
            {cancelError && <div className="error-box" role="alert">{cancelError}</div>}
            <form onSubmit={submitCancel}>
              <div className="field">
                <label htmlFor="reason">Reason for cancellation (required)</label>
                <textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Product damaged during quality inspection."
                  minLength={3}
                  maxLength={500}
                  required
                  autoFocus
                />
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--text-faint)", margin: 0 }}>
                The reason is stored with the order and shown to the customer.
              </p>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setCancelling(null)}>
                  Keep order
                </button>
                <button className="btn btn-danger" disabled={busyId === cancelling.order_id}>
                  {busyId === cancelling.order_id ? "Cancelling…" : "Cancel order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
