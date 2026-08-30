import { useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { api } from "../api";
import { ChartTooltip } from "../components/ChartTooltip";
import { CHART_COLORS } from "../chartTheme";

export default function WarehouseDashboard() {
  const [lowStock, setLowStock] = useState([]);
  const [reorders, setReorders] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function loadAll() {
    setLoading(true);
    try {
      const [ls, rr, sh, inv] = await Promise.all([
        api.lowStock(),
        api.reorderRequests(),
        api.shipments(),
        api.inventoryLevels(),
      ]);
      setLowStock(ls);
      setReorders(rr);
      setShipments(sh);
      setInventory(inv);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function handleRunReorder() {
    setRunning(true);
    try {
      await api.runAutoReorder();
      await loadAll();
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  const chartData = inventory.map((i) => ({
    product: `${i.product_name} (${i.warehouse_name})`,
    quantity: i.quantity,
    reorder_level: i.reorder_level,
  }));

  return (
    <div>
      <div className="page-header">
        <h2>Warehouse operations</h2>
        <p>Stock levels, restock requests, and shipment tracking.</p>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="chart-panel">
        <h3>Stock levels vs. reorder threshold</h3>
        <p className="chart-subtitle">Current quantity per product, by warehouse</p>
        {chartData.length === 0 ? (
          <div className="empty-state">No inventory data yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 42)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid stroke={CHART_COLORS.border} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" stroke={CHART_COLORS.muted} fontSize={12} />
              <YAxis type="category" dataKey="product" stroke={CHART_COLORS.muted} fontSize={12} width={160} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: CHART_COLORS.muted }} />
              <Bar dataKey="quantity" name="In stock" fill={CHART_COLORS.info} radius={[0, 3, 3, 0]} />
              <Bar dataKey="reorder_level" name="Reorder level" fill={CHART_COLORS.danger} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="panel">
        <h3>Low stock alerts</h3>
        {loading ? (
          <p style={{ color: "var(--text-muted)" }}>Loading...</p>
        ) : lowStock.length === 0 ? (
          <div className="empty-state">Nothing below reorder level right now.</div>
        ) : (
          <>
            <table>
              <thead>
                <tr><th>Warehouse</th><th>Product</th><th>Quantity</th><th>Reorder level</th></tr>
              </thead>
              <tbody>
                {lowStock.map((r, i) => (
                  <tr key={i}>
                    <td>{r.warehouse_name}</td>
                    <td>{r.product_name}</td>
                    <td className="num" style={{ color: "var(--danger)" }}>{r.quantity}</td>
                    <td className="num">{r.reorder_level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn" style={{ marginTop: 14 }} disabled={running} onClick={handleRunReorder}>
              {running ? "Running..." : "Run auto-reorder check"}
            </button>
          </>
        )}
      </div>

      <div className="panel">
        <h3>Reorder requests</h3>
        {reorders.length === 0 ? (
          <div className="empty-state">No draft reorder requests yet.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Warehouse</th><th>Product</th><th>Vendor</th><th>Qty</th><th>Status</th></tr>
            </thead>
            <tbody>
              {reorders.map((r) => (
                <tr key={r.id}>
                  <td>{r.warehouse}</td>
                  <td>{r.product}</td>
                  <td>{r.vendor}</td>
                  <td className="num">{r.quantity}</td>
                  <td><span className={`status ${r.status}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h3>Shipments</h3>
        {shipments.length === 0 ? (
          <div className="empty-state">No shipments dispatched yet.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Shipment</th><th>Order</th><th>Transporter</th><th>Destination</th><th>Status</th></tr>
            </thead>
            <tbody>
              {shipments.map((s) => (
                <tr key={s.shipment_id}>
                  <td className="mono">#{s.shipment_id}</td>
                  <td className="mono">#{s.order_id}</td>
                  <td>{s.transporter}</td>
                  <td>{s.destination}</td>
                  <td><span className={`status ${s.status}`}>{s.status.replace(/_/g, " ")}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
