import { useEffect, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell,
} from "recharts";
import { api } from "../api";
import { ChartTooltip } from "../components/ChartTooltip";
import { CHART_COLORS, STATUS_COLORS } from "../chartTheme";

const money = (v) => `₹${Number(v).toFixed(0)}`;

export default function VendorDashboard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.vendorSummary().then(setSummary).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "var(--text-muted)" }}>Loading dashboard...</p>;
  if (error) return <div className="error-box">{error}</div>;

  const kpis = summary?.kpis || { total_orders: 0, total_revenue: 0, active_orders: 0 };
  const revenueTrend = (summary?.revenue_by_month || []).map((r) => ({ month: r.month, revenue: Number(r.revenue) }));
  const statusData = (summary?.orders_by_status || []).map((s) => ({ name: s.status, value: s.count }));

  return (
    <div>
      <div className="page-header">
        <h2>Sales summary</h2>
        <p>Your revenue trend and order pipeline at a glance.</p>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Total orders</div>
          <div className="kpi-value">{kpis.total_orders}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total revenue</div>
          <div className="kpi-value">{money(kpis.total_revenue)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Active orders</div>
          <div className="kpi-value">{kpis.active_orders}</div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-panel">
          <h3>Revenue by month</h3>
          <p className="chart-subtitle">Order value recognized per month</p>
          {revenueTrend.length === 0 ? (
            <div className="empty-state">Not enough order history yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={revenueTrend}>
                <CartesianGrid stroke={CHART_COLORS.border} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" stroke={CHART_COLORS.muted} fontSize={12} />
                <YAxis stroke={CHART_COLORS.muted} fontSize={12} />
                <Tooltip content={<ChartTooltip formatter={money} />} />
                <Line type="monotone" dataKey="revenue" stroke={CHART_COLORS.accent} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="chart-panel">
          <h3>Orders by status</h3>
          <p className="chart-subtitle">Where your orders currently sit</p>
          {statusData.length === 0 ? (
            <div className="empty-state">No orders yet.</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {statusData.map((entry, i) => (
                      <Cell key={i} fill={STATUS_COLORS[entry.name] || CHART_COLORS.muted} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="status-legend">
                {statusData.map((s) => (
                  <span key={s.name}>
                    <span className="dot" style={{ background: STATUS_COLORS[s.name] || CHART_COLORS.muted }} />
                    {s.name.replace(/_/g, " ")} ({s.value})
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
