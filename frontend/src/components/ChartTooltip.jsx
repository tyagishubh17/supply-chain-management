export function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="chart-tooltip">
      {label && <div className="t-label">{label}</div>}
      {payload.map((entry, i) => (
        <div className="t-value" key={i}>
          {entry.name}: {formatter ? formatter(entry.value) : entry.value}
        </div>
      ))}
    </div>
  );
}
