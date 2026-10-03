import { useCallback, useEffect, useMemo, useState } from "react";
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

  // Status filter and search query
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals: Cancel and Reject
  const [cancelling, setCancelling] = useState(null);
  const [reason, setReason] = useState("");
  const [cancelError, setCancelError] = useState("");

  const [rejectingOrder, setRejectingOrder] = useState(null);

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

  // Escape closes any open dialog
  useEffect(() => {
    if (!cancelling && !rejectingOrder) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setCancelling(null);
        setRejectingOrder(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancelling, rejectingOrder]);

  async function handleAccept(order) {
    setError("");
    setNotice("");
    setBusyId(order.order_id);
    try {
      await api.acceptOrder(order.order_id);
      setNotice(
        `Order #${order.order_id} accepted. ${order.quantity} × ${order.product_name} removed from stock.`
      );
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(order) {
    setError("");
    setNotice("");
    setBusyId(order.order_id);
    try {
      await api.rejectOrder(order.order_id);
      setNotice(`Order #${order.order_id} rejected. Stock unchanged.`);
      setRejectingOrder(null);
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
    return orders.filter((o) => {
      if (statusFilter !== "ALL" && o.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesCustomer = o.customer_name?.toLowerCase().includes(q);
        const matchesProduct = o.product_name?.toLowerCase().includes(q);
        const matchesId = String(o.order_id).includes(q);
        if (!matchesCustomer && !matchesProduct && !matchesId) return false;
      }
      return true;
    });
  }, [orders, statusFilter, searchQuery]);

  const pendingCount = counts.PENDING;

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

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <div className="role-toggle" style={{ margin: 0 }}>
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

        <div className="search-bar" style={{ margin: 0, flex: "1 1 200px" }}>
          <input
            type="search"
            placeholder="Search by customer, product, or order #…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search orders"
          />
        </div>
      </div>

      <div className="panel">
        {filteredOrders === null ? (
          <div className="loading" role="status">Loading…</div>
        ) : filteredOrders.length === 0 ? (
          error ? null : (
            <div className="empty-state">
              {searchQuery.trim() || statusFilter !== "ALL"
                ? "No orders match the current filter or search."
                : "No orders yet."}
            </div>
          )
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
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
                {filteredOrders.map((o) => {
                  const isLowStock =
                    o.status === "PENDING" &&
                    o.current_stock !== undefined &&
                    o.current_stock !== null &&
                    o.quantity > o.current_stock;

                  return (
                    <tr key={o.order_id}>
                      <td className="num">{o.order_id}</td>
                      <td className="name">
                        {o.customer_name}
                        {(o.shipping_address || o.contact_phone) && (
                          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 4 }}>
                            📍 {o.shipping_address || "No address specified"}
                            {o.contact_phone ? ` (📞 ${o.contact_phone})` : ""}
                          </div>
                        )}
                      </td>
                      <td>
                        {o.product_name}
                        {isLowStock && (
                          <div style={{ fontSize: "0.75rem", color: "var(--red)", marginTop: 2, fontWeight: 500 }}>
                            ⚠️ Insufficient stock (Need {o.quantity}, Stock: {o.current_stock})
                          </div>
                        )}
                      </td>
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
                                disabled={busyId === o.order_id || isLowStock}
                                onClick={() => handleAccept(o)}
                                title={isLowStock ? "Cannot accept: restock required" : "Accept order"}
                              >
                                Accept
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                disabled={busyId === o.order_id}
                                onClick={() => setRejectingOrder(o)}
                              >
                                Reject
                              </button>
                            </>
                          )}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rejectingOrder && (
        <div className="modal-backdrop" onClick={() => setRejectingOrder(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Reject order #${rejectingOrder.order_id}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Reject order #{rejectingOrder.order_id}?</h2>
            <p style={{ marginTop: 0, fontSize: "0.9rem", color: "var(--text-muted)" }}>
              Are you sure you want to reject this order of <strong>{rejectingOrder.quantity} × {rejectingOrder.product_name}</strong> for <strong>{rejectingOrder.customer_name}</strong>? Stock will remain unchanged.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setRejectingOrder(null)}>
                Keep order
              </button>
              <button
                className="btn btn-danger"
                disabled={busyId === rejectingOrder.order_id}
                onClick={() => handleReject(rejectingOrder)}
              >
                {busyId === rejectingOrder.order_id ? "Rejecting…" : "Reject order"}
              </button>
            </div>
          </div>
        </div>
      )}

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

