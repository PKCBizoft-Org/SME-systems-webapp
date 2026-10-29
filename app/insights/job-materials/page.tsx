"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "../../../lib/supabaseClient";
import { StaffHeader } from "../../components/StaffHeader";
import { useInsightsAccess } from "../useInsightsAccess";
import styles from "../../accounting/reports/reports.module.css";

type Row = {
  kind: "client" | "backbone";
  job_id: string;
  job: string;
  job_type: string | null;
  job_status: string | null;
  technician: string;
  item: string;
  unit: string | null;
  unit_cost: number;
  out: number;
  used: number | null;
  returned: number;
  return_done: boolean;
  return_note: string | null;
  diff: number | null;
  at: string;
};

type State = "ok" | "mismatch" | "waiting_return" | "not_declared";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));
const peso = (n: number) => `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const finished = (status: string | null) => /(complete|resolved|done|fixed|cancel)/i.test(status || "");

function stateOf(row: Row): State {
  if (row.used == null) return "not_declared";
  if (!row.return_done) return "waiting_return";
  return row.diff === 0 ? "ok" : "mismatch";
}

// A finished job with nothing declared is a problem; a job still in progress is not yet.
function isProblem(r: Row) {
  const s = stateOf(r);
  return s === "mismatch" || (s === "not_declared" && finished(r.job_status));
}

const STATE_LABEL: Record<State, string> = {
  ok: "✓ Exact",
  mismatch: "⚠ Not exact",
  waiting_return: "Waiting for return",
  not_declared: "Used not declared",
};

const supabase = createClient();

// Out (taken for a job) vs Used (declared when the job was finished) vs
// Returned (leftovers brought back). Returns must be exact: Out − Used.
export default function JobMaterialsPage() {
  const access = useInsightsAccess("inventory");
  const [rows, setRows] = useState<Row[]>([]);
  const [days, setDays] = useState(60);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc("job_materials_report", { p_days: days });
    setLoading(false);
    if (rpcError) return setError(rpcError.message);
    setError("");
    setRows(
      ((data || []) as Row[]).map((r) => ({
        ...r,
        out: Number(r.out),
        used: r.used == null ? null : Number(r.used),
        returned: Number(r.returned),
        diff: r.diff == null ? null : Number(r.diff),
        unit_cost: Number(r.unit_cost),
      })),
    );
  }, [days]);

  useEffect(() => {
    // Loading data once access is confirmed is a genuine external sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (access.authorized) void load();
  }, [access.authorized, load]);

  const jobs = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const list = map.get(r.job_id) ?? [];
      list.push(r);
      map.set(r.job_id, list);
    }
    return [...map.values()].filter((list) => !problemsOnly || list.some(isProblem));
  }, [rows, problemsOnly]);

  const mismatches = rows.filter((r) => stateOf(r) === "mismatch");
  const missingValue = mismatches.reduce((sum, r) => sum + Math.min(0, r.diff || 0) * r.unit_cost, 0);
  const waiting = rows.filter((r) => stateOf(r) === "waiting_return").length;
  const undeclared = rows.filter((r) => stateOf(r) === "not_declared" && finished(r.job_status)).length;

  if (!access.authorized) return null;

  return (
    <main className={styles.page}>
      <StaffHeader current="inventory" roles={access.roles} />
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <h1>Job materials</h1>
            <p>
              For every job: what the technician took out, what they said they used when finishing, and what came back. The return must
              be exactly Out − Used. Anything else is flagged here and sent to admins as a push.
            </p>
          </div>
        </section>

        <div className={styles.cards}>
          <div className={styles.card}>
            <small>Jobs with materials</small>
            <strong>{new Set(rows.map((r) => r.job_id)).size}</strong>
          </div>
          <div className={styles.card}>
            <small>Returns not exact</small>
            <strong className={mismatches.length > 0 ? styles.bad : styles.good}>{mismatches.length}</strong>
          </div>
          <div className={styles.card}>
            <small>Value missing</small>
            <strong className={missingValue < 0 ? styles.bad : styles.good}>{peso(Math.abs(missingValue))}</strong>
          </div>
          <div className={styles.card}>
            <small>Waiting for return / not declared</small>
            <strong className={waiting + undeclared > 0 ? styles.bad : styles.good}>
              {waiting} / {undeclared}
            </strong>
          </div>
        </div>

        {error && <div className={styles.notice} role="alert">{error}</div>}

        <div className={styles.controls}>
          <label className={styles.field}>
            Period
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last year</option>
            </select>
          </label>
          <button className={problemsOnly ? styles.tabOn : styles.tab} onClick={() => setProblemsOnly((v) => !v)}>
            ⚠ Problems only
          </button>
        </div>

        {loading ? (
          <div className={styles.empty}>Loading…</div>
        ) : jobs.length === 0 ? (
          <div className={styles.panel}>
            <div className={styles.empty}>
              {problemsOnly ? "No problems in this period." : "No materials were taken for jobs in this period."}
            </div>
          </div>
        ) : (
          jobs.map((list) => {
            const head = list[0];
            return (
              <div key={head.job_id} className={styles.panel} style={{ marginBottom: 14 }}>
                <h2>
                  <span className={styles.flag} style={head.kind === "backbone" ? { borderColor: "rgba(76,232,255,.5)", background: "rgba(76,232,255,.1)", color: "#bdf5ff" } : undefined}>
                    {head.kind === "backbone" ? "Backbone" : "Client"}
                  </span>{" "}
                  {head.job}
                  <span className={styles.muted} style={{ fontWeight: 400, fontSize: 13 }}>
                    {" "}
                    · {head.job_type === "installation" || head.job_type === "new_installation" ? "New install" : "Repair"} · {head.technician} ·{" "}
                    {head.job_status || "—"} · {new Date(head.at).toLocaleDateString()}
                  </span>
                </h2>
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th className={styles.right}>Out</th>
                        <th className={styles.right}>Used</th>
                        <th className={styles.right}>Should return</th>
                        <th className={styles.right}>Returned</th>
                        <th>Check</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((r) => {
                        const s = stateOf(r);
                        return (
                          <tr key={r.item}>
                            <td>{r.item}</td>
                            <td className={styles.right}>{fmt(r.out)} {r.unit || ""}</td>
                            <td className={styles.right}>{r.used == null ? "—" : fmt(r.used)}</td>
                            <td className={styles.right}>{r.used == null ? "—" : fmt(r.out - r.used)}</td>
                            <td className={styles.right}>{fmt(r.returned)}</td>
                            <td>
                              {s === "mismatch" || (s === "not_declared" && finished(r.job_status)) ? (
                                <span className={styles.flag}>
                                  {STATE_LABEL[s]}
                                  {s === "mismatch" && r.diff != null ? ` (${r.diff > 0 ? "+" : ""}${fmt(r.diff)})` : ""}
                                </span>
                              ) : (
                                <span className={s === "ok" ? styles.good : styles.muted}>{STATE_LABEL[s]}</span>
                              )}
                              {r.return_note && <div className={styles.muted}>Reason: {r.return_note}</div>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}

        <p className={styles.muted} style={{ marginTop: 12 }}>
          Only materials taken for a specific job appear here. Older checkouts linked only to a customer are not part of this check.
        </p>
      </div>
    </main>
  );
}
