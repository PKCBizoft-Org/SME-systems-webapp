"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabaseClient";
import { formatDate, formatPeso } from "@/lib/format";
import { StaffHeader } from "../../components/StaffHeader";
import { notifyBadgesChanged } from "../../components/LiveBadge";
import { PkcLoader } from "../../components/PkcLoader";
// Same look as Payment verification, so the two accounting queues feel alike.
import styles from "../verification/verification.module.css";

type Withdrawal = {
  id: string;
  referrer_client_id: string;
  gross_amount: number | null;
  transfer_fee: number | null;
  net_amount: number | null;
  payout_method: string | null;
  payout_account_name: string | null;
  payout_account_number: string | null;
  payout_notes: string | null;
  status: string | null;
  accounting_notes: string | null;
  payout_reference: string | null;
  reject_reason: string | null;
  requested_at: string;
  processed_at: string | null;
};

type ClientInfo = {
  id: string;
  customer_name: string | null;
  account_id: string | null;
  mobile_number: string | null;
};

type Filter = "pending" | "processing" | "paid" | "rejected" | "all";

const supabase = createClient();

// Pending and Processing both still need Accounting; Cancelled belongs with Rejected.
function bucketOf(status: string | null): Exclude<Filter, "all"> {
  const value = String(status || "").trim().toLowerCase();
  if (value === "processing") return "processing";
  if (value === "paid") return "paid";
  if (value === "rejected" || value === "cancelled") return "rejected";
  return "pending";
}

type Dialog = { kind: "paid" | "reject"; withdrawal: Withdrawal } | null;

