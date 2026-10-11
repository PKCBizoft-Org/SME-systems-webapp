"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "../../../lib/supabaseClient";
import { StaffHeader } from "../../components/StaffHeader";
import { PkcLoader } from "../../components/PkcLoader";
import { InsightsNav } from "../InsightsNav";
import { useInsightsAccess } from "../useInsightsAccess";
import styles from "../../accounting/reports/reports.module.css";

type Group = {
  message: string;
  screen: string;
  occurrences: number;
  people: number;
  fatal: number;
  last_at: string;
  versions: string[] | null;
  sample_stack: string | null;
};

type Report = { total: number; people: number; groups: Group[] };

const supabase = createClient();

export default function ErrorsPage() {
  const access = useInsightsAccess("audit");
  const [days, setDays] = useState(7);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("list_app_errors", { p_days: days });
    if (rpcError) setError(rpcError.message);
    else setReport(data as Report);
    setLoading(false);
  }, [days]);

  useEffect(() => {
    // Loading data once access is confirmed is a genuine external sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (access.authorized) void load();
  }, [access.authorized, load]);

  if (access.checking) return <PkcLoader label="Opening error reports" steps={["Verifying your role", "Loading reports"]} />;
  if (!access.authorized) return null;

  const fatal = (report?.groups || []).reduce((sum, g) => sum + Number(g.fatal), 0);

  return (
    <main className={styles.page}>
      <StaffHeader current="insights" roles={access.roles} />
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <h1>App errors</h1>
            <p>
              Crashes and failed actions reported by the customer and technician apps, grouped by message and screen, so problems are
              found before customers complain. Network drops are not counted.
            </p>
          </div>
          <button className={styles.btn} onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
        </section>

        <InsightsNav current="errors" permissions={access.permissions} />

        <div className={styles.controls}>
          <label className={styles.field}>
            Period
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={1}>Last 24 hours</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </label>
        </div>

        {error && (
          <div className={styles.notice} role="alert">
            {error}
          </div>
        )}

        {report && (
          <div className={styles.cards}>
            <div className={styles.card}>
              <small>Reports</small>
              <strong>{report.total}</strong>
            </div>
            <div className={styles.card}>
              <small>People affected</small>
              <strong>{report.people}</strong>
            </div>
            <div className={styles.card}>
              <small>Crashes</small>
              <strong className={fatal > 0 ? styles.bad : styles.good}>{fatal}</strong>
            </div>
            <div className={styles.card}>
              <small>Different problems</small>
              <strong>{report.groups.length}</strong>
            </div>
          </div>
        )}

        <div className={styles.panel}>
          {!report || report.groups.length === 0 ? (
            <div className={styles.empty}>{loading ? "Loading…" : "No errors reported in this period. 🎉"}</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Problem</th>
                  <th>Screen</th>
                  <th className={styles.right}>Times</th>
                  <th className={styles.right}>People</th>
                  <th>Version</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {report.groups.map((g) => (
                  <tr key={`${g.screen}:${g.message}`}>
                    <td className={styles.wrap}>
                      {Number(g.fatal) > 0 ? <span className={styles.flag}>crash</span> : null} {g.message}
                      {g.sample_stack ? (
                        <details style={{ marginTop: 4 }}>
                          <summary className={styles.muted} style={{ cursor: "pointer" }}>
                            Technical details
                          </summary>
                          <pre className={styles.muted} style={{ whiteSpace: "pre-wrap", maxWidth: 420, margin: "6px 0 0" }}>
                            {g.sample_stack}
                          </pre>
                        </details>
                      ) : null}
                    </td>
                    <td>{g.screen || "—"}</td>
                    <td className={styles.right}>{g.occurrences}</td>
                    <td className={styles.right}>{g.people}</td>
                    <td>{(g.versions || []).join(", ") || "—"}</td>
                    <td>{new Date(g.last_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
