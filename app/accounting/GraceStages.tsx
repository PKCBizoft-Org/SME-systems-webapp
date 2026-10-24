"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "../../lib/supabaseClient";
import { formatDate, formatPeso } from "@/lib/format";
import { SCHEDULE_TEXT } from "@/lib/billingSchedule";
import styles from "./grace.module.css";

const supabase = createClient();

type Row = {
  id: string;
  client_id: string | null;
  bill_id: string | null;
  due_date: string | null;
  grace_until: string | null;
  disconnect_date: string | null;
  terminate_date: string | null;
  balance: number;
  closed: boolean;
  stage: string | null;
};

const STAGES = ["Grace period", "For disconnection", "Terminated"] as const;
type Stage = (typeof STAGES)[number];

const HELP: Record<Stage, string> = {
  "Grace period": `Past due but the service is still on. ${SCHEDULE_TEXT.grace}.`,
  "For disconnection": `Grace is over. Disconnect on ${SCHEDULE_TEXT.disconnect.toLowerCase()}, then ${SCHEDULE_TEXT.terminate.toLowerCase()}.`,
  Terminated: "Unpaid for too long. The account was terminated automatically.",
};

export function GraceStages() {
  const [rows, setRows] = useState<Row[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [stage, setStage] = useState<Stage>("Grace period");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("billing_balances")
      .select("id, client_id, bill_id, due_date, grace_until, disconnect_date, terminate_date, balance, closed, stage")
      .in("stage", [...STAGES])
      .gt("balance", 0);
    if (err) return setError(err.message);
    const list = ((data || []) as Row[]).filter((r) => !r.closed && r.client_id);
    setRows(list);
    const ids = [...new Set(list.map((r) => r.client_id as string))];
    if (ids.length) {
      const res = await supabase.from("clients").select("id, customer_name").in("id", ids);
      setNames(new Map((res.data || []).map((c) => [c.id, c.customer_name || "Customer"])));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const out: Record<Stage, number> = { "Grace period": 0, "For disconnection": 0, Terminated: 0 };
    for (const r of rows) if (r.stage && r.stage in out) out[r.stage as Stage] += 1;
    return out;
  }, [rows]);

  const shown = rows
    .filter((r) => r.stage === stage)
    .sort((a, b) => String(a.disconnect_date ?? "").localeCompare(String(b.disconnect_date ?? "")));

  async function remind(row: Row) {
    if (!row.client_id) return;
    setBusy(row.id);
    const message =
      row.stage === "Grace period"
        ? `Your bill ${row.bill_id ?? ""} of ${formatPeso(row.balance)} is past due. Please pay by ${formatDate(row.grace_until)} to keep your service on.`
        : `Your bill ${row.bill_id ?? ""} of ${formatPeso(row.balance)} is unpaid and your service can be disconnected. Please pay now to avoid termination on ${formatDate(row.terminate_date)}.`;
    const { error: err } = await supabase.rpc("remind_customer", { p_client: row.client_id, p_message: message });
    setBusy(null);
    if (err) return setError(err.message);
    setSent((prev) => new Set(prev).add(row.id));
  }

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <small>GRACE &amp; DISCONNECTION</small>
        <h2>Who is late, and what happens next</h2>
        <p>
          Due: {SCHEDULE_TEXT.due.toLowerCase()}. Grace: {SCHEDULE_TEXT.grace.toLowerCase()}. Disconnection:{" "}
          {SCHEDULE_TEXT.disconnect.toLowerCase()}. Termination: {SCHEDULE_TEXT.terminate.toLowerCase()}.
        </p>
      </div>
      <div className={styles.tabs}>
        {STAGES.map((s) => (
          <button key={s} className={`${styles.tab} ${stage === s ? styles.on : ""}`} onClick={() => setStage(s)}>
            {s} ({counts[s]})
          </button>
        ))}
      </div>
      {error && <div className={styles.note}>{error}</div>}
      {shown.length === 0 ? (
        <div className={styles.empty}>No customers in this stage.</div>
      ) : (
        shown.map((r) => (
          <div className={styles.row} key={r.id}>
            <div>
              <Link href={`/accounting/${r.client_id}`}>{names.get(r.client_id as string) || "Customer"}</Link>
              <small>{r.bill_id}</small>
            </div>
            <div>
              <small>Due {formatDate(r.due_date)}</small>
              <small>Grace until {formatDate(r.grace_until)}</small>
              <small>Disconnect {formatDate(r.disconnect_date)}</small>
            </div>
            <div className={styles.amt}>{formatPeso(r.balance)}</div>
            <button className={styles.btn} disabled={busy === r.id || sent.has(r.id)} onClick={() => void remind(r)}>
              {sent.has(r.id) ? "Reminded" : busy === r.id ? "Sending…" : "Remind"}
            </button>
          </div>
        ))
      )}
      <div className={styles.note}>{HELP[stage]}</div>
    </section>
  );
}
