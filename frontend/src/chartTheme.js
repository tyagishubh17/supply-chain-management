// Chart colours drawn from the same cream/green palette as index.css, so
// the charts match the rest of the interface instead of introducing a
// second colour scheme.
export const CHART = {
  green: "#2f6b46",
  greenLight: "#7aa98b",
  grid: "#e2dccc",
  axis: "#948d7f",
  text: "#23211c",
};

// Charts label days as "12 Sep"; tables show the full date separately.
export const formatDayLabel = (isoDay) => {
  const d = new Date(`${isoDay}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? isoDay
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};
