"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabaseClient";
import { formatDate, formatPeso } from "@/lib/format";
import { StaffHeader } from "../../components/StaffHeader";
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
};

type Filter = "pending" | "verified" | "rejected" | "all";

const supabase = createClient();

function bucketOf(status: string | null): Exclude<Filter, "all"> {
  const value = String(status || "").trim().toLowerCase();
  if (value.includes("verif") || value.includes("approv") || value === "paid") return "verified";
  if (value.includes("reject") || value.includes("declin") || value.includes("cancel")) return "rejected";
  return "pending";
}

function newPaymentCode() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${date}-${rand}`;
}

export default function PaymentVerificationPage() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [staffRoles, setStaffRoles] = useState<string[]>([]);
  const [reviewerId, setReviewerId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [clients, setClients] = useState<Map<string, ClientInfo>>(new Map());
  const [requests, setRequests] = useState<Map<string, RequestInfo>>(new Map());

  const [filter, setFilter] = useState<Filter>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

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
          ? supabase.from("service_requests").select("id, requested_plan, requested_amount, status").in("id", requestIds)
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
      setReviewerId(data.session.user.id);
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

  async function verify(submission: Submission) {
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
      setMessage({ kind: "error", text: "This submission is not linked to a plan request." });
      return;
    }
    if (expected > 0 && claimed !== expected) {
      setMessage({
        kind: "error",
        text: `Amount mismatch: the customer entered ${formatPeso(claimed)} but ${request?.requested_plan || "the plan"} costs ${formatPeso(expected)}. Reject it and ask them to pay the exact amount.`,
      });
      return;
    }

    // The same GCash/bank reference must never be accepted twice.
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
        `This records the payment and schedules ${request?.requested_plan || "the plan"}.`,
    );
    if (!ok) return;

    setBusyId(submission.id);
    const code = newPaymentCode();

    try {
      // 1. record the payment
      const inserted = await supabase
        .from("payments")
        .insert({
          tenant_id: submission.tenant_id,
          client_id: submission.client_id,
          payment_id: `PAY-${code}`,
          receipt_number: `REC-${code}`,
          amount_paid: claimed,
          payment_date: submission.payment_date || new Date().toISOString().slice(0, 10),
          payment_method: submission.payment_method || "GCash",
          service_request_id: submission.service_request_id,
        })
        .select("id")
        .single();
      if (inserted.error) throw new Error(`Could not record the payment: ${inserted.error.message}`);

      // 2. mark the submission verified
      const reviewed = await supabase
        .from("payment_submissions")
        .update({
          status: "verified",
          reviewed_at: new Date().toISOString(),
          reviewed_by: reviewerId,
          payment_id: inserted.data.id,
        })
        .eq("id", submission.id);
      if (reviewed.error) {
        throw new Error(
          `The payment was recorded (PAY-${code}) but the submission could not be marked verified: ${reviewed.error.message}`,
        );
      }

      // 3. let the database schedule / activate the plan
      const activation = await supabase.rpc("try_activate_plan_from_payment_request", {
        p_service_request_id: submission.service_request_id,
      });
      if (activation.error) {
        throw new Error(
          `The payment was recorded (PAY-${code}) and verified, but the plan could not be scheduled: ${activation.error.message}`,
        );
      }

      setMessage({
        kind: "ok",
        text: `Verified ${formatPeso(claimed)} for ${client?.customer_name || "the customer"} as PAY-${code}. ${request?.requested_plan || "The plan"} is now scheduled.`,
      });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Verification failed." });
    } finally {
      setBusyId(null);
      void load(true);
    }
  }

  async function reject(submission: Submission) {
    if (busyId) return;
    setMessage(null);
    const client = submission.client_id ? clients.get(submission.client_id) : undefined;
    const ok = window.confirm(
      `Reject this payment from ${client?.customer_name || "the customer"}? Their plan request will be cancelled and they will need to submit again.`,
    );
    if (!ok) return;

    setBusyId(submission.id);
    try {
      const reviewed = await supabase
        .from("payment_submissions")
        .update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: reviewerId })
        .eq("id", submission.id);
      if (reviewed.error) throw new Error(reviewed.error.message);

      if (submission.service_request_id) {
        const cancelled = await supabase
          .from("service_requests")
          .update({ status: "Cancelled" })
          .eq("id", submission.service_request_id);
        if (cancelled.error) {
          throw new Error(`Submission rejected, but the plan request could not be cancelled: ${cancelled.error.message}`);
        }
      }
      setMessage({ kind: "ok", text: "Payment rejected and the plan request cancelled." });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Rejection failed." });
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
              payment and schedules the customer&apos;s plan.
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

                  <div className={styles.actions}>
                    <button className={styles.ghost} onClick={() => void viewProof(s)}>
                      {proofFor === s.id ? "Hide receipt" : "View receipt"}
                    </button>
                    {bucket === "pending" && (
                      <>
                        <button className={styles.reject} disabled={busy} onClick={() => void reject(s)}>
                          Reject
                        </button>
                        <button className={styles.verify} disabled={busy} onClick={() => void verify(s)}>
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
    </main>
  );
}