export default function ReferralPayoutsPage() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [staffRoles, setStaffRoles] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [clients, setClients] = useState<Map<string, ClientInfo>>(new Map());

  const [filter, setFilter] = useState<Filter>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const [dialog, setDialog] = useState<Dialog>(null);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [dialogError, setDialogError] = useState("");

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);

    try {
      const result = await supabase
        .from("referral_withdrawals")
        .select("*")
        .order("requested_at", { ascending: false });
      if (result.error) throw new Error(result.error.message);
      const rows = (result.data || []) as Withdrawal[];
      setWithdrawals(rows);

      const clientIds = [...new Set(rows.map((r) => r.referrer_client_id))];
      if (clientIds.length) {
        const clientResult = await supabase
          .from("clients")
          .select("id, customer_name, account_id, mobile_number")
          .in("id", clientIds);
        if (clientResult.error) throw new Error(clientResult.error.message);
        setClients(new Map(((clientResult.data || []) as ClientInfo[]).map((c) => [c.id, c])));
      } else {
        setClients(new Map());
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load referral withdrawals.");
    } finally {
      setLoading(false);
      setRefreshing(false);
      notifyBadgesChanged();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function checkAccess() {
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;
      if (error || !data.session) {
        router.replace("/login");
        return;
      }
      const { data: memberships, error: membershipError } = await supabase
        .from("tenant_users")
        .select("role")
        .eq("user_id", data.session.user.id);
      if (cancelled) return;
      const roles = (memberships || []).map((item) => item.role);
      if (membershipError || (!roles.includes("admin") && !roles.includes("accounting"))) {
        router.replace("/clients");
        return;
      }
      setStaffRoles(roles.filter((role): role is string => Boolean(role)));
      setAuthorized(true);
      setCheckingAccess(false);
    }
    void checkAccess();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    // Loading data once access is confirmed is a genuine external sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (authorized) void load();
  }, [authorized, load]);

  const counts = useMemo(() => {
    const c = { pending: 0, processing: 0, paid: 0, rejected: 0, all: withdrawals.length };
    for (const w of withdrawals) c[bucketOf(w.status)] += 1;
    return c;
  }, [withdrawals]);

  const visible = useMemo(
    () => withdrawals.filter((w) => filter === "all" || bucketOf(w.status) === filter),
    [withdrawals, filter],
  );

  const owed = useMemo(
    () =>
      withdrawals
        .filter((w) => ["pending", "processing"].includes(bucketOf(w.status)))
        .reduce((sum, w) => sum + Number(w.net_amount || 0), 0),
    [withdrawals],
  );

  async function send(withdrawal: Withdrawal, action: "processing" | "paid" | "reject") {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      const text = "Your session expired. Please sign in again.";
      if (action === "processing") setMessage({ kind: "error", text });
      else setDialogError(text);
      return;
    }

    setBusyId(withdrawal.id);
    try {
      const response = await fetch("/api/accounting/referral-withdrawal", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          withdrawalId: withdrawal.id,
          action,
          reference: reference.trim(),
          note: note.trim(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "The request failed.");

      const name = clients.get(withdrawal.referrer_client_id)?.customer_name || "the customer";
      setDialog(null);
      setMessage({
        kind: "ok",
        text:
          action === "processing"
            ? `Started ${name}'s payout. They were notified in the app.`
            : action === "paid"
              ? `Marked ${formatPeso(withdrawal.net_amount)} paid to ${name}. Their rewards are now withdrawn${result?.emailed ? " and they were emailed." : "."}`
              : `Rejected ${name}'s withdrawal. Their ${formatPeso(withdrawal.gross_amount)} is back in their balance${result?.emailed ? " and they were emailed." : "."}`,
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : "The request failed.";
      if (action === "processing") setMessage({ kind: "error", text });
      else setDialogError(text);
    } finally {
      setBusyId(null);
      void load(true);
    }
  }

  function startProcessing(withdrawal: Withdrawal) {
    if (busyId) return;
    setMessage(null);
    void send(withdrawal, "processing");
  }

  function openDialog(kind: "paid" | "reject", withdrawal: Withdrawal) {
    if (busyId) return;
    setMessage(null);
    setReference("");
    setNote("");
    setDialogError("");
    setDialog({ kind, withdrawal });
  }

  function confirmDialog() {
    if (!dialog) return;
    if (dialog.kind === "paid" && !reference.trim()) {
      setDialogError("Enter the reference number of the transfer you sent.");
      return;
    }
    if (dialog.kind === "reject" && !note.trim()) {
      setDialogError("Tell the customer why the withdrawal is not approved.");
      return;
    }
    void send(dialog.withdrawal, dialog.kind);
  }

  if (checkingAccess || (authorized && loading)) return <PkcLoader />;
  if (!authorized) return null;

  return (
    <main className={styles.page}>
      <StaffHeader current="accounting" roles={staffRoles} />

      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <Link href="/accounting" className={styles.back}>
              ← Accounting
            </Link>
            <h1>Referral payouts</h1>
            <p>
              Customers earn ₱250 for every friend they bring in. When they withdraw, send the money to the account
              shown (GCash, Maya or bank), then mark it paid with your transfer reference. A ₱5 transfer fee is
              already taken out of the amount to send.
            </p>
          </div>
          <button className={styles.refresh} onClick={() => void load(true)} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
        </section>

        {loadError && (
          <div className={`${styles.notice} ${styles.error}`} role="alert">
            {loadError}
          </div>
        )}
        {message && (
          <div className={`${styles.notice} ${message.kind === "ok" ? styles.ok : styles.error}`} role="status">
            {message.text}
          </div>
        )}
        {owed > 0 && (
          <div className={styles.notice} role="status">
            You still need to send <strong>{formatPeso(owed)}</strong> in referral payouts ({counts.pending + counts.processing}{" "}
            request{counts.pending + counts.processing === 1 ? "" : "s"}).
          </div>
        )}

        <div className={styles.tabs} role="tablist">
          {(["pending", "processing", "paid", "rejected", "all"] as Filter[]).map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              className={filter === key ? styles.tabActive : styles.tab}
              onClick={() => setFilter(key)}
            >
              {key[0].toUpperCase() + key.slice(1)} <span>{counts[key]}</span>
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className={styles.empty}>
            {filter === "pending" ? "No referral withdrawals are waiting." : "Nothing to show here."}
          </div>
        ) : (
          <div className={styles.list}>
            {visible.map((w) => {
              const client = clients.get(w.referrer_client_id);
              const bucket = bucketOf(w.status);
              const open = bucket === "pending" || bucket === "processing";
              const busy = busyId === w.id;

              return (
                <article key={w.id} className={styles.card}>
                  <header>
                    <div>
                      <strong>{client?.customer_name || "Unknown customer"}</strong>
                      <small>
                        {client?.account_id || "No account ID"}
                        {client?.mobile_number ? ` · ${client.mobile_number}` : ""}
                      </small>
                    </div>
                    <span className={`${styles.badge} ${styles[bucket === "processing" ? "pending" : bucket === "paid" ? "verified" : bucket === "rejected" ? "rejected" : "pending"]}`}>
                      {w.status || bucket}
                    </span>
                  </header>

                  <dl>
                    <div>
                      <dt>Send to customer</dt>
                      <dd>
                        <strong>{formatPeso(w.net_amount)}</strong>
                        <em>
                          {" "}
                          ({formatPeso(w.gross_amount)} minus {formatPeso(w.transfer_fee)} fee)
                        </em>
                      </dd>
                    </div>
                    <div>
                      <dt>Via</dt>
                      <dd>{w.payout_method || "—"}</dd>
                    </div>
                    <div>
                      <dt>Account name</dt>
                      <dd>{w.payout_account_name || "—"}</dd>
                    </div>
                    <div>
                      <dt>Account / mobile no.</dt>
                      <dd className={styles.mono}>{w.payout_account_number || "—"}</dd>
                    </div>
                    <div>
                      <dt>Requested</dt>
                      <dd>{formatDate(w.requested_at)}</dd>
                    </div>
                    {w.payout_reference && (
                      <div>
                        <dt>Transfer ref.</dt>
                        <dd className={styles.mono}>{w.payout_reference}</dd>
                      </div>
                    )}
                    {w.processed_at && (
                      <div>
                        <dt>Finished</dt>
                        <dd>{formatDate(w.processed_at)}</dd>
                      </div>
                    )}
                  </dl>

                  {w.payout_notes && (
                    <p className={styles.reason}>
                      <strong>Customer note:</strong> {w.payout_notes}
                    </p>
                  )}
                  {bucket === "rejected" && (w.reject_reason || w.accounting_notes) && (
                    <p className={styles.reason}>
                      <strong>Reason:</strong> {w.reject_reason || w.accounting_notes}
                    </p>
                  )}
                  {bucket === "rejected" && !w.reject_reason && !w.accounting_notes && String(w.status).toLowerCase() === "cancelled" && (
                    <p className={styles.reason}>The customer cancelled this request.</p>
                  )}

                  {open && (
                    <div className={styles.actions}>
                      <button className={styles.reject} disabled={busy} onClick={() => openDialog("reject", w)}>
                        Reject
                      </button>
                      {bucket === "pending" && (
                        <button className={styles.ghost} disabled={busy} onClick={() => startProcessing(w)}>
                          {busy ? "Working…" : "Start processing"}
                        </button>
                      )}
                      <button className={styles.verify} disabled={busy} onClick={() => openDialog("paid", w)}>
                        Mark as paid
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {dialog && (
        <div className={styles.modalBackdrop} role="presentation" onClick={() => !busyId && setDialog(null)}>
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-label={dialog.kind === "paid" ? "Mark payout as paid" : "Reject withdrawal"}
            onClick={(e) => e.stopPropagation()}
          >
            {dialog.kind === "paid" ? (
              <>
                <h2>Confirm the payout was sent</h2>
                <p className={styles.modalLead}>
                  Send <strong>{formatPeso(dialog.withdrawal.net_amount)}</strong> to{" "}
                  <strong>{dialog.withdrawal.payout_account_name || "the customer"}</strong> via {dialog.withdrawal.payout_method} (
                  {dialog.withdrawal.payout_account_number}), then enter your transfer reference. Only mark it paid after the
                  money has actually left your account.
                </p>
                <input
                  className={styles.noteBox}
                  placeholder="Transfer reference number (required)"
                  value={reference}
                  maxLength={80}
                  onChange={(e) => setReference(e.target.value)}
                  autoFocus
                />
                <textarea
                  className={styles.noteBox}
                  placeholder="Optional note"
                  value={note}
                  maxLength={300}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                />
              </>
            ) : (
              <>
                <h2>Reject this withdrawal?</h2>
                <p className={styles.modalLead}>
                  The customer sees the reason and the {formatPeso(dialog.withdrawal.gross_amount)} goes back into their
                  referral balance, so they can try again.
                </p>
                <textarea
                  className={styles.noteBox}
                  placeholder="Why is it not approved? (required, the customer will read this)"
                  value={note}
                  maxLength={300}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  autoFocus
                />
              </>
            )}

            {dialogError && <div className={styles.modalError}>{dialogError}</div>}

            <div className={styles.modalActions}>
              <button className={styles.ghost} disabled={Boolean(busyId)} onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button
                className={dialog.kind === "paid" ? styles.verify : styles.reject}
                disabled={Boolean(busyId)}
                onClick={confirmDialog}
              >
                {busyId ? "Working…" : dialog.kind === "paid" ? "Mark as paid" : "Reject withdrawal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
