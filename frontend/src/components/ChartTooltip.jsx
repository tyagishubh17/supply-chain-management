export default function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      {label && <div className="t-label">{label}</div>}
      {payload.map((entry) => (
        <div className="t-value" key={entry.name}>
          {entry.name}: {formatter ? formatter(entry.value) : entry.value}
        </div>
      ))}
    </div>
  );
}
