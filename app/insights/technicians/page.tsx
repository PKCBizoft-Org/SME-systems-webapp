"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../../lib/supabaseClient";
import { StaffHeader } from "../../components/StaffHeader";
import { useInsightsAccess } from "../useInsightsAccess";
import styles from "../../accounting/reports/reports.module.css";

type Tech = {
  user_id: string;
  name: string;
  assigned: number;
  finished: number;
  open: number;
  mins_to_arrive: number | null;
  mins_on_site: number | null;
  missing_proof: number;
  undeclared: number;
  backbone_done: number;
  rating_avg: number | null;
  rating_count: number;
  low_ratings: number;
};

const supabase = createClient();

function duration(mins: number | null) {
  if (mins == null) return "—";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h} h ${mins % 60} min`;
}

// How each technician is doing: jobs, speed, ratings, and the proof they leave behind.
export default function TechniciansPage() {
  const access = useInsightsAccess("dispatch");
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<Tech[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!access.authorized) return;
    let cancelled = false;
    async function load() {
      const { data, error: e } = await supabase.rpc("technician_performance", { p_days: days });
      if (cancelled) return;
      if (e) setError(e.message);
      else {
        setError("");
        setRows((data || []) as Tech[]);
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [access.authorized, days]);

  if (access.checking || !access.authorized) return null;

  const total = rows.reduce(
    (t, r) => ({ finished: t.finished + r.finished, open: t.open + r.open, missing: t.missing + r.missing_proof + r.undeclared }),
    { finished: 0, open: 0, missing: 0 },
  );

  return (
    <main className={styles.page}>
      <StaffHeader current="insights" roles={access.roles} />
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <h1>Technician performance</h1>
            <p>Jobs done, how fast they arrive and finish, customer ratings, and whether they leave photos, signatures and material counts.</p>
          </div>
        </section>

        <div className={styles.controls}>
          <label className={styles.field}>
            Period
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 3 months</option>
              <option value={366}>Last year</option>
            </select>
          </label>
        </div>

        <div className={styles.cards}>
          <div className={styles.card}>
            <small>Jobs finished</small>
            <strong className={styles.good}>{total.finished}</strong>
          </div>
          <div className={styles.card}>
            <small>Jobs still open</small>
            <strong>{total.open}</strong>
          </div>
          <div className={styles.card}>
            <small>Proof or materials missing</small>
            <strong className={total.missing ? styles.bad : styles.good}>{total.missing}</strong>
          </div>
        </div>

        {error && <div className={styles.notice}>{error}</div>}

        <div className={styles.panel}>
          <h2>By technician</h2>
          {loading ? (
            <div className={styles.empty}>Loading…</div>
          ) : rows.length === 0 ? (
            <div className={styles.empty}>No technicians yet.</div>
          ) : (
            <div className={styles.wrap}>
              <table>
                <thead>
                  <tr>
                    <th>Technician</th>
                    <th className={styles.right}>Finished</th>
                    <th className={styles.right}>Open</th>
                    <th className={styles.right}>Time to arrive</th>
                    <th className={styles.right}>Time on site</th>
                    <th className={styles.right}>Rating</th>
                    <th className={styles.right}>Missing proof</th>
                    <th className={styles.right}>Materials not declared</th>
                    <th className={styles.right}>Backbone jobs</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.user_id}>
                      <td>{r.name}</td>
                      <td className={styles.right}>{r.finished}</td>
                      <td className={styles.right}>{r.open}</td>
                      <td className={styles.right}>{duration(r.mins_to_arrive)}</td>
                      <td className={styles.right}>{duration(r.mins_on_site)}</td>
                      <td className={styles.right}>
                        {r.rating_count ? `${r.rating_avg} ★ (${r.rating_count})` : "—"}
                        {r.low_ratings > 0 && <div className={styles.bad}>{r.low_ratings} low</div>}
                      </td>
                      <td className={`${styles.right} ${r.missing_proof ? styles.bad : ""}`}>{r.missing_proof}</td>
                      <td className={`${styles.right} ${r.undeclared ? styles.bad : ""}`}>{r.undeclared}</td>
                      <td className={styles.right}>{r.backbone_done}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className={styles.muted}>
            Time to arrive = from accepting the job to tapping &quot;I have arrived&quot;. Time on site = from arriving to finishing. Missing proof = a
            finished job without a before photo, after photo or signature (see Job reports).
          </p>
        </div>
      </div>
    </main>
  );
}
