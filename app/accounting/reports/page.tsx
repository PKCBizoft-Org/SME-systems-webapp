"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabaseClient";
import { formatDate, formatPeso } from "@/lib/format";
import { StaffHeader } from "../../components/StaffHeader";
import { PkcLoader } from "../../components/PkcLoader";
import styles from "./reports.module.css";

type Tab = "daily" | "overdue" | "statement" | "export";

type ClientRow = {
  id: string;
  customer_name: string | null;
  account_id: string | null;
  plan_name: string | null;
  mobile_number: string | null;
  disconnection_flag: boolean | null;
};

type PaymentRow = {
  id: string;
  client_id: string | null;
  receipt_number: string | null;
  payment_id: string | null;
  amount_paid: number | null;
  payment_date: string | null;
  payment_method: string | null;
};

type SubmissionRow = {
  id: string;
  status: string | null;
  payment_id: string | null;
  reference_number: string | null;
  reviewed_at: string | null;
};

type BillRow = {
  id: string;
  client_id: string | null;
  bill_id: string | null;
  status: string | null;
  bill_date: string | null;
  due_date: string | null;
  amount_due: number | null;
  final_amount: number | null;
};

const supabase = createClient();

function todayLocal() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const body = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function billAmount(bill: BillRow) {
  return Number(bill.final_amount ?? bill.amount_due ?? 0);
}

function isOpen(status: string | null) {
  const value = String(status || "").toLowerCase();
  return !(value.includes("paid") && !value.includes("partial")) && !value.includes("cancel") && !value.includes("void");
}

