"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabaseClient";
import { formatDate, formatPeso } from "@/lib/format";
import { StaffHeader } from "../../components/StaffHeader";
import { PkcLoader } from "../../components/PkcLoader";
import styles from "../reports/reports.module.css";

type Tab = "cash" | "expenses" | "profit";

type CashEntry = { type: string; on: string; at: string; change: number; text: string };
type Cash = { cash_in: number; cash_spent: number; movements: number; balance: number; entries: CashEntry[] };

type Expense = {
  id: string;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  paid_from: string;
  voided_at: string | null;
  void_reason: string | null;
};

type Profit = {
  collected: number;
  by_method: Record<string, number>;
  expenses: number;
  by_category: Record<string, number>;
  stock_bought: number;
  materials_used: number;
  profit: number;
};

const CATEGORIES = [
  "Fuel",
  "Salaries",
  "Rent",
  "Electricity & water",
  "Upstream internet",
  "Tools & equipment",
  "Vehicle",
  "Office",
  "Other",
];

const ENTRY_LABEL: Record<string, string> = {
  payment: "Cash payment",
  expense: "Spent",
  deposit: "Deposited",
  withdrawal: "Withdrawn",
  correction: "Correction",
};

const supabase = createClient();

// "YYYY-MM-DD" in the Philippines.
function phToday() {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
}

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export default function MoneyPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [tab, setTab] = useState<Tab>("cash");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [cash, setCash] = useState<Cash | null>(null);
  const [moveKind, setMoveKind] = useState<"deposit" | "withdrawal" | "correction">("deposit");
  const [moveAmount, setMoveAmount] = useState("");
  const [moveDate, setMoveDate] = useState(phToday());
  const [moveNote, setMoveNote] = useState("");

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expDate, setExpDate] = useState(phToday());
  const [expCategory, setExpCategory] = useState(CATEGORIES[0]);
  const [expDescription, setExpDescription] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expFrom, setExpFrom] = useState<"Cash" | "GCash" | "Bank">("Cash");

  const [month, setMonth] = useState(phToday().slice(0, 7));
  const [profit, setProfit] = useState<Profit | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) return router.replace("/login");
      const { data: memberships } = await supabase
        .from("tenant_users")
        .select("role, tenant_id")
        .eq("user_id", data.session.user.id);
      if (cancelled) return;
      const rows = (memberships || []) as { role: string | null; tenant_id: string }[];
      const staff = rows.find((r) => r.role === "admin" || r.role === "accounting");
      if (!staff) return router.replace("/clients");
      setRoles(rows.map((r) => r.role).filter((r): r is string => Boolean(r)));
      setTenantId(staff.tenant_id);
      setChecking(false);
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const loadCash = useCallback(async () => {
    if (!tenantId) return;
    const { data, error: e } = await supabase.rpc("cash_on_hand", { p_tenant: tenantId, p_limit: 100 });
    if (e) return setError(e.message);
    setCash(data as Cash);
  }, [tenantId]);

  const loadExpenses = useCallback(async () => {
    if (!tenantId) return;
    const { data, error: e } = await supabase
      .from("expenses")
      .select("id, expense_date, category, description, amount, paid_from, voided_at, void_reason")
      .eq("tenant_id", tenantId)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (e) return setError(e.message);
    setExpenses((data || []) as Expense[]);
  }, [tenantId]);

  const loadProfit = useCallback(async () => {
    if (!tenantId) return;
    const { from, to } = monthRange(month);
    const { data, error: e } = await supabase.rpc("profit_summary", { p_tenant: tenantId, p_from: from, p_to: to });
    if (e) return setError(e.message);
    setProfit(data as Profit);
  }, [tenantId, month]);

  useEffect(() => {
    async function run() {
      if (tab === "cash") await loadCash();
      if (tab === "expenses") await loadExpenses();
      if (tab === "profit") await loadProfit();
    }
    void run();
  }, [tab, loadCash, loadExpenses, loadProfit]);

  async function saveMovement() {
    const amount = Number(moveAmount);
    if (!Number.isFinite(amount) || amount === 0) return setError("Enter an amount.");
    if (moveKind === "correction" && !moveNote.trim()) return setError("Say why the cash count is being corrected.");
    setBusy(true);
    setError("");
    const { error: e } = await supabase.rpc("record_cash_movement", {
      p_tenant: tenantId,
      p_kind: moveKind,
      p_amount: amount,
      p_date: moveDate,
      p_note: moveNote.trim() || null,
    });
    setBusy(false);
    if (e) return setError(e.message);
    setMoveAmount("");
    setMoveNote("");
    void loadCash();
  }

  async function saveExpense() {
    const amount = Number(expAmount);
    if (!Number.isFinite(amount) || amount <= 0) return setError("Enter the amount spent.");
    if (!expDescription.trim()) return setError("Write what it was for.");
    setBusy(true);
    setError("");
    const { error: e } = await supabase.rpc("add_expense", {
      p_tenant: tenantId,
      p_date: expDate,
      p_category: expCategory,
      p_description: expDescription.trim(),
      p_amount: amount,
      p_paid_from: expFrom,
    });
    setBusy(false);
    if (e) return setError(e.message);
    setExpAmount("");
    setExpDescription("");
    void loadExpenses();
  }

  async function removeExpense(expense: Expense) {
    const reason = window.prompt(`Remove "${expense.description}" (${formatPeso(expense.amount)})? Say why:`);
    if (!reason || !reason.trim()) return;
    setBusy(true);
    const { error: e } = await supabase.rpc("void_expense", { p_id: expense.id, p_reason: reason.trim() });
    setBusy(false);
    if (e) return setError(e.message);
    void loadExpenses();
  }

  if (checking) return <PkcLoader />;

  return (
    <main className={styles.page}>
      <StaffHeader current="accounting" roles={roles} />
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <Link href="/accounting" className={styles.back}>
              ← Accounting
            </Link>
            <h1>Money</h1>
            <p>Cash on hand, what the business spends, and the profit for each month.</p>
          </div>
        </section>

        <div className={styles.tabs} role="tablist">
          {(
            [
              ["cash", "Cash on hand"],
              ["expenses", "Expenses"],
              ["profit", "Profit"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? styles.tabOn : styles.tab} onClick={() => { setError(""); setTab(key); }}>
              {label}
            </button>
          ))}
        </div>

        {error && <div className={styles.notice}>{error}</div>}

        {tab === "cash" && (
          <>
            <div className={styles.cards}>
              <div className={styles.card}>
                <small>Cash that should be on hand</small>
                <strong className={cash && cash.balance < 0 ? styles.bad : styles.good}>{cash ? formatPeso(cash.balance) : "—"}</strong>
              </div>
              <div className={styles.card}>
                <small>Cash payments received</small>
                <strong>{cash ? formatPeso(cash.cash_in) : "—"}</strong>
              </div>
              <div className={styles.card}>
                <small>Spent from cash</small>
                <strong>{cash ? formatPeso(cash.cash_spent) : "—"}</strong>
              </div>
              <div className={styles.card}>
                <small>Deposits, withdrawals, corrections</small>
                <strong>{cash ? formatPeso(cash.movements) : "—"}</strong>
              </div>
            </div>
            {cash && cash.balance < 0 && (
              <div className={styles.notice}>
                The balance is below zero, so some cash is missing from the records: a cash payment not entered, or a deposit or expense entered twice.
              </div>
            )}

            <div className={styles.panel}>
              <h2>Record a deposit, withdrawal or correction</h2>
              <p className={styles.muted}>
                Cash payments are added by themselves once Accounting verifies them. Cash spent goes in the Expenses tab with &quot;Paid from: Cash&quot;. If the
                real count differs from the balance above, enter a correction (for example -200 or 150) and say why.
              </p>
              <div className={styles.controls}>
                <label className={styles.field}>
                  Type
                  <select value={moveKind} onChange={(e) => setMoveKind(e.target.value as typeof moveKind)}>
                    <option value="deposit">Deposited to bank / GCash</option>
                    <option value="withdrawal">Withdrawn to cash</option>
                    <option value="correction">Correction after counting</option>
                  </select>
                </label>
                <label className={styles.field}>
                  Amount
                  <input type="number" step="0.01" value={moveAmount} onChange={(e) => setMoveAmount(e.target.value)} placeholder="0.00" />
                </label>
                <label className={styles.field}>
                  Date
                  <input type="date" value={moveDate} max={phToday()} onChange={(e) => setMoveDate(e.target.value || phToday())} />
                </label>
                <label className={styles.field}>
                  Note
                  <input value={moveNote} onChange={(e) => setMoveNote(e.target.value)} placeholder={moveKind === "correction" ? "Why (required)" : "e.g. BPI deposit slip 1234"} />
                </label>
                <button className={styles.btnPrimary} disabled={busy} onClick={() => void saveMovement()}>
                  Save
                </button>
              </div>
            </div>

            <div className={styles.panel}>
              <h2>Latest cash entries</h2>
              {!cash || cash.entries.length === 0 ? (
                <div className={styles.empty}>No cash entries yet.</div>
              ) : (
                <div className={styles.wrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>What</th>
                        <th>Details</th>
                        <th className={styles.right}>Cash</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cash.entries.map((entry, i) => (
                        <tr key={`${entry.at}-${i}`}>
                          <td>{formatDate(entry.on)}</td>
                          <td>{ENTRY_LABEL[entry.type] || entry.type}</td>
                          <td>{entry.text}</td>
                          <td className={`${styles.right} ${Number(entry.change) < 0 ? styles.bad : styles.good}`}>
                            {Number(entry.change) > 0 ? "+" : ""}
                            {formatPeso(entry.change)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {tab === "expenses" && (
          <>
            <div className={styles.panel}>
              <h2>Add an expense</h2>
              <div className={styles.controls}>
                <label className={styles.field}>
                  Date
                  <input type="date" value={expDate} max={phToday()} onChange={(e) => setExpDate(e.target.value || phToday())} />
                </label>
                <label className={styles.field}>
                  Category
                  <select value={expCategory} onChange={(e) => setExpCategory(e.target.value)}>
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  What for
                  <input value={expDescription} maxLength={300} onChange={(e) => setExpDescription(e.target.value)} placeholder="e.g. Gas for service van" />
                </label>
                <label className={styles.field}>
                  Amount
                  <input type="number" step="0.01" min="0" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} placeholder="0.00" />
                </label>
                <label className={styles.field}>
                  Paid from
                  <select value={expFrom} onChange={(e) => setExpFrom(e.target.value as typeof expFrom)}>
                    <option>Cash</option>
                    <option>GCash</option>
                    <option>Bank</option>
                  </select>
                </label>
                <button className={styles.btnPrimary} disabled={busy} onClick={() => void saveExpense()}>
                  Add
                </button>
              </div>
              <p className={styles.muted}>Stock bought is counted from Inventory (stock received), so don&apos;t enter it here too.</p>
            </div>

            <div className={styles.panel}>
              <h2>Expenses</h2>
              {expenses.length === 0 ? (
                <div className={styles.empty}>No expenses recorded yet.</div>
              ) : (
                <div className={styles.wrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Category</th>
                        <th>What for</th>
                        <th>Paid from</th>
                        <th className={styles.right}>Amount</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map((x) => (
                        <tr key={x.id} style={x.voided_at ? { opacity: 0.45, textDecoration: "line-through" } : undefined}>
                          <td>{formatDate(x.expense_date)}</td>
                          <td>{x.category}</td>
                          <td>
                            {x.description}
                            {x.voided_at && <div className={styles.muted} style={{ textDecoration: "none" }}>Removed: {x.void_reason}</div>}
                          </td>
                          <td>{x.paid_from}</td>
                          <td className={styles.right}>{formatPeso(x.amount)}</td>
                          <td className={styles.right}>
                            {!x.voided_at && (
                              <button className={styles.btn} disabled={busy} onClick={() => void removeExpense(x)}>
                                Remove
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {tab === "profit" && (
          <>
            <div className={styles.controls}>
              <label className={styles.field}>
                Month
                <input type="month" value={month} max={phToday().slice(0, 7)} onChange={(e) => setMonth(e.target.value || phToday().slice(0, 7))} />
              </label>
            </div>
            <div className={styles.cards}>
              <div className={styles.card}>
                <small>Collected</small>
                <strong className={styles.good}>{profit ? formatPeso(profit.collected) : "—"}</strong>
              </div>
              <div className={styles.card}>
                <small>Expenses</small>
                <strong>{profit ? formatPeso(profit.expenses) : "—"}</strong>
              </div>
              <div className={styles.card}>
                <small>Stock bought</small>
                <strong>{profit ? formatPeso(profit.stock_bought) : "—"}</strong>
              </div>
              <div className={styles.card}>
                <small>Profit</small>
                <strong className={profit && profit.profit < 0 ? styles.bad : styles.good}>{profit ? formatPeso(profit.profit) : "—"}</strong>
              </div>
            </div>
            {profit && (
              <div className={styles.panel}>
                <h2>Breakdown</h2>
                <table>
                  <tbody>
                    {Object.entries(profit.by_method).map(([method, total]) => (
                      <tr key={`m-${method}`}>
                        <td>Collected by {method}</td>
                        <td className={`${styles.right} ${styles.good}`}>{formatPeso(total)}</td>
                      </tr>
                    ))}
                    {Object.entries(profit.by_category).map(([category, total]) => (
                      <tr key={`c-${category}`}>
                        <td>Expense: {category}</td>
                        <td className={`${styles.right} ${styles.bad}`}>-{formatPeso(total)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td>Stock bought (received into Inventory)</td>
                      <td className={`${styles.right} ${styles.bad}`}>-{formatPeso(profit.stock_bought)}</td>
                    </tr>
                    <tr>
                      <td>
                        <strong>Profit</strong>
                      </td>
                      <td className={styles.right}>
                        <strong>{formatPeso(profit.profit)}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p className={styles.muted}>
                  For information: {formatPeso(profit.materials_used)} of materials were used on jobs this month. They are not subtracted again because they were
                  already counted when the stock was bought. Stock bought uses each item&apos;s cost in Inventory, so keep item costs filled in.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
