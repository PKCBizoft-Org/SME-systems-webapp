"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabaseClient";
import { formatDate, formatPeso } from "@/lib/format";
import { StaffHeader } from "../../components/StaffHeader";
import { notifyBadgesChanged } from "../../components/LiveBadge";
import { PkcLoader } from "../../components/PkcLoader";
import styles from "./verification.module.css";

type Submission = {
  id: string;
  tenant_id: string | null;
  client_id: string | null;
  user_id: string | null;
  service_request_id: string | null;
  amount_claimed: number | null;
  payment_method: string | null;
  reference_number: string | null;
  bank_name: string | null;
  payment_date: string | null;
  proof_path: string | null;
  status: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  payment_id: string | null;
  reject_reason: string | null;
  reject_note: string | null;
  created_at: string;
};

type ClientInfo = {
  id: string;
  customer_name: string | null;
  account_id: string | null;
  plan_name: string | null;
};

type RequestInfo = {
  id: string;
  requested_plan: string | null;
  requested_amount: number | null;
  status: string | null;
  installation_location_type: string | null;
  installation_area: string | null;
};

type Filter = "pending" | "verified" | "rejected" | "all";

const supabase = createClient();

function bucketOf(status: string | null): Exclude<Filter, "all"> {
  const value = String(status || "").trim().toLowerCase();
  if (value.includes("verif") || value.includes("approv") || value === "paid") return "verified";
  if (value.includes("reject") || value.includes("declin") || value.includes("cancel")) return "rejected";
  return "pending";
}

const REJECT_REASONS = ["Wrong amount", "Reference not found", "Blurry receipt", "Reference already used", "Other"];