export default function ReportsPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [staffRoles, setStaffRoles] = useState<string[]>([]);

  const [tab, setTab] = useState<Tab>("daily");
  const [nowMs] = useState(() => Date.now());
  const [clients, setClients] = useState<Map<string, ClientRow>>(new Map());
  const [error, setError] = useState("");

  const [date, setDate] = useState(todayLocal());
  const [month, setMonth] = useState(todayLocal().slice(0, 7));
  const [statementClient, setStatementClient] = useState("");

  const [dailyLoading, setDailyLoading] = useState(false);
  const [collected, setCollected] = useState<(PaymentRow & { reference: string | null })[]>([]);
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);

  const [overdue, setOverdue] = useState<BillRow[]>([]);
  const [overdueLoading, setOverdueLoading] = useState(false);

  const [stmtBills, setStmtBills] = useState<BillRow[]>([]);
  const [stmtPayments, setStmtPayments] = useState<PaymentRow[]>([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (cancelled) return;
      if (sessionError || !data.session) {
        router.replace("/login");
        return;
      }
      const { data: memberships } = await supabase.from("tenant_users").select("role").eq("user_id", data.session.user.id);
      if (cancelled) return;
      const roles = (memberships || []).map((m) => m.role).filter((r): r is string => Boolean(r));
      if (!roles.includes("admin") && !roles.includes("accounting")) {
        router.replace("/clients");
        return;
      }
      const { data: clientData } = await supabase
        .from("clients")
        .select("id, customer_name, account_id, plan_name, mobile_number, disconnection_flag")
        .order("customer_name");
      if (cancelled) return;
      setClients(new Map(((clientData || []) as ClientRow[]).map((c) => [c.id, c])));
      setStaffRoles(roles);
      setAuthorized(true);
      setChecking(false);
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Daily collection report.
  useEffect(() => {
    if (!authorized || tab !== "daily") return;
    let cancelled = false;
    async function load() {
      setDailyLoading(true);
      setError("");
      const start = new Date(`${date}T00:00:00`);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      const { data: subs, error: subError } = await supabase
        .from("payment_submissions")
        .select("id, status, payment_id, reference_number, reviewed_at")
        .gte("reviewed_at", start.toISOString())
        .lt("reviewed_at", end.toISOString());
      if (cancelled) return;
      if (subError) {
        setError(subError.message);
        setDailyLoading(false);
        return;
      }
      const rows = (subs || []) as SubmissionRow[];
      const verified = rows.filter((r) => String(r.status).toLowerCase() === "verified");
      setVerifiedCount(verified.length);
      setRejectedCount(rows.filter((r) => String(r.status).toLowerCase() === "rejected").length);

      const ids = verified.map((r) => r.payment_id).filter((v): v is string => Boolean(v));
      const [viaSubmission, manual] = await Promise.all([
        ids.length
          ? supabase.from("payments").select("*").in("id", ids)
          : Promise.resolve({ data: [] as PaymentRow[], error: null }),
        supabase.from("payments").select("*").eq("payment_date", date),
      ]);
      if (cancelled) return;
      if (viaSubmission.error || manual.error) {
        setError(viaSubmission.error?.message || manual.error?.message || "Unable to load payments.");
        setDailyLoading(false);
        return;
      }

      const refByPayment = new Map(verified.map((r) => [r.payment_id, r.reference_number]));
      const all = new Map<string, PaymentRow & { reference: string | null }>();
      for (const p of (viaSubmission.data || []) as PaymentRow[]) all.set(p.id, { ...p, reference: refByPayment.get(p.id) ?? null });
      // Payments entered some other way (not through a customer submission) on that date.
      const submissionPaymentIds = new Set(ids);
      for (const p of (manual.data || []) as PaymentRow[]) {
        if (!all.has(p.id) && !submissionPaymentIds.has(p.id)) all.set(p.id, { ...p, reference: null });
      }
      setCollected([...all.values()]);
      setDailyLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [authorized, tab, date]);

  // Overdue list.
  useEffect(() => {
    if (!authorized || tab !== "overdue") return;
    let cancelled = false;
    async function load() {
      setOverdueLoading(true);
      const { data, error: billError } = await supabase
        .from("billing")
        .select("id, client_id, bill_id, status, bill_date, due_date, amount_due, final_amount")
        .lt("due_date", todayLocal())
        .order("due_date", { ascending: true });
      if (cancelled) return;
      if (billError) setError(billError.message);
      setOverdue(((data || []) as BillRow[]).filter((b) => isOpen(b.status)));
      setOverdueLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [authorized, tab]);

  // Customer statement.
  useEffect(() => {
    if (!authorized || tab !== "statement" || !statementClient) return;
    let cancelled = false;
    async function load() {
      const [bills, pays] = await Promise.all([
        supabase.from("billing").select("id, client_id, bill_id, status, bill_date, due_date, amount_due, final_amount").eq("client_id", statementClient).order("bill_date"),
        supabase.from("payments").select("*").eq("client_id", statementClient).order("payment_date"),
      ]);
      if (cancelled) return;
      setStmtBills((bills.data || []) as BillRow[]);
      setStmtPayments((pays.data || []) as PaymentRow[]);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [authorized, tab, statementClient]);

  const dailyTotals = useMemo(() => {
    const byMethod = new Map<string, number>();
    let total = 0;
    for (const p of collected) {
      const amount = Number(p.amount_paid || 0);
      total += amount;
      const method = p.payment_method || "Other";
      byMethod.set(method, (byMethod.get(method) || 0) + amount);
    }
    return { total, byMethod: [...byMethod.entries()] };
  }, [collected]);

  const stmtTotals = useMemo(() => {
    const billed = stmtBills.filter((b) => !String(b.status).toLowerCase().includes("cancel")).reduce((sum, b) => sum + billAmount(b), 0);
    const paid = stmtPayments.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0);
    return { billed, paid, balance: Math.max(billed - paid, 0) };
  }, [stmtBills, stmtPayments]);

  const clientList = useMemo(() => [...clients.values()], [clients]);

  async function exportMonth(kind: "payments" | "bills") {
    setExporting(true);
    setError("");
    try {
      const start = `${month}-01`;
      const next = new Date(`${start}T00:00:00`);
      next.setMonth(next.getMonth() + 1);
      const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;

      if (kind === "payments") {
        const { data, error: e } = await supabase.from("payments").select("*").gte("payment_date", start).lt("payment_date", end).order("payment_date");
        if (e) throw new Error(e.message);
        downloadCsv(`payments-${month}.csv`, [
          ["Date", "Receipt no.", "Payment id", "Customer", "Account id", "Method", "Amount"],
          ...((data || []) as PaymentRow[]).map((p) => {
            const c = p.client_id ? clients.get(p.client_id) : undefined;
            return [p.payment_date, p.receipt_number, p.payment_id, c?.customer_name, c?.account_id, p.payment_method, p.amount_paid];
          }),
        ]);
      } else {
        const { data, error: e } = await supabase.from("billing").select("id, client_id, bill_id, status, bill_date, due_date, amount_due, final_amount").gte("bill_date", start).lt("bill_date", end).order("bill_date");
        if (e) throw new Error(e.message);
        downloadCsv(`bills-${month}.csv`, [
          ["Bill date", "Due date", "Bill no.", "Customer", "Account id", "Status", "Amount"],
          ...((data || []) as BillRow[]).map((b) => {
            const c = b.client_id ? clients.get(b.client_id) : undefined;
            return [b.bill_date, b.due_date, b.bill_id, c?.customer_name, c?.account_id, b.status, billAmount(b)];
          }),
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  if (checking) return <PkcLoader />;
  if (!authorized) return null;

  const selected = statementClient ? clients.get(statementClient) : undefined;

  return (
    <main className={styles.page}>
      <style>{`@media print { header { display: none !important; } .noPrint { display: none !important; } }`}</style>
      <StaffHeader current="accounting" roles={staffRoles} />

      <div className={styles.shell}>
        <section className={`${styles.hero} noPrint`}>
          <div>
            <Link href="/accounting" className={styles.back}>
              ← Accounting
            </Link>
            <h1>Reports</h1>
            <p>Daily collections, overdue accounts, customer statements and monthly exports. Use Print and choose &quot;Save as PDF&quot; to keep a copy.</p>
          </div>
        </section>

        <div className={`${styles.tabs} noPrint`} role="tablist">
          {(
            [
              ["daily", "Daily collection"],
              ["overdue", "Overdue / unpaid"],
              ["statement", "Customer statement"],
              ["export", "Monthly export"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? styles.tabOn : styles.tab} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>

        {error && <div className={styles.notice}>{error}</div>}

        {tab === "daily" && (
          <>
            <div className={`${styles.controls} noPrint`}>
              <label className={styles.field}>
                Date
                <input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value || todayLocal())} />
              </label>
              <button className={styles.btnPrimary} onClick={() => window.print()}>
                Print / Save as PDF
              </button>
            </div>

            <h2 className={styles.printTitle}>PKC BIZOFT — Daily collection report, {formatDate(date)}</h2>

            <div className={styles.cards}>
              <div className={styles.card}>
                <small>Total collected</small>
                <strong className={styles.good}>{formatPeso(dailyTotals.total)}</strong>
              </div>
              {dailyTotals.byMethod.map(([method, amount]) => (
                <div className={styles.card} key={method}>
                  <small>{method}</small>
                  <strong>{formatPeso(amount)}</strong>
                </div>
              ))}
              <div className={styles.card}>
                <small>Verified / rejected</small>
                <strong>
                  {verifiedCount} / <span className={styles.bad}>{rejectedCount}</span>
                </strong>
              </div>
            </div>

            <div className={styles.panel}>
              {dailyLoading ? (
                <div className={styles.empty}>Loading…</div>
              ) : collected.length === 0 ? (
                <div className={styles.empty}>No payments were collected on this date.</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Receipt no.</th>
                      <th>Customer</th>
                      <th>Method</th>
                      <th>Reference</th>
                      <th className={styles.right}>Amount</th>
                      <th className="noPrint" />
                    </tr>
                  </thead>
                  <tbody>
                    {collected.map((p) => (
                      <tr key={p.id}>
                        <td>{p.receipt_number || p.payment_id || "—"}</td>
                        <td>{(p.client_id && clients.get(p.client_id)?.customer_name) || "—"}</td>
                        <td>{p.payment_method || "—"}</td>
                        <td>{p.reference || "—"}</td>
                        <td className={styles.right}>{formatPeso(p.amount_paid)}</td>
                        <td className="noPrint">
                          <Link className={styles.link} href={`/accounting/receipt/${p.id}`}>
                            Receipt
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {tab === "overdue" && (
          <div className={styles.panel}>
            {overdueLoading ? (
              <div className={styles.empty}>Loading…</div>
            ) : overdue.length === 0 ? (
              <div className={styles.empty}>No overdue bills. 🎉</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Bill</th>
                    <th>Due</th>
                    <th>Days late</th>
                    <th className={styles.right}>Amount</th>
                    <th>Notice</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {[...overdue]
                    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
                    .map((bill) => {
                      const client = bill.client_id ? clients.get(bill.client_id) : undefined;
                      const late = Math.max(
                        Math.floor((nowMs - new Date(`${bill.due_date}T00:00:00`).getTime()) / 86_400_000),
                        0,
                      );
                      return (
                        <tr key={bill.id}>
                          <td>
                            {client?.customer_name || "—"}
                            <br />
                            <small>{client?.mobile_number || ""}</small>
                          </td>
                          <td>{bill.bill_id || "—"}</td>
                          <td>{formatDate(bill.due_date)}</td>
                          <td className={late >= 7 ? styles.bad : undefined}>{late}</td>
                          <td className={styles.right}>{formatPeso(billAmount(bill))}</td>
                          <td>{client?.disconnection_flag ? <span className={styles.flag}>For disconnection</span> : "—"}</td>
                          <td>
                            {bill.client_id && (
                              <Link className={styles.link} href={`/accounting/${bill.client_id}`}>
                                Open account
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "statement" && (
          <>
            <div className={`${styles.controls} noPrint`}>
              <label className={styles.field}>
                Customer
                <select value={statementClient} onChange={(e) => setStatementClient(e.target.value)}>
                  <option value="">Choose a customer…</option>
                  {clientList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.customer_name || "Unnamed"} {c.account_id ? `(${c.account_id})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button className={styles.btnPrimary} disabled={!statementClient} onClick={() => window.print()}>
                Print / Save as PDF
              </button>
            </div>

            {!selected ? (
              <div className={styles.panel}>
                <div className={styles.empty}>Choose a customer to see their statement.</div>
              </div>
            ) : (
              <>
                <h2 className={styles.printTitle}>
                  PKC BIZOFT — Statement of account: {selected.customer_name} {selected.account_id ? `(${selected.account_id})` : ""}
                </h2>
                <div className={styles.cards}>
                  <div className={styles.card}>
                    <small>Billed</small>
                    <strong>{formatPeso(stmtTotals.billed)}</strong>
                  </div>
                  <div className={styles.card}>
                    <small>Paid</small>
                    <strong className={styles.good}>{formatPeso(stmtTotals.paid)}</strong>
                  </div>
                  <div className={styles.card}>
                    <small>Balance</small>
                    <strong className={stmtTotals.balance > 0 ? styles.bad : styles.good}>{formatPeso(stmtTotals.balance)}</strong>
                  </div>
                </div>

                <div className={styles.panel}>
                  <h2>Bills</h2>
                  {stmtBills.length === 0 ? (
                    <div className={styles.empty}>No bills.</div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Bill</th>
                          <th>Date</th>
                          <th>Due</th>
                          <th>Status</th>
                          <th className={styles.right}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stmtBills.map((b) => (
                          <tr key={b.id}>
                            <td>{b.bill_id || "—"}</td>
                            <td>{formatDate(b.bill_date)}</td>
                            <td>{formatDate(b.due_date)}</td>
                            <td>{b.status || "—"}</td>
                            <td className={styles.right}>{formatPeso(billAmount(b))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className={styles.panel} style={{ marginTop: 14 }}>
                  <h2>Payments</h2>
                  {stmtPayments.length === 0 ? (
                    <div className={styles.empty}>No payments.</div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Receipt no.</th>
                          <th>Method</th>
                          <th className={styles.right}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stmtPayments.map((p) => (
                          <tr key={p.id}>
                            <td>{formatDate(p.payment_date)}</td>
                            <td>{p.receipt_number || p.payment_id || "—"}</td>
                            <td>{p.payment_method || "—"}</td>
                            <td className={styles.right}>{formatPeso(p.amount_paid)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {tab === "export" && (
          <div className={styles.panel} style={{ padding: 18 }}>
            <div className={styles.controls}>
              <label className={styles.field}>
                Month
                <input type="month" value={month} onChange={(e) => setMonth(e.target.value || todayLocal().slice(0, 7))} />
              </label>
              <button className={styles.btnPrimary} disabled={exporting} onClick={() => void exportMonth("payments")}>
                Download payments (CSV)
              </button>
              <button className={styles.btn} disabled={exporting} onClick={() => void exportMonth("bills")}>
                Download bills (CSV)
              </button>
            </div>
            <p style={{ color: "#8fa8b8", fontSize: 13, margin: 0 }}>
              Opens in Excel or Google Sheets. Payments are grouped by payment date and bills by bill date.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
