import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";
import ChartTooltip from "../components/ChartTooltip";
import { CHART, formatDayLabel } from "../chartTheme";
import { money } from "../format";

/**
 * Requirement 15: a small sales view. Every figure comes from the database
 * -- revenue is the sum over ACCEPTED orders only, so rejected and
 * cancelled orders never inflate it. Nothing here is static or mocked.
 */
export default function VendorSales() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.salesSummary().then(setData).catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="error-box" role="alert">{error}</div>;
  if (!data) return <div className="loading" role="status">Loading…</div>;

  // Only products that have actually sold belong in a "sales by product"
  // chart; the rest would be a row of empty bars.
  const productBars = data.sales_by_product
    .filter((p) => Number(p.revenue) > 0)
    .map((p) => ({ ...p, revenue: Number(p.revenue), units_sold: Number(p.units_sold) }));

  const timeline = data.orders_over_time.map((d) => ({
    ...d,
    label: formatDayLabel(d.order_day),
    revenue: Number(d.revenue),
  }));

  return (
    <>
      <div className="page-header">
        <h1>Sales</h1>
        <p>Accepted orders only. Rejected and cancelled orders are not counted as revenue.</p>
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="label">Total revenue</div>
          <div className="value">{money(data.total_revenue)}</div>
        </div>
        <div className="stat">
          <div className="label">Accepted orders</div>
          <div className="value">{data.accepted_orders}</div>
        </div>
        <div className="stat">
          <div className="label">Awaiting decision</div>
          <div className="value">{data.pending_orders}</div>
        </div>
      </div>

      <div className="panel">
        <h2>Revenue by product</h2>
        <p className="panel-sub">Total value of accepted orders per product.</p>
        {productBars.length === 0 ? (
          <div className="empty-state">No accepted orders yet.</div>
        ) : (
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={productBars} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis
                  dataKey="product_name"
                  tick={{ fill: CHART.axis, fontSize: 12 }}
                  stroke={CHART.grid}
                />
                <YAxis
                  tick={{ fill: CHART.axis, fontSize: 12 }}
                  stroke={CHART.grid}
                  tickFormatter={(v) => `₹${(v / 1000).toLocaleString("en-IN")}k`}
                />
                <Tooltip
                  content={<ChartTooltip formatter={money} />}
                  cursor={{ fill: "rgba(47,107,70,0.06)" }}
                />
                <Bar dataKey="revenue" name="Revenue" fill={CHART.green} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Orders over time</h2>
        <p className="panel-sub">Orders received per day, and how many you accepted.</p>
        {timeline.length === 0 ? (
          <div className="empty-state">No orders yet.</div>
        ) : (
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: CHART.axis, fontSize: 12 }} stroke={CHART.grid} />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: CHART.axis, fontSize: 12 }}
                  stroke={CHART.grid}
                />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="order_count"
                  name="Orders received"
                  stroke={CHART.green}
                  strokeWidth={2}
                  dot={{ r: 3, fill: CHART.green }}
                />
                <Line
                  type="monotone"
                  dataKey="accepted_count"
                  name="Accepted"
                  stroke={CHART.greenLight}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={{ r: 3, fill: CHART.greenLight }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Units sold</h2>
        <p className="panel-sub">Per product, across all accepted orders.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th className="num">Accepted orders</th>
                <th className="num">Units sold</th>
                <th className="num">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.sales_by_product.map((p) => (
                <tr key={p.product_name}>
                  <td className="name">{p.product_name}</td>
                  <td className="num">{p.orders_accepted}</td>
                  <td className="num">{p.units_sold}</td>
                  <td className="num">{money(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
