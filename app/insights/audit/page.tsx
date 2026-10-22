"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "../../../lib/supabaseClient";
import { StaffHeader } from "../../components/StaffHeader";
import { PkcLoader } from "../../components/PkcLoader";
import { useInsightsAccess } from "../useInsightsAccess";
import styles from "../../accounting/reports/reports.module.css";

type Entry = {
  id: string;
  at: string;
  who: string;
  what: string;
  customer: string;
  detail: string;
  source: "record" | "staff";
};

type Group = "all" | "money" | "installs" | "accounts" | "staff";

const supabase = createClient();

const LABELS: Record<string, string> = {
  payment_verified: "Payment verified",
  payment_rejected: "Payment rejected",
  payment_cancelled: "Payment cancelled",
  installation_completed: "Installation completed",
  installation_status: "Installation status",
  account_status: "Account status",
  modem_serial: "Modem serial saved",
  permission_changed: "Permission changed",
  job_assigned: "Job assigned",
  outage_created: "Outage posted",
  outage_resolved: "Outage resolved",
};

function groupOf(entry: Entry): Exclude<Group, "all"> {
  if (entry.source === "staff") return "staff";
  if (entry.what.startsWith("payment")) return "money";
  if (entry.what === "installation_completed" || entry.what === "modem_serial" || entry.what === "job_assigned") return "installs";
  if (entry.what.startsWith("outage")) return "accounts";
  return "accounts";
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function AuditPage() {
  const access = useInsightsAccess("audit");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [group, setGroup] = useState<Group>("all");
  const [search, setSearch] = useState("");
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const since = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
    const { data, error: rpcError } = await supabase.rpc("audit_feed", { p_limit: 1000, p_since: since });
    if (rpcError) setError(rpcError.message);
    else setEntries((data || []) as Entry[]);
    setLoading(false);
  }, [days]);

  useEffect(() => {
    // Loading data once access is confirmed is a genuine external sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (access.authorized) void load();
  }, [access.authorized, load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (group !== "all" && groupOf(e) !== group) return false;
      if (!q) return true;
      return [e.who, e.what, LABELS[e.what], e.customer, e.detail].some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [entries, group, search]);

  function exportCsv() {
    const rows: unknown[][] = [["When", "Who", "What", "Customer / target", "Detail"]];
    for (const e of visible) rows.push([new Date(e.at).toISOString(), e.who, LABELS[e.what] || e.what, e.customer, e.detail]);
    const body = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (access.checking) return <PkcLoader label="Opening the audit log" steps={["Verifying your role", "Loading activity"]} />;
  if (!access.authorized) return null;

  return (
    <main className={styles.page}>
      <StaffHeader current="insights" roles={access.roles} />
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <h1>Audit log</h1>
            <p>
              Payment decisions, installations, modem serials, account changes and permission changes, with who did it and when.
              Entries cannot be edited from the app.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className={styles.btn} onClick={exportCsv} disabled={visible.length === 0}>
              ⬇ Export CSV
            </button>
            <button className={styles.btn} onClick={() => void load()} disabled={loading}>
              {loading ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>
        </section>


        <div className={styles.tabs} role="tablist">
          {(
            [
              ["all", "Everything"],
              ["money", "Payments"],
              ["installs", "Installations, jobs & modems"],
              ["accounts", "Account changes"],
              ["staff", "Staff & permissions"],
            ] as [Group, string][]
          ).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={group === key} className={group === key ? styles.tabOn : styles.tab} onClick={() => setGroup(key)}>
              {label}
            </button>
          ))}
        </div>

        <div className={styles.controls}>
          <label className={styles.field}>
            Search
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Person, customer or detail" />
          </label>
          <label className={styles.field}>
            Period
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={1}>Last 24 hours</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={0}>All time</option>
            </select>
          </label>
        </div>

        {error && <div className={styles.notice}>{error}</div>}

        <div className={styles.panel}>
          {visible.length === 0 ? (
            <div className={styles.empty}>{loading ? "Loading…" : "Nothing to show here yet."}</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>What</th>
                  <th>Customer / target</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</td>
                    <td>{e.who}</td>
                    <td className={e.what === "payment_rejected" ? styles.bad : undefined}>{LABELS[e.what] || e.what || "—"}</td>
                    <td>{e.customer || "—"}</td>
                    <td className={styles.wrap}>{e.detail || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className={styles.muted} style={{ marginTop: 10 }}>
          Showing {visible.length} of {entries.length} entries. The most recent 1,000 are loaded.
        </p>
      </div>
    </main>
  );
}
