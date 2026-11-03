// The 9am email for the owner: what came in yesterday, what needs a human today.
// Built with tables and inline styles so it looks the same in Gmail, Outlook and phones.

export type MorningReport = {
  day: string;
  collected: number;
  collected_count: number;
  by_method: Record<string, number>;
  waiting_count: number;
  waiting_oldest_days: number;
  overdue_clients: number;
  overdue_total: number;
  cash_on_hand: number;
  expenses_total: number;
  expenses_count: number;
  installs_unaccepted: number;
  awaiting_signature: number;
  jobs_done: number;
  missing_proof: { customer: string; technician: string; missing: string }[];
  undeclared_materials: number;
  low_stock: { name: string; unit: string | null; on_hand: number; reorder_level: number }[];
  open_tickets: number;
  ratings_count: number;
  ratings_avg: number | null;
  low_ratings: number;
};

const C = {
  page: "#eef3f6",
  card: "#ffffff",
  ink: "#10212b",
  muted: "#5b7180",
  line: "#e2e9ee",
  brand: "#0b86b5",
  good: "#127a52",
  goodBg: "#e6f6ee",
  bad: "#b4233c",
  badBg: "#fdecef",
  warn: "#9a5b00",
  warnBg: "#fff4e0",
};

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const peso = (n: unknown) => `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function longDate(day: string) {
  const d = new Date(`${day}T12:00:00+08:00`);
  return d.toLocaleDateString("en-PH", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Manila" });
}

function tile(label: string, value: string, note: string, tone: "good" | "bad" | "plain") {
  const color = tone === "good" ? C.good : tone === "bad" ? C.bad : C.ink;
  return `<td width="50%" valign="top" style="padding:6px">
    <div style="background:${C.card};border:1px solid ${C.line};border-radius:12px;padding:14px 16px">
      <div style="font-size:12px;color:${C.muted};text-transform:uppercase;letter-spacing:.6px">${esc(label)}</div>
      <div style="font-size:24px;font-weight:700;color:${color};margin-top:6px">${esc(value)}</div>
      <div style="font-size:12px;color:${C.muted};margin-top:4px">${esc(note)}</div>
    </div>
  </td>`;
}

function section(title: string, rows: [string, string, ("good" | "bad" | "warn" | "plain")?][]) {
  if (!rows.length) return "";
  const body = rows
    .map(([label, value, tone]) => {
      const color = tone === "good" ? C.good : tone === "bad" ? C.bad : tone === "warn" ? C.warn : C.ink;
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid ${C.line};font-size:14px;color:${C.muted}">${esc(label)}</td>
        <td style="padding:10px 0;border-bottom:1px solid ${C.line};font-size:14px;color:${color};font-weight:600;text-align:right">${esc(value)}</td>
      </tr>`;
    })
    .join("");
  return `<tr><td style="padding:8px 6px 0">
    <div style="background:${C.card};border:1px solid ${C.line};border-radius:12px;padding:14px 16px">
      <div style="font-size:15px;font-weight:700;color:${C.ink};margin-bottom:4px">${esc(title)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table>
    </div>
  </td></tr>`;
}

