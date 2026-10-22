"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "../../../lib/supabaseClient";
import { StaffHeader } from "../../components/StaffHeader";
import { PkcLoader } from "../../components/PkcLoader";
import { useInsightsAccess } from "../useInsightsAccess";
import styles from "../../accounting/reports/reports.module.css";

type Outage = {
  id: string;
  areas: string[];
  title: string;
  message: string;
  starts_at: string;
  ends_at: string | null;
  resolved_at: string | null;
  notified: number;
  created_at: string;
  customers_in_area: number;
};

const supabase = createClient();

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

export default function OutagesPage() {
  const access = useInsightsAccess("dispatch");
  const [outages, setOutages] = useState<Outage[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [areas, setAreas] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("list_outages");
    if (rpcError) setError(rpcError.message);
    else setOutages((data || []) as Outage[]);
  }, []);

  useEffect(() => {
    // Loading data once access is confirmed is a genuine external sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (access.authorized) void load();
  }, [access.authorized, load]);

  async function post() {
    setBusy(true);
    setError("");
    setNotice("");
    const list = areas
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    const { data, error: rpcError } = await supabase.rpc("create_outage", {
      p_areas: list,
      p_title: title,
      p_message: message,
      p_ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    const result = data as { notified: number };
    setNotice(`Outage posted. ${result.notified} customer${result.notified === 1 ? " was" : "s were"} notified.`);
    setTitle("");
    setMessage("");
    setAreas("");
    setEndsAt("");
    await load();
  }

  async function resolve(outage: Outage) {
    if (!window.confirm(`Mark "${outage.title}" as resolved? Customers in the area will be told service is back.`)) return;
    setResolving(outage.id);
    setError("");
    setNotice("");
    const { error: rpcError } = await supabase.rpc("resolve_outage", { p_id: outage.id });
    setResolving(null);
    if (rpcError) setError(rpcError.message);
    else {
      setNotice("Marked as resolved. Customers were told service is back.");
      await load();
    }
  }

  if (access.checking) return <PkcLoader label="Opening outages" steps={["Verifying your role", "Loading outages"]} />;
  if (!access.authorized) return null;

  const open = outages.filter((o) => !o.resolved_at);
  const closed = outages.filter((o) => o.resolved_at);

  return (
    <main className={styles.page}>
      <StaffHeader current="insights" roles={access.roles} />
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <h1>Outage notices</h1>
            <p>
              Tell customers about a known fault once. Customers in the affected areas get a notification and a banner on their home
              screen, so they do not report the same problem again.
            </p>
          </div>
        </section>


        {error && (
          <div className={styles.notice} role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className={styles.notice} role="status" style={{ borderColor: "rgba(52,211,153,0.5)" }}>
            {notice}
          </div>
        )}

        <div className={styles.panel} style={{ marginBottom: 18 }}>
          <h2>Post a new outage</h2>
          <div style={{ padding: 16, display: "grid", gap: 12 }}>
            <label className={styles.field}>
              Title
              <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Fiber cut in Burgos" style={{ width: "100%" }} />
            </label>
            <label className={styles.field}>
              Message for customers
              <input
                value={message}
                maxLength={400}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="A cable was cut. Our crew is on site and we will restore service as soon as possible."
                style={{ width: "100%" }}
              />
            </label>
            <div className={styles.controls} style={{ marginBottom: 0 }}>
              <label className={styles.field} style={{ flex: 1 }}>
                Affected areas (words from the address, separated by commas)
                <input value={areas} onChange={(e) => setAreas(e.target.value)} placeholder="Burgos, Canocotan  (leave empty for everyone)" style={{ width: "100%" }} />
              </label>
              <label className={styles.field}>
                Expected back (optional)
                <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </label>
              <button className={styles.btnPrimary} onClick={() => void post()} disabled={busy || title.trim().length < 3 || message.trim().length < 3}>
                {busy ? "Posting…" : "Post and notify"}
              </button>
            </div>
            <span className={styles.muted}>
              An area matches when its words appear in the customer&apos;s area or address, for example &quot;Burgos&quot;. Customers are notified
              immediately, so check the wording first.
            </span>
          </div>
        </div>

        <div className={styles.stack}>
          <div className={styles.panel}>
            <h2>Active ({open.length})</h2>
            {open.length === 0 ? (
              <div className={styles.empty}>No active outages.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Posted</th>
                    <th>Notice</th>
                    <th>Areas</th>
                    <th className={styles.right}>Customers</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {open.map((o) => (
                    <tr key={o.id}>
                      <td>{when(o.created_at)}</td>
                      <td className={styles.wrap}>
                        <strong>{o.title}</strong>
                        <br />
                        <span className={styles.muted}>{o.message}</span>
                        {o.ends_at ? (
                          <>
                            <br />
                            <span className={styles.muted}>Expected back {when(o.ends_at)}</span>
                          </>
                        ) : null}
                      </td>
                      <td>{o.areas.length ? o.areas.join(", ") : "Everyone"}</td>
                      <td className={styles.right}>
                        {o.customers_in_area} <span className={styles.muted}>({o.notified} notified)</span>
                      </td>
                      <td className={styles.right}>
                        <button className={styles.btn} onClick={() => void resolve(o)} disabled={resolving === o.id}>
                          {resolving === o.id ? "Saving…" : "Mark resolved"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {closed.length > 0 && (
            <div className={styles.panel}>
              <h2>Resolved</h2>
              <table>
                <thead>
                  <tr>
                    <th>Posted</th>
                    <th>Notice</th>
                    <th>Areas</th>
                    <th>Resolved</th>
                  </tr>
                </thead>
                <tbody>
                  {closed.map((o) => (
                    <tr key={o.id}>
                      <td>{when(o.created_at)}</td>
                      <td className={styles.wrap}>{o.title}</td>
                      <td>{o.areas.length ? o.areas.join(", ") : "Everyone"}</td>
                      <td>{when(o.resolved_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
