"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabaseClient";
import { formatDate, formatPeso } from "@/lib/format";
import { StaffHeader } from "../../components/StaffHeader";
import { PkcLoader } from "../../components/PkcLoader";
import styles from "../verification/verification.module.css";

type Payment = { id: string; payment_date: string | null; amount_paid: number | null; payment_method: string | null };
type Bill = {
  id: string;
  client_id: string | null;
  bill_id: string | null;
  due_date: string | null;
  amount: number;
  paid: number;
  balance: number;
  status: string | null;
  days_overdue: number;
  closed: boolean;
};

const supabase = createClient();
const DAY = 86_400_000;

// A "YYYY-MM-DD" in the Philippines, n days from now (negative = past).
function phDay(offset = 0) {
  return new Date(Date.now() + 8 * 3_600_000 + offset * DAY).toISOString().slice(0, 10);
}

export default function CollectionsPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) return router.replace("/login");
      const { data: memberships } = await supabase.from("tenant_users").select("role").eq("user_id", data.session.user.id);
      const mine = (memberships || []).map((m) => m.role).filter((r): r is string => Boolean(r));
      if (!mine.includes("admin") && !mine.includes("accounting")) return router.replace("/clients");
      setRoles(mine);
      setChecking(false);

      try {
        const [pay, bill] = await Promise.all([
          supabase.from("payments").select("id, payment_date, amount_paid, payment_method").gte("payment_date", phDay(-62)),
          supabase
            .from("billing_balances")
            .select("id, client_id, bill_id, due_date, amount, paid, balance, status, days_overdue, closed"),
        ]);
        if (pay.error) throw new Error(pay.error.message);
        if (bill.error) throw new Error(bill.error.message);
        const billRows = (bill.data || []) as Bill[];
        if (cancelled) return;
        setPayments((pay.data || []) as Payment[]);
        setBills(billRows);

        const ids = [...new Set(billRows.filter((b) => b.balance > 0 && b.days_overdue > 0).map((b) => b.client_id).filter((v): v is string => !!v))];
        if (ids.length) {
          const clients = await supabase.from("clients").select("id, customer_name").in("id", ids);
          if (!cancelled) setNames(new Map((clients.data || []).map((c) => [c.id, c.customer_name || "Customer"])));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load collections.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const stats = useMemo(() => {
    const today = phDay();
    const month = today.slice(0, 7);
    const [year, monthNo] = month.split("-").map(Number);
    const lastMonth = monthNo === 1 ? `${year - 1}-12` : `${year}-${String(monthNo - 1).padStart(2, "0")}`;
    const sum = (rows: Payment[]) => rows.reduce((total, p) => total + Number(p.amount_paid || 0), 0);

    const todayRows = payments.filter((p) => p.payment_date === today);
    const monthRows = payments.filter((p) => (p.payment_date || "").startsWith(month));
    const lastRows = payments.filter((p) => (p.payment_date || "").startsWith(lastMonth));

    const days = Array.from({ length: 30 }, (_, i) => {
      const date = phDay(i - 29);
      return { date, total: sum(payments.filter((p) => p.payment_date === date)) };
    });

    const methods = new Map<string, number>();
    for (const p of monthRows) methods.set(p.payment_method || "Other", (methods.get(p.payment_method || "Other") || 0) + Number(p.amount_paid || 0));

    const open = bills.filter((b) => !b.closed && b.balance > 0);
    const dueThisMonth = bills.filter((b) => !b.closed && (b.due_date || "").startsWith(month));
    const expected = dueThisMonth.reduce((total, b) => total + b.amount, 0);
    const stillDue = dueThisMonth.reduce((total, b) => total + b.balance, 0);
    const overdue = open.filter((b) => b.days_overdue > 0).sort((a, b) => b.days_overdue - a.days_overdue);

    return {
      today: sum(todayRows),
      todayCount: todayRows.length,
      month: sum(monthRows),
      lastMonth: sum(lastRows),
      days,
      max: Math.max(...days.map((d) => d.total), 1),
      methods: [...methods.entries()].sort((a, b) => b[1] - a[1]),
      expected,
      stillDue,
      collectedOfExpected: expected > 0 ? Math.min(Math.round(((expected - stillDue) / expected) * 100), 100) : 0,
      overdue,
      overdueTotal: overdue.reduce((total, b) => total + b.balance, 0),
    };
  }, [payments, bills]);

  if (checking || loading) return <PkcLoader />;

  const change = stats.lastMonth > 0 ? Math.round(((stats.month - stats.lastMonth) / stats.lastMonth) * 100) : null;

  return (
    <main className={styles.page}>
      <StaffHeader current="accounting" roles={roles} />
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <Link href="/accounting" className={styles.back}>
              ← Accounting
            </Link>
            <h1>Collections</h1>
            <p>Money coming in, what is still expected this month, and who is behind on their bill.</p>
          </div>
        </section>

        {error && (
          <div className={`${styles.notice} ${styles.error}`} role="alert">
            {error}
          </div>
        )}

        <div className={styles.list} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", display: "grid" }}>
          {[
            ["Collected today", formatPeso(stats.today), `${stats.todayCount} payment${stats.todayCount === 1 ? "" : "s"}`],
            ["Collected this month", formatPeso(stats.month), change === null ? "No last month to compare" : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change)}% vs last month (${formatPeso(stats.lastMonth)})`],
            ["Expected this month", formatPeso(stats.expected), `${stats.collectedOfExpected}% collected, ${formatPeso(stats.stillDue)} to go`],
            ["Overdue", formatPeso(stats.overdueTotal), `${stats.overdue.length} bill${stats.overdue.length === 1 ? "" : "s"} late`],
          ].map(([label, value, note]) => (
            <article key={label} className={styles.card}>
              <dl>
                <div>
                  <dt>{label}</dt>
                  <dd style={{ fontSize: 22, fontWeight: 800 }}>{value}</dd>
                  <dd style={{ fontSize: 12, opacity: 0.7 }}>{note}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>

        <article className={styles.card} style={{ marginTop: 14 }}>
          <header>
            <div>
              <strong>Last 30 days</strong>
              <small>Money received per day</small>
            </div>
          </header>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 130, padding: "8px 2px 0" }} aria-label="Daily collections">
            {stats.days.map((d) => (
              <div
                key={d.date}
                title={`${formatDate(d.date)}: ${formatPeso(d.total)}`}
                style={{
                  flex: 1,
                  height: `${Math.max((d.total / stats.max) * 100, d.total > 0 ? 4 : 1)}%`,
                  borderRadius: 3,
                  background: d.total > 0 ? "#1598ff" : "#17303d",
                }}
              />
            ))}
          </div>
        </article>

        <article className={styles.card} style={{ marginTop: 14 }}>
          <header>
            <div>
              <strong>This month by method</strong>
              <small>How customers paid</small>
            </div>
          </header>
          <dl>
            {stats.methods.length === 0 && (
              <div>
                <dd>No payments yet this month.</dd>
              </div>
            )}
            {stats.methods.map(([method, total]) => (
              <div key={method}>
                <dt>{method}</dt>
                <dd>
                  {formatPeso(total)} <em>({stats.month > 0 ? Math.round((total / stats.month) * 100) : 0}%)</em>
                </dd>
              </div>
            ))}
          </dl>
        </article>

        <article className={styles.card} style={{ marginTop: 14 }}>
          <header>
            <div>
              <strong>Most overdue</strong>
              <small>Open a customer to record a payment or send a reminder</small>
            </div>
          </header>
          <dl>
            {stats.overdue.length === 0 && (
              <div>
                <dd>Nobody is overdue. 🎉</dd>
              </div>
            )}
            {stats.overdue.slice(0, 10).map((b) => (
              <div key={b.id}>
                <dt>
                  {b.client_id ? (
                    <Link href={`/accounting/${b.client_id}`} style={{ color: "#6bc0ff" }}>
                      {names.get(b.client_id) || "Customer"}
                    </Link>
                  ) : (
                    "Customer"
                  )}{" "}
                  · {b.bill_id}
                </dt>
                <dd className={styles.bad}>
                  {formatPeso(b.balance)} <em>({b.days_overdue} day{b.days_overdue === 1 ? "" : "s"} late)</em>
                </dd>
              </div>
            ))}
          </dl>
        </article>
      </div>
    </main>
  );
}
