export function formatContextPercentage(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

export function formatTokenCount(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    // One decimal below 10m so 1.76m reads "1.8m", not "2m".
    return millions < 10 ? `${Number(millions.toFixed(1))}m` : `${Math.round(millions)}m`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  return Math.round(value).toString();
}