export function buildMorningEmail(r: MorningReport, problems: string[], siteUrl: string) {
  const attention: string[] = [...problems];
  if (r.waiting_count > 0)
    attention.push(`${plural(r.waiting_count, "payment")} waiting to be checked${r.waiting_oldest_days >= 1 ? ` (oldest: ${plural(r.waiting_oldest_days, "day")})` : ""}.`);
  if (r.installs_unaccepted > 0) attention.push(`${plural(r.installs_unaccepted, "installation")} not yet taken by a technician.`);
  if (r.missing_proof.length > 0) attention.push(`${plural(r.missing_proof.length, "finished job")} missing photos or signature (last 7 days).`);
  if (r.undeclared_materials > 0) attention.push(`${plural(r.undeclared_materials, "finished job")} with materials not declared.`);
  if (r.low_stock.length > 0) attention.push(`${plural(r.low_stock.length, "item")} at or below the reorder level.`);
  if (r.low_ratings > 0) attention.push(`${plural(r.low_ratings, "low rating")} (2 stars or less) yesterday.`);
  if (r.cash_on_hand < 0) attention.push("Cash on hand is below zero: a cash entry is missing.");

  const methods = Object.entries(r.by_method || {}).sort((a, b) => b[1] - a[1]);
  const attentionBox = attention.length
    ? `<div style="background:${C.badBg};border:1px solid #f3c2cb;border-radius:12px;padding:14px 16px">
        <div style="font-size:15px;font-weight:700;color:${C.bad};margin-bottom:6px">⚠ Needs attention today (${attention.length})</div>
        <ul style="margin:0;padding-left:18px;color:${C.ink};font-size:14px;line-height:1.6">${attention.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
      </div>`
    : `<div style="background:${C.goodBg};border:1px solid #bfe6d2;border-radius:12px;padding:14px 16px;font-size:15px;font-weight:700;color:${C.good}">✓ All clear. Nothing needs attention today.</div>`;

  const missingRows = r.missing_proof.map((m) => [`${m.customer} · ${m.technician}`, `No ${m.missing}`, "bad"] as [string, string, "bad"]);
  const stockRows = r.low_stock.map(
    (s) => [s.name, `${s.on_hand} ${s.unit || ""} left (reorder at ${s.reorder_level})`.replace(/\s+/g, " "), "warn"] as [string, string, "warn"],
  );

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${C.page}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};padding:20px 8px">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;font-family:Segoe UI,Arial,sans-serif">
  <tr><td style="padding:0 6px">
    <div style="background:${C.brand};border-radius:14px;padding:18px 20px;color:#ffffff">
      <div style="font-size:12px;font-weight:700;letter-spacing:3px;opacity:.85">PKC BIZOFT</div>
      <div style="font-size:22px;font-weight:700;margin-top:6px">Good morning — here is yesterday</div>
      <div style="font-size:14px;opacity:.9;margin-top:4px">${esc(longDate(r.day))}</div>
    </div>
  </td></tr>
  <tr><td style="padding:12px 6px 4px">${attentionBox}</td></tr>
  <tr><td>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        ${tile("Collected yesterday", peso(r.collected), plural(r.collected_count, "payment"), r.collected > 0 ? "good" : "plain")}
        ${tile("Cash on hand", peso(r.cash_on_hand), "Cash that should be with PKC", r.cash_on_hand < 0 ? "bad" : "plain")}
      </tr>
      <tr>
        ${tile("Waiting to be checked", String(r.waiting_count), r.waiting_count ? "Open Verify payments" : "Nothing waiting", r.waiting_count ? "bad" : "good")}
        ${tile("Overdue", peso(r.overdue_total), plural(r.overdue_clients, "customer"), r.overdue_clients ? "bad" : "good")}
      </tr>
    </table>
  </td></tr>
  ${section("Money", [
    ...methods.map(([m, t]) => [`Collected by ${m}`, peso(t), "good"] as [string, string, "good"]),
    ["Spent yesterday", r.expenses_count ? `${peso(r.expenses_total)} (${plural(r.expenses_count, "expense")})` : "Nothing recorded"],
  ])}
  ${section("Field work", [
    ["Jobs finished yesterday", String(r.jobs_done)],
    ["Installations not taken by a technician", String(r.installs_unaccepted), r.installs_unaccepted ? "bad" : "good"],
    ["Waiting for the customer's signature", String(r.awaiting_signature), r.awaiting_signature ? "warn" : "plain"],
    ["Open customer tickets", String(r.open_tickets), r.open_tickets ? "warn" : "plain"],
    ["Ratings yesterday", r.ratings_count ? `${r.ratings_avg ?? "—"} ★ from ${plural(r.ratings_count, "rating")}` : "None"],
  ])}
  ${missingRows.length ? section("Jobs missing proof (last 7 days)", missingRows) : ""}
  ${stockRows.length ? section("Low stock", stockRows) : ""}
  <tr><td align="center" style="padding:18px 6px 6px">
    <a href="${esc(siteUrl)}/accounting" style="display:inline-block;background:${C.brand};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:10px">Open the dashboard</a>
  </td></tr>
  <tr><td align="center" style="padding:10px 6px 0;font-size:12px;color:${C.muted}">Sent every morning by PKC BIZOFT. Please do not reply to this email.</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  const text = [
    `PKC BIZOFT morning summary for ${longDate(r.day)}`,
    "",
    attention.length ? `NEEDS ATTENTION (${attention.length}):\n${attention.map((a) => `- ${a}`).join("\n")}` : "All clear. Nothing needs attention today.",
    "",
    `Collected yesterday: ${peso(r.collected)} (${plural(r.collected_count, "payment")})`,
    `Cash on hand: ${peso(r.cash_on_hand)}`,
    `Waiting to be checked: ${r.waiting_count}`,
    `Overdue: ${plural(r.overdue_clients, "customer")}, ${peso(r.overdue_total)}`,
    `Spent yesterday: ${peso(r.expenses_total)}`,
    `Jobs finished yesterday: ${r.jobs_done}`,
    `Open tickets: ${r.open_tickets}`,
    "",
    `${siteUrl}/accounting`,
  ].join("\n");

  const subject = attention.length
    ? `PKC BIZOFT: ${peso(r.collected)} collected, ${plural(attention.length, "thing")} need attention`
    : `PKC BIZOFT: ${peso(r.collected)} collected yesterday, all clear`;

  return { subject, html, text };
}