export default function PaymentVerificationPage() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [staffRoles, setStaffRoles] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [clients, setClients] = useState<Map<string, ClientInfo>>(new Map());
  const [requests, setRequests] = useState<Map<string, RequestInfo>>(new Map());

  const [filter, setFilter] = useState<Filter>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const [rejecting, setRejecting] = useState<Submission | null>(null);
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectError, setRejectError] = useState("");

  const [needsSecondary, setNeedsSecondary] = useState<Submission | null>(null);
  const [secondaryPassword, setSecondaryPassword] = useState("");
  const [secondaryError, setSecondaryError] = useState("");

  const [receiptUrls, setReceiptUrls] = useState<Record<string, string>>({});
  const [proofFor, setProofFor] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);

    try {
      const subs = await supabase
        .from("payment_submissions")
        .select("*")
        .order("created_at", { ascending: false });
      if (subs.error) throw new Error(subs.error.message);
      const rows = (subs.data || []) as Submission[];
      setSubmissions(rows);

      const clientIds = [...new Set(rows.map((r) => r.client_id).filter((v): v is string => !!v))];
      const requestIds = [...new Set(rows.map((r) => r.service_request_id).filter((v): v is string => !!v))];

      const [clientResult, requestResult] = await Promise.all([
        clientIds.length
          ? supabase.from("clients").select("id, customer_name, account_id, plan_name").in("id", clientIds)
          : Promise.resolve({ data: [], error: null }),
        requestIds.length
          ? supabase.from("service_requests").select("id, requested_plan, requested_amount, status, installation_location_type, installation_area").in("id", requestIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (clientResult.error) throw new Error(clientResult.error.message);
      if (requestResult.error) throw new Error(requestResult.error.message);

      setClients(new Map(((clientResult.data || []) as ClientInfo[]).map((c) => [c.id, c])));
      setRequests(new Map(((requestResult.data || []) as RequestInfo[]).map((r) => [r.id, r])));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load payment submissions.");
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

  // Pending payments show their receipt straight away so Accounting can
  // compare it with the details without opening anything.
  useEffect(() => {
    const wanted = submissions.filter(
      (s) => s.proof_path && bucketOf(s.status) === "pending" && !receiptUrls[s.id],
    );
    if (wanted.length === 0) return;
    let cancelled = false;
    void (async () => {
      const found: Record<string, string> = {};
      for (const s of wanted) {
        const { data } = await supabase.storage.from("payment-proofs").createSignedUrl(s.proof_path as string, 3600);
        if (data?.signedUrl) found[s.id] = data.signedUrl;
      }
      if (!cancelled && Object.keys(found).length) setReceiptUrls((prev) => ({ ...prev, ...found }));
    })();
    return () => {
      cancelled = true;
    };
  }, [submissions, receiptUrls]);

  const counts = useMemo(() => {
    const c = { pending: 0, verified: 0, rejected: 0, all: submissions.length };
    for (const s of submissions) c[bucketOf(s.status)] += 1;
    return c;
  }, [submissions]);

  const visible = useMemo(
    () => submissions.filter((s) => filter === "all" || bucketOf(s.status) === filter),
    [submissions, filter],
  );

  async function viewProof(submission: Submission) {
    if (proofFor === submission.id) {
      setProofFor(null);
      return;
    }
    setProofFor(submission.id);
    setProofUrl(null);
    setProofError(null);
    if (!submission.proof_path) {
      setProofError("The customer did not attach a receipt.");
      return;
    }
    const { data, error } = await supabase.storage
      .from("payment-proofs")
      .createSignedUrl(submission.proof_path, 300);
    if (error || !data?.signedUrl) {
      setProofError(error?.message || "Unable to open the receipt image.");
      return;
    }
    setProofUrl(data.signedUrl);
  }

  async function authHeader() {
    const { data } = await supabase.auth.getSession();
    return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : null;
  }

  // Approving goes through the server, which also asks for the secondary
  // password on large amounts and emails the customer.
  async function runVerify(submission: Submission, secondary?: string) {
    const client = submission.client_id ? clients.get(submission.client_id) : undefined;
    const claimed = Number(submission.amount_claimed || 0);

    const headers = await authHeader();
    if (!headers) {
      setMessage({ kind: "error", text: "Your session expired. Please sign in again." });
      return;
    }

    setBusyId(submission.id);
    try {
      const response = await fetch("/api/accounting/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ submissionId: submission.id, secondary }),
      });
      const result = await response.json().catch(() => ({}));

      if (response.status === 428 || result?.code === "secondary_wrong") {
        setSecondaryError(result?.code === "secondary_wrong" ? result.error : "");
        setNeedsSecondary(submission);
        return;
      }

      if (!response.ok) throw new Error(result?.error || "Verification failed.");

      setNeedsSecondary(null);
      setSecondaryPassword("");
      setSecondaryError("");

      const receipt = result?.result?.receipt_number as string | undefined;
      const toInstall = Boolean(result?.result?.new_customer);
      setMessage({
        kind: "ok",
        text:
          `Verified ${formatPeso(claimed)} for ${client?.customer_name || "the customer"}${receipt ? ` (${receipt})` : ""}. ` +
          (toInstall
            ? "Their account is now For installation and the job is in the technicians' list."
            : "Their plan is now set up.") +
          (result?.emailed ? " The customer was emailed." : " (No email was sent.)"),
      });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Verification failed." });
    } finally {
      setBusyId(null);
      void load(true);
    }
  }

  function verify(submission: Submission) {
    if (busyId) return;
    setMessage(null);

    const client = submission.client_id ? clients.get(submission.client_id) : undefined;
    const request = submission.service_request_id ? requests.get(submission.service_request_id) : undefined;
    const claimed = Number(submission.amount_claimed || 0);
    const expected = Number(request?.requested_amount || 0);

    if (!submission.client_id || !submission.tenant_id) {
      setMessage({ kind: "error", text: "This submission has no client or tenant, so it can't be posted." });
      return;
    }
    if (!submission.service_request_id) {
      setMessage({ kind: "error", text: "This submission is not linked to a plan application." });
      return;
    }
    if (expected > 0 && claimed !== expected) {
      setMessage({
        kind: "error",
        text: `Amount mismatch: the customer entered ${formatPeso(claimed)} but ${request?.requested_plan || "the plan"} costs ${formatPeso(expected)}. Reject it and ask them to pay the exact amount.`,
      });
      return;
    }

    const reference = (submission.reference_number || "").trim();
    if (reference) {
      const dup = submissions.find(
        (s) =>
          s.id !== submission.id &&
          bucketOf(s.status) === "verified" &&
          (s.reference_number || "").trim().toLowerCase() === reference.toLowerCase(),
      );
      if (dup) {
        setMessage({
          kind: "error",
          text: `Reference ${reference} was already verified on another submission. This looks like a reused receipt.`,
        });
        return;
      }
    }

    const ok = window.confirm(
      `Confirm you received ${formatPeso(claimed)} by ${submission.payment_method || "payment"}` +
        `${reference ? ` (ref ${reference})` : ""} from ${client?.customer_name || "this customer"}?\n\n` +
        `This records the payment, emails the customer, and ${request?.requested_plan || "the plan"} is set up.`,
    );
    if (!ok) return;

    void runVerify(submission);
  }

  function openReject(submission: Submission) {
    if (busyId) return;
    setMessage(null);
    setRejectReason(REJECT_REASONS[0]);
    setRejectNote("");
    setRejectError("");
    setRejecting(submission);
  }

  async function confirmReject() {
    if (!rejecting) return;
    if (rejectReason === "Other" && !rejectNote.trim()) {
      setRejectError("Add a short note explaining the reason.");
      return;
    }

    const headers = await authHeader();
    if (!headers) {
      setRejectError("Your session expired. Please sign in again.");
      return;
    }

    const target = rejecting;
    setBusyId(target.id);
    setRejectError("");
    try {
      const response = await fetch("/api/accounting/reject-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ submissionId: target.id, reason: rejectReason, note: rejectNote.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Rejection failed.");

      setRejecting(null);
      setMessage({
        kind: "ok",
        text: `Payment rejected (${rejectReason}). The application was cancelled${result?.emailed ? " and the customer was emailed." : "."}`,
      });
    } catch (error) {
      setRejectError(error instanceof Error ? error.message : "Rejection failed.");
    } finally {
      setBusyId(null);
      void load(true);
    }
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
            <h1>Payment verification</h1>
            <p>
              Check each GCash or bank payment against your own transaction history, then verify it. Verifying records the
              payment, emails the customer, and sets up their plan (new customers go to installation).
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

        <div className={styles.tabs} role="tablist">
          {(["pending", "verified", "rejected", "all"] as Filter[]).map((key) => (
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
            {filter === "pending" ? "No payments are waiting for verification." : "Nothing to show here."}
          </div>
        ) : (
          <div className={styles.list}>
            {visible.map((s) => {
              const client = s.client_id ? clients.get(s.client_id) : undefined;
              const request = s.service_request_id ? requests.get(s.service_request_id) : undefined;
              const bucket = bucketOf(s.status);
              const mismatch =
                !!request?.requested_amount && Number(s.amount_claimed || 0) !== Number(request.requested_amount);
              const busy = busyId === s.id;

              return (
                <article key={s.id} className={styles.card}>
                  <header>
                    <div>
                      <strong>{client?.customer_name || "Unknown customer"}</strong>
                      <small>{client?.account_id || "No account ID"}</small>
                    </div>
                    <span className={`${styles.badge} ${styles[bucket]}`}>{bucket}</span>
                  </header>

                  <dl>
                    <div>
                      <dt>Plan</dt>
                      <dd>{request?.requested_plan || "—"}</dd>
                    </div>
                    <div>
                      <dt>Amount paid</dt>
                      <dd className={mismatch ? styles.bad : undefined}>
                        {formatPeso(s.amount_claimed)}
                        {mismatch && <em> (plan is {formatPeso(request?.requested_amount)})</em>}
                      </dd>
                    </div>
                    {request?.installation_area && (
                      <div>
                        <dt>Install at</dt>
                        <dd>
                          {request.installation_area}
                          {request.installation_location_type === "other" && <em> (different from account address)</em>}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>Method</dt>
                      <dd>{s.payment_method || "—"}</dd>
                    </div>
                    <div>
                      <dt>Reference no.</dt>
                      <dd className={styles.mono}>{s.reference_number || "—"}</dd>
                    </div>
                    <div>
                      <dt>Paid on</dt>
                      <dd>{formatDate(s.payment_date)}</dd>
                    </div>
                    <div>
                      <dt>Submitted</dt>
                      <dd>{formatDate(s.created_at)}</dd>
                    </div>
                  </dl>

                  {bucket === "pending" && receiptUrls[s.id] && proofFor !== s.id && (
                    <a href={receiptUrls[s.id]} target="_blank" rel="noreferrer" className={styles.proof} style={{ display: "block" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={receiptUrls[s.id]} alt="Customer payment receipt" />
                    </a>
                  )}
                  {bucket === "pending" && !s.proof_path && (
                    <p className={styles.reason}>No receipt was attached to this payment.</p>
                  )}

                  {bucket === "rejected" && s.reject_reason && (
                    <p className={styles.reason}>
                      <strong>Reason:</strong> {s.reject_reason}
                      {s.reject_note ? ` - ${s.reject_note}` : ""}
                    </p>
                  )}

                  <div className={styles.actions}>
                    <button className={styles.ghost} onClick={() => void viewProof(s)}>
                      {proofFor === s.id ? "Hide receipt" : "View receipt"}
                    </button>
                    {bucket === "pending" && (
                      <>
                        <button className={styles.reject} disabled={busy} onClick={() => openReject(s)}>
                          Reject
                        </button>
                        <button className={styles.verify} disabled={busy} onClick={() => verify(s)}>
                          {busy ? "Working…" : "Verify payment"}
                        </button>
                      </>
                    )}
                  </div>

                  {proofFor === s.id && (
                    <div className={styles.proof}>
                      {proofError ? (
                        <p>{proofError}</p>
                      ) : proofUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={proofUrl} alt="Customer payment receipt" />
                      ) : (
                        <p>Loading receipt…</p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {rejecting && (
        <div className={styles.modalBackdrop} role="presentation" onClick={() => setRejecting(null)}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Reject payment" onClick={(e) => e.stopPropagation()}>
            <h2>Reject this payment?</h2>
            <p className={styles.modalLead}>
              {clients.get(rejecting.client_id || "")?.customer_name || "The customer"} will see the reason and can apply again.
            </p>

            <div className={styles.reasons}>
              {REJECT_REASONS.map((reason) => (
                <label key={reason} className={rejectReason === reason ? styles.reasonOn : styles.reasonOff}>
                  <input type="radio" name="reason" checked={rejectReason === reason} onChange={() => setRejectReason(reason)} />
                  {reason}
                </label>
              ))}
            </div>

            <textarea
              className={styles.noteBox}
              placeholder={rejectReason === "Other" ? "Explain the reason (required)" : "Optional note for the customer"}
              value={rejectNote}
              maxLength={300}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={3}
            />

            {rejectError && <div className={styles.modalError}>{rejectError}</div>}

            <div className={styles.modalActions}>
              <button className={styles.ghost} onClick={() => setRejecting(null)}>
                Cancel
              </button>
              <button className={styles.reject} disabled={busyId === rejecting.id} onClick={() => void confirmReject()}>
                {busyId === rejecting.id ? "Rejecting…" : "Reject payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {needsSecondary && (
        <div className={styles.modalBackdrop} role="presentation">
          <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Secondary password">
            <h2>Confirm with your secondary password</h2>
            <p className={styles.modalLead}>
              This payment is {formatPeso(needsSecondary.amount_claimed)}. Large amounts need your secondary password before they are approved.
            </p>

            <input
              className={styles.noteBox}
              type="password"
              autoComplete="current-password"
              placeholder="Secondary password"
              value={secondaryPassword}
              onChange={(e) => setSecondaryPassword(e.target.value)}
              autoFocus
            />

            {secondaryError && <div className={styles.modalError}>{secondaryError}</div>}

            <div className={styles.modalActions}>
              <button
                className={styles.ghost}
                onClick={() => {
                  setNeedsSecondary(null);
                  setSecondaryPassword("");
                  setSecondaryError("");
                }}
              >
                Cancel
              </button>
              <button
                className={styles.verify}
                disabled={!secondaryPassword || busyId === needsSecondary.id}
                onClick={() => void runVerify(needsSecondary, secondaryPassword)}
              >
                {busyId === needsSecondary.id ? "Checking…" : "Approve payment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
