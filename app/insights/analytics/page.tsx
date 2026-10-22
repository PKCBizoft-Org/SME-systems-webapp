"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "../../../lib/supabaseClient";
import { formatPeso } from "@/lib/format";
import { StaffHeader } from "../../components/StaffHeader";
import { PkcLoader } from "../../components/PkcLoader";
import { useInsightsAccess } from "../useInsightsAccess";
import styles from "../../accounting/reports/reports.module.css";

type Month = { month: string; billed: number; collected: number; new_customers: number };
type Report = {
  months: Month[];
  totals: {
    active_customers: number;
    flagged_for_disconnection: number;
    mrr: number;
    overdue_amount: number;
    overdue_bills: number;
    collected_30d: number;
  };
  plans: { plan: string; customers: number; mrr: number }[];
};

const supabase = createClient();

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-PH", { month: "short" });
}

export default function AnalyticsPage() {
  const access = useInsightsAccess("analytics");
  const [months, setMonths] = useState(12);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("revenue_report", { p_months: months });
    if (rpcError) setError(rpcError.message);
    else setReport(data as Report);
    setLoading(false);
  }, [months]);

  useEffect(() => {
    // Loading data once access is confirmed is a genuine external sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (access.authorized) void load();
  }, [access.authorized, load]);

  const peak = useMemo(
    () => Math.max(1, ...(report?.months || []).map((m) => Math.max(Number(m.billed), Number(m.collected)))),
    [report],
  );
  const collectedRate = useMemo(() => {
    const billed = (report?.months || []).reduce((sum, m) => sum + Number(m.billed), 0);
    const collected = (report?.months || []).reduce((sum, m) => sum + Number(m.collected), 0);
    return billed > 0 ? Math.round((collected / billed) * 100) : null;
  }, [report]);

  if (access.checking) return <PkcLoader label="Opening insights" steps={["Verifying your role", "Loading analytics"]} />;
  if (!access.authorized) return null;

  const totals = report?.totals;

  return (
    <main className={styles.page}>
      <StaffHeader current="insights" roles={access.roles} />
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <h1>Revenue analytics</h1>
            <p>How much was billed and collected each month, what is overdue, and which plans earn the most.</p>
          </div>
          <button className={styles.btn} onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
        </section>


        <div className={styles.controls}>
          <label className={styles.field}>
            Period
            <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              <option value={3}>Last 3 months</option>
              <option value={6}>Last 6 months</option>
              <option value={12}>Last 12 months</option>
              <option value={24}>Last 24 months</option>
            </select>
          </label>
        </div>

        {error && <div className={styles.notice}>{error}</div>}

        {totals && (
          <div className={styles.cards}>
            <div className={styles.card}>
              <small>Monthly recurring revenue</small>
              <strong>{formatPeso(totals.mrr)}</strong>
            </div>
            <div className={styles.card}>
              <small>Collected, last 30 days</small>
              <strong className={styles.good}>{formatPeso(totals.collected_30d)}</strong>
            </div>
            <div className={styles.card}>
              <small>Overdue</small>
              <strong className={totals.overdue_bills > 0 ? styles.bad : undefined}>{formatPeso(totals.overdue_amount)}</strong>
              <span className={styles.muted}>
                {totals.overdue_bills} bill{totals.overdue_bills === 1 ? "" : "s"}
              </span>
            </div>
            <div className={styles.card}>
              <small>Active customers</small>
              <strong>{totals.active_customers}</strong>
              <span className={styles.muted}>{totals.flagged_for_disconnection} flagged for disconnection</span>
            </div>
            <div className={styles.card}>
              <small>Collected vs billed</small>
              <strong>{collectedRate == null ? "—" : `${collectedRate}%`}</strong>
              <span className={styles.muted}>over this period</span>
            </div>
          </div>
        )}

        <div className={styles.stack}>
          <div className={styles.panel}>
            <h2>Billed and collected per month</h2>
            {!report || report.months.length === 0 ? (
              <div className={styles.empty}>{loading ? "Loading…" : "No data for this period."}</div>
            ) : (
              <>
                <div className={styles.chart} role="img" aria-label="Bar chart of billed and collected amounts per month">
                  {report.months.map((m) => (
                    <div
                      key={m.month}
                      className={styles.chartCol}
                      title={`${m.month}: billed ${formatPeso(m.billed)}, collected ${formatPeso(m.collected)}`}
                    >
                      <div className={styles.chartBars}>
                        <div className={styles.barBilled} style={{ height: `${(Number(m.billed) / peak) * 100}%` }} />
                        <div className={styles.barCollected} style={{ height: `${(Number(m.collected) / peak) * 100}%` }} />
                      </div>
                      <div className={styles.chartLabel}>{monthLabel(m.month)}</div>
                    </div>
                  ))}
                </div>
                <div className={styles.legend}>
                  <span>
                    <i style={{ background: "rgba(143,168,184,0.6)" }} />
                    Billed
                  </span>
                  <span>
                    <i style={{ background: "#4ce8ff" }} />
                    Collected
                  </span>
                </div>
              </>
            )}
          </div>

          <div className={styles.split}>
            <div className={styles.panel}>
              <h2>Months in detail</h2>
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className={styles.right}>Billed</th>
                    <th className={styles.right}>Collected</th>
                    <th className={styles.right}>New</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(report?.months || [])].reverse().map((m) => (
                    <tr key={m.month}>
                      <td>{m.month}</td>
                      <td className={styles.right}>{formatPeso(m.billed)}</td>
                      <td className={styles.right}>{formatPeso(m.collected)}</td>
                      <td className={styles.right}>{m.new_customers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.panel}>
              <h2>Plans</h2>
              {report && report.plans.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th className={styles.right}>Customers</th>
                      <th className={styles.right}>Monthly</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.plans.map((p) => (
                      <tr key={p.plan}>
                        <td>{p.plan}</td>
                        <td className={styles.right}>{p.customers}</td>
                        <td className={styles.right}>{formatPeso(p.mrr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className={styles.empty}>No active subscriptions yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
