// The bill schedule, as the Accounting screens describe it. The dates themselves are set by the
// database (run_billing_automation); keep this wording in step with it.
export const BILL_TYPES_BY_HAND = ["Installation Fee", "Adjustment"] as const;

export const SCHEDULE_TEXT = {
  due: "Last day of the month",
  grace: "Until the 4th of the next month",
  disconnect: "The 5th of the next month",
  terminate: "Automatic, 30 days after disconnection",
};

function ordinal(n: number) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** Billing day for a new install: installed on the 1st-14th -> the 15th, on the 15th or later -> the 25th. */
export function billingDayFor(installDate: string | null | undefined) {
  const day = Number((installDate ?? "").slice(8, 10));
  return day && day < 15 ? 15 : 25;
}

/** "15th of the month". Without a stored billing day, the install-date rule decides. */
export function billingDayText(billingDay: number | null | undefined, installDate?: string | null) {
  return `${ordinal(Math.min(billingDay ?? billingDayFor(installDate), 28))} of the month`;
}

/**
 * The next day a monthly bill will be issued (YYYY-MM-DD). One bill per calendar month, issued on the
 * billing day. The install month is billed too, on the install day when that is later. A month already
 * billed is skipped, and a bill that is due this month but not issued yet goes out tonight.
 */
export function nextBillDate(
  billingDay: number | null | undefined,
  installDate: string,
  latestPeriodStart: string | null,
  today: string,
) {
  const day = Math.min(billingDay ?? billingDayFor(installDate), 28);
  let [year, month] = today.split("-").map(Number);
  for (let i = 0; i < 14; i += 1) {
    const monthKey = `${year}-${String(month).padStart(2, "0")}`;
    const scheduled = `${monthKey}-${String(day).padStart(2, "0")}`;
    const candidate = scheduled < installDate ? installDate : scheduled;
    const billed = !!latestPeriodStart && latestPeriodStart.slice(0, 7) >= monthKey;
    const issueOn = candidate < today && monthKey === today.slice(0, 7) ? today : candidate;
    if (!billed && issueOn >= today && monthKey >= installDate.slice(0, 7)) return issueOn;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return null;
}
