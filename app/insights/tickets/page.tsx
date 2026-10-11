"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "../../../lib/supabaseClient";
import { formatDate } from "@/lib/format";
import { StaffHeader } from "../../components/StaffHeader";
import { PkcLoader } from "../../components/PkcLoader";
import { InsightsNav } from "../InsightsNav";
import { useInsightsAccess } from "../useInsightsAccess";
import styles from "../../accounting/reports/reports.module.css";

type Ticket = {
  id: string;
  customer_name: string | null;
  account_id: string | null;
  issue_type: string | null;
  description: string | null;
  status: string | null;
  created_at: string;
  messages: number;
  last_activity: string;
  last_sender_role: "customer" | "technician" | "staff" | null;
  technician_name: string | null;
};

type Message = {
  id: string;
  sender_role: "customer" | "technician" | "staff";
  sender_name: string | null;
  body: string;
  created_at: string;
};

type Filter = "all" | "waiting" | "open";

const supabase = createClient();
const ROLE: Record<Message["sender_role"], string> = { customer: "Customer", technician: "Technician", staff: "Support" };
const isDone = (status: string | null) => /(complete|resolved|done|fixed|cancel|closed)/i.test(status || "");

export default function TicketsPage() {
  const access = useInsightsAccess("tickets");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filter, setFilter] = useState<Filter>("waiting");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [threadError, setThreadError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("staff_tickets", { p_limit: 100 });
    if (rpcError) setError(rpcError.message);
    else setTickets((data || []) as Ticket[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Loading data once access is confirmed is a genuine external sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (access.authorized) void load();
  }, [access.authorized, load]);

  const loadThread = useCallback(async (id: string) => {
    const { data, error: loadError } = await supabase
      .from("ticket_messages")
      .select("id, sender_role, sender_name, body, created_at")
      .eq("request_id", id)
      .order("created_at", { ascending: true })
      .limit(300);
    if (loadError) setThreadError(loadError.message);
    else {
      setThreadError("");
      setThread((data || []) as Message[]);
    }
  }, []);

  useEffect(() => {
    if (!openId) return undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadThread(openId);
    const timer = setInterval(() => void loadThread(openId), 8000);
    return () => clearInterval(timer);
  }, [openId, loadThread]);

  async function send() {
    const body = draft.trim();
    if (!openId || !body || sending) return;
    setSending(true);
    setThreadError("");
    const { error: sendError } = await supabase.rpc("send_ticket_message", { p_request_id: openId, p_body: body });
    setSending(false);
    if (sendError) {
      setThreadError(sendError.message);
      return;
    }
    setDraft("");
    await Promise.all([loadThread(openId), load()]);
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (filter === "waiting" && !(t.last_sender_role === "customer" && !isDone(t.status))) return false;
      if (filter === "open" && isDone(t.status)) return false;
      if (!q) return true;
      return [t.customer_name, t.account_id, t.issue_type, t.description, t.technician_name].some((v) =>
        String(v || "").toLowerCase().includes(q),
      );
    });
  }, [tickets, filter, search]);

  const counts = useMemo(
    () => ({
      all: tickets.length,
      open: tickets.filter((t) => !isDone(t.status)).length,
      waiting: tickets.filter((t) => t.last_sender_role === "customer" && !isDone(t.status)).length,
    }),
    [tickets],
  );

  if (access.checking) return <PkcLoader label="Opening tickets" steps={["Verifying your role", "Loading tickets"]} />;
  if (!access.authorized) return null;

  const current = tickets.find((t) => t.id === openId) || null;

  return (
    <main className={styles.page}>
      <StaffHeader current="insights" roles={access.roles} />
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <h1>Tickets</h1>
            <p>Customer issue reports and their chat. Tickets where the customer wrote last are waiting for a reply.</p>
          </div>
          <button className={styles.btn} onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
        </section>

        <InsightsNav current="tickets" permissions={access.permissions} />

        <div className={styles.tabs} role="tablist">
          {(
            [
              ["waiting", `Waiting for a reply (${counts.waiting})`],
              ["open", `Open (${counts.open})`],
              ["all", `All (${counts.all})`],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={filter === key} className={filter === key ? styles.tabOn : styles.tab} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>

        <div className={styles.controls}>
          <label className={styles.field}>
            Search
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Customer, issue or technician" />
          </label>
        </div>

        {error && <div className={styles.notice}>{error}</div>}

        <div className={styles.split}>
          <div className={styles.panel}>
            {visible.length === 0 ? (
              <div className={styles.empty}>{loading ? "Loading…" : "No tickets here."}</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Issue</th>
                    <th>Status</th>
                    <th className={styles.right}>Msgs</th>
                    <th>Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => setOpenId(t.id)}
                      style={{ cursor: "pointer", background: t.id === openId ? "rgba(76,232,255,0.08)" : undefined }}
                    >
                      <td>
                        {t.customer_name || "—"}
                        <br />
                        <span className={styles.muted}>{t.account_id || ""}</span>
                      </td>
                      <td className={styles.wrap}>
                        {t.issue_type || "Issue"}
                        <br />
                        <span className={styles.muted}>{t.technician_name ? `Technician: ${t.technician_name}` : "No technician yet"}</span>
                      </td>
                      <td>{t.status || "—"}</td>
                      <td className={styles.right}>
                        {t.messages}
                        {t.last_sender_role === "customer" && !isDone(t.status) ? <span className={styles.flag} style={{ marginLeft: 6 }}>reply</span> : null}
                      </td>
                      <td>{formatDate(t.last_activity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className={styles.panel} aria-live="polite">
            {!current ? (
              <div className={styles.empty}>Select a ticket to read and answer the conversation.</div>
            ) : (
              <div style={{ padding: 16, display: "grid", gap: 12 }}>
                <div>
                  <strong>{current.customer_name || "Customer"}</strong>
                  <div className={styles.muted}>
                    {current.issue_type} · {current.status}
                  </div>
                  {current.description ? <p style={{ margin: "8px 0 0", fontSize: 13 }}>{current.description}</p> : null}
                </div>

                <div style={{ display: "grid", gap: 8, maxHeight: 360, overflowY: "auto" }}>
                  {thread.length === 0 ? (
                    <div className={styles.muted}>No messages yet.</div>
                  ) : (
                    thread.map((m) => (
                      <div
                        key={m.id}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 12,
                          border: "1px solid rgba(76,232,255,0.18)",
                          background: m.sender_role === "staff" ? "rgba(76,232,255,0.12)" : "rgba(3,12,17,0.6)",
                        }}
                      >
                        <div className={styles.muted}>
                          {m.sender_name || ROLE[m.sender_role]} · {ROLE[m.sender_role]} ·{" "}
                          {new Date(m.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
                        </div>
                        <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{m.body}</div>
                      </div>
                    ))
                  )}
                </div>

                {threadError && <div className={styles.notice}>{threadError}</div>}

                {isDone(current.status) && /cancel/i.test(current.status || "") ? (
                  <div className={styles.muted}>This request was cancelled, so the chat is closed.</div>
                ) : (
                  <div className={styles.controls} style={{ marginBottom: 0 }}>
                    <label className={styles.field} style={{ flex: 1 }}>
                      Reply
                      <input
                        value={draft}
                        maxLength={1000}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void send();
                        }}
                        placeholder="Write a reply to the customer"
                        style={{ width: "100%" }}
                      />
                    </label>
                    <button className={styles.btnPrimary} onClick={() => void send()} disabled={sending || !draft.trim()}>
                      {sending ? "Sending…" : "Send"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
