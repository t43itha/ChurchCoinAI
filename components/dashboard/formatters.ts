export const currencyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

export function formatCurrency(amount: number) {
  return currencyFormatter.format(amount);
}

export function formatCompactCurrency(amount: number) {
  const absolute = Math.abs(amount);

  if (absolute >= 1000) {
    return `£${Math.round(amount / 1000)}k`;
  }

  return `£${amount}`;
}
