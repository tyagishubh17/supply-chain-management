import { useEffect, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { api } from "../api";
import { ChartTooltip } from "../components/ChartTooltip";
import { CHART_COLORS, STATUS_COLORS } from "../chartTheme";

const money = (v) => `₹${Number(v).toFixed(0)}`;

export default function EnterpriseDashboard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.enterpriseSummary().then(setSummary).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "var(--text-muted)" }}>Loading dashboard...</p>;
  if (error) return <div className="error-box">{error}</div>;

  const kpis = summary?.kpis || { total_orders: 0, total_spend: 0, active_orders: 0 };
  const spendTrend = (summary?.spend_by_month || []).map((r) => ({ month: r.month, spend: Number(r.spend) }));
  const statusData = (summary?.orders_by_status || []).map((s) => ({ name: s.status, value: s.count }));
  const topVendors = (summary?.top_vendors || []).map((v) => ({ vendor: v.vendor_name, spend: Number(v.spend) }));

  return (
    <div>
      <div className="page-header">
        <h2>Procurement overview</h2>
        <p>Your spend trend, order pipeline, and top vendors.</p>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Total orders</div>
          <div className="kpi-value">{kpis.total_orders}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total spend</div>
          <div className="kpi-value">{money(kpis.total_spend)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Active orders</div>
          <div className="kpi-value">{kpis.active_orders}</div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-panel">
          <h3>Spend by month</h3>
          <p className="chart-subtitle">Total order value placed per month</p>
          {spendTrend.length === 0 ? (
            <div className="empty-state">Not enough order history yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={spendTrend}>
                <CartesianGrid stroke={CHART_COLORS.border} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" stroke={CHART_COLORS.muted} fontSize={12} />
                <YAxis stroke={CHART_COLORS.muted} fontSize={12} />
                <Tooltip content={<ChartTooltip formatter={money} />} />
                <Line type="monotone" dataKey="spend" stroke={CHART_COLORS.info} strokeWidth={2} dot={{ r: 3 }} />
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

      <div className="chart-panel">
        <h3>Top vendors by spend</h3>
        <p className="chart-subtitle">Who you buy the most from</p>
        {topVendors.length === 0 ? (
          <div className="empty-state">No orders yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topVendors} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid stroke={CHART_COLORS.border} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" stroke={CHART_COLORS.muted} fontSize={12} />
              <YAxis type="category" dataKey="vendor" stroke={CHART_COLORS.muted} fontSize={12} width={140} />
              <Tooltip content={<ChartTooltip formatter={money} />} />
              <Bar dataKey="spend" fill={CHART_COLORS.accent} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
