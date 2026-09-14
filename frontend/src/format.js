// Shared display formatting, so money, dates and times look the same on
// every screen instead of being formatted ad hoc in each component.

export const money = (value) =>
  `₹${Number(value ?? 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// The API returns UTC timestamps; these render them in the viewer's
// timezone, which is what "order date" and "order time" should mean.
export const orderDate = (iso) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export const orderTime = (iso) =>
  new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
