import { useEffect, useState } from "react";
import { api } from "../api";
import { money, orderDate, orderTime } from "../format";

/**
 * Requirement 14: the customer's own order history, with the supplier,
 * quantity, price, date, time, status and -- when the vendor cancelled --
 * the stored cancellation reason.
 */
export default function CustomerOrders() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.myOrders().then(setOrders).catch((err) => {
      setError(err.message);
      setOrders([]);
    });
  }, []);

  return (
    <>
      <div className="page-header">
        <h1>My orders</h1>
        <p>Every order you have placed, newest first.</p>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="panel">
        {orders === null ? (
          <div className="loading">Loading…</div>
        ) : orders.length === 0 ? (
          // A failed fetch leaves the list empty, so the empty state is
          // suppressed rather than claiming there are no orders.
          error ? null : (
            <div className="empty-state">
              You have not placed any orders yet.
            </div>
          )
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Supplier</th>
                  <th className="num">Qty</th>
                  <th className="num">Price</th>
                  <th>Ordered</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.order_id}>
                    <td className="name">{o.product_name}</td>
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
                      {/* The vendor's stored reason, shown to the customer
                          as well as on the vendor's own dashboard. */}
                      {o.cancellation_reason && (
                        <div className="reason-box">
                          <span className="reason-label">Reason</span>
                          {o.cancellation_reason}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
