const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 2,
});

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Formats an amount as Philippine pesos. Missing or non-finite values show as ₱0.00. */
export function formatPeso(value: number | string | null | undefined) {
  const amount = Number(value);
  return peso.format(Number.isFinite(amount) ? amount : 0);
}

/**
 * Formats a date ("2026-03-05") or a full timestamp as "Mar 5, 2026".
 *
 * Date-only strings are read as local dates. `new Date("2026-03-05")` would
 * be parsed as UTC midnight, which can display as the previous day in
 * timezones behind UTC. Unparseable input is returned unchanged so bad data
 * stays visible instead of silently turning into "Invalid Date".
 */
export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(DATE_ONLY.test(value) ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
