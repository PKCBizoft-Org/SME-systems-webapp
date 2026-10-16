/* Enhanced Accounting Customer Account page — replace the existing customer page.tsx */
"use client";

import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabaseClient";
import { formatDate, formatPeso } from "@/lib/format";
import { INSTALL_FEE, planLabel } from "@/lib/plans";
import { BILL_TYPES_BY_HAND, billingDayText, nextBillDate, SCHEDULE_TEXT } from "@/lib/billingSchedule";
import { StaffHeader } from "../../components/StaffHeader";
import { StaffMotion } from "../../components/StaffMotion";
import { PkcLoader } from "../../components/PkcLoader";

type Client = {
  id: string;
  tenant_id: string | null;
  customer_name: string | null;
  install_date: string | null;
  plan_name: string | null;
  area: string | null;
  installation_status: string | null;
  account_status: string | null;
  account_id: string | null;
  mobile_number: string | null;
  pppoe_name: string | null;
  map_location: string | null;
  technicians: string | null;
  latitude: number | null;
  longitude: number | null;
  user_id: string | null;
  referral_code: string | null;
  billing_cycle: string | null;
  billing_day: number | null;
  due_day: number | null;
  disconnect_day: number | null;
  terminate_day: number | null;
  email: string | null;
  birth_date: string | null;
  gender: string | null;
  address: string | null;
};

type BillingRecord = {
  id: string;
  tenant_id: string | null;
  client_id: string | null;
  bill_id: string | null;
  status: string | null;
  bill_type: string | null;
  bill_date: string | null;
  due_date: string | null;
  amount_due: number | null;
  billing_cycle: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  grace_until?: string | null;
  disconnect_date: string | null;
  terminate_date: string | null;
  original_amount: number | null;
  discount_amount: number | null;
  final_amount: number | null;
  discount_reason: string | null;
  paid_at: string | null;
};

type PaymentRecord = {
  id: string;
  tenant_id: string | null;
  client_id: string | null;
  billing_id: string | null;
  payment_id: string | null;
  receipt_number: string | null;
  amount_paid: number | null;
  payment_date: string | null;
  payment_method: string | null;
};

type ReminderResult = { type: "success" | "error"; message: string };

// One material used on one of this customer's jobs, with what it cost.
type CostLine = {
  used_at: string;
  source: "truck" | "office";
  repair_id: string | null;
  job_type: string | null;
  job_note: string | null;
  item_name: string;
  unit: string | null;
  qty: number;
  unit_cost: number;
  line_cost: number;
};

const supabase = createClient();

const CLIENT_COLUMNS = `
  id, tenant_id, customer_name, install_date, plan_name, area,
  installation_status, account_status, account_id, mobile_number,
  pppoe_name, map_location, technicians, latitude, longitude,
  user_id, referral_code, billing_cycle, billing_day, due_day,
  disconnect_day, terminate_day, email, birth_date, gender, address
`;

const BILLING_COLUMNS = `
  id, tenant_id, client_id, bill_id, status, bill_type, bill_date,
  due_date, amount_due, billing_cycle, billing_period_start,
  billing_period_end, grace_until, disconnect_date, terminate_date, original_amount,
  discount_amount, final_amount, discount_reason, paid_at
`;

type ProofSubmission = {
  id: string;
  created_at: string;
  payment_method: string | null;
  reference_number: string | null;
  amount_claimed: number | null;
  status: string | null;
  proof_path: string | null;
  reject_reason: string | null;
};

const PAYMENT_COLUMNS = `
  id, tenant_id, client_id, billing_id, payment_id, receipt_number,
  amount_paid, payment_date, payment_method
`;


function getInitials(name: string | null) {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : `${parts[0][0]}${parts.at(-1)?.[0] || ""}`.toUpperCase();
}

// Today's date in the Philippines, whatever time zone this computer uses.
function phToday() {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
}

function amountOf(bill: BillingRecord) {
  return Number(
    bill.final_amount ?? bill.amount_due ?? bill.original_amount ?? 0,
  );
}

function billStatus(bill: BillingRecord, paid: number) {
  const balance = Math.max(amountOf(bill) - paid, 0);
  if (balance <= 0) return "Paid";
  if (paid > 0) return "Partial";
  if (bill.due_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(`${bill.due_date}T00:00:00`);
    if (!Number.isNaN(due.getTime()) && due < today) return "Overdue";
  }
  return "Unpaid";
}

// Colour for any status word: green = done, amber = in progress, red = problem.
function badgeClass(value: string) {
  const v = value.trim().toLowerCase();
  if (/^(paid|active|installed|completed|done|recorded)/.test(v)) return "good";
  if (/(overdue|suspend|cancel|terminat|disconnect|inactive)/.test(v)) return "danger";
  if (/(partial|due|for install|schedul|progress|assigned|pending|awaiting|open|not recorded)/.test(v)) return "warning";
  return "neutral";
}

function nextBillText(client: Client, bills: BillingRecord[]) {
  if (!client.plan_name?.trim()) return "No plan yet, so nothing to bill";
  if (!client.install_date) return "Not installed yet";
  const latest = bills
    .filter((bill) => (bill.bill_type || "Monthly") === "Monthly")
    .map((bill) => bill.billing_period_start)
    .filter((value): value is string => !!value)
    .sort()
    .at(-1);
  const next = nextBillDate(client.billing_day, client.install_date.slice(0, 10), latest ?? null, phToday());
  if (!next) return "—";
  return latest ? formatDate(next) : `${formatDate(next)} (first plan bill, after installation)`;
}

function jobLabel(type: string | null) {
  return type === "installation" ? "Installation" : "Repair";
}

function Detail({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string | number | null | undefined;
  wide?: boolean;
}) {
  return (
    <div className={`detail ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      <strong>
        {value === null || value === undefined || value === "" ? "—" : value}
      </strong>
    </div>
  );
}

export default function AccountingCustomerPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = Array.isArray(params.clientId)
    ? params.clientId[0]
    : params.clientId;

  const [client, setClient] = useState<Client | null>(null);
  const [billing, setBilling] = useState<BillingRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [technician, setTechnician] = useState<string | null>(null);
  const [fullAddress, setFullAddress] = useState<string | null>(null);
  const [proofs, setProofs] = useState<ProofSubmission[]>([]);
  const [proofOpen, setProofOpen] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [costs, setCosts] = useState<CostLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [staffRoles, setStaffRoles] = useState<string[]>([]);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<
    "overview" | "billing" | "payments"
  >("overview");
  const [billingSearch, setBillingSearch] = useState("");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderMessage, setReminderMessage] = useState("");
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderResult, setReminderResult] = useState<ReminderResult | null>(
    null,
  );

  // Recording a payment the customer made in person (cash, collector, office).
  const [recordFor, setRecordFor] = useState<{ bill: BillingRecord; balance: number } | null>(null);
  const [recAmount, setRecAmount] = useState("");
  const [recMethod, setRecMethod] = useState("Cash");
  const [recReference, setRecReference] = useState("");
  const [recDate, setRecDate] = useState("");
  const [recMax, setRecMax] = useState("");
  const [recNote, setRecNote] = useState("");
  const [recSecondary, setRecSecondary] = useState("");
  const [recNeedsSecondary, setRecNeedsSecondary] = useState(false);
  const [recBusy, setRecBusy] = useState(false);
  const [recError, setRecError] = useState("");
  const [recWaiting, setRecWaiting] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);

  // Adding an Installation Fee or Adjustment bill by hand (monthly bills are automatic).
  const [addOpen, setAddOpen] = useState(false);
  const [installFee, setInstallFee] = useState(INSTALL_FEE);
  const [addType, setAddType] = useState<string>(BILL_TYPES_BY_HAND[0]);
  const [addAmount, setAddAmount] = useState("");
  const [addDue, setAddDue] = useState("");
  const [addNote, setAddNote] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState("");

  const loadAccount = useCallback(
    async (showRefresh = false) => {
      if (!clientId) return;
      if (showRefresh) setRefreshing(true);
      else setLoading(true);
      setBillingError(null);
      setPaymentsError(null);

      try {
        const clientResult = await supabase
          .from("clients")
          .select(CLIENT_COLUMNS)
          .eq("id", clientId)
          .maybeSingle();
        if (clientResult.error) throw new Error(clientResult.error.message);
        if (!clientResult.data) {
          setClient(null);
          return;
        }
        setClient(clientResult.data as Client);

        // Who is on the job and what the repairs cost: extras, the page works without them.
        void supabase
          .from("payment_submissions")
          .select("id, created_at, payment_method, reference_number, amount_claimed, status, proof_path, reject_reason")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .then(({ data }) => setProofs((data || []) as ProofSubmission[]));
        void supabase.rpc("client_full_address", { p_client: clientId }).then(({ data }) => {
          setFullAddress(typeof data === "string" && data ? data : null);
        });
        void supabase.rpc("account_technician", { p_client: clientId }).then(({ data }) => {
          setTechnician(typeof data === "string" && data ? data : null);
        });
        void supabase.rpc("account_repair_costs", { p_client: clientId }).then(({ data }) => {
          setCosts(Array.isArray(data) ? (data as CostLine[]) : []);
        });

        const [billingResult, paymentsResultRaw] = await Promise.all([
          supabase
            .from("billing")
            .select(BILLING_COLUMNS)
            .eq("client_id", clientId)
            .order("bill_date", { ascending: false }),
          supabase
            .from("payments")
            .select(PAYMENT_COLUMNS)
            .eq("client_id", clientId)
            .order("payment_date", { ascending: false }),
        ]);

        if (billingResult.error) {
          setBilling([]);
          setBillingError(billingResult.error.message);
        } else setBilling((billingResult.data || []) as BillingRecord[]);

        let paymentsResult = paymentsResultRaw;
        if (
          paymentsResult.error?.message
            ?.toLowerCase()
            .includes("jwt issued at future")
        ) {
          const refreshed = await supabase.auth.refreshSession();
          if (!refreshed.error) {
            paymentsResult = await supabase
              .from("payments")
              .select(PAYMENT_COLUMNS)
              .eq("client_id", clientId)
              .order("payment_date", { ascending: false });
          }
        }

        if (paymentsResult.error) {
          setPayments([]);
          setPaymentsError(paymentsResult.error.message);
        } else setPayments((paymentsResult.data || []) as PaymentRecord[]);
      } catch (error) {
        console.error("Accounting customer load error:", error);
        setBillingError(
          error instanceof Error
            ? error.message
            : "Unable to load this account.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [clientId],
  );

  useEffect(() => {
    // The fee is a setting Accounting can change; INSTALL_FEE is only the fallback.
    void supabase.rpc("get_install_fee").then(({ data }) => {
      if (typeof data === "number" || typeof data === "string") setInstallFee(Number(data));
    });
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
      if (membershipError) {
        router.replace("/clients");
        return;
      }

      const roles = (memberships || []).map((item) => item.role);
      if (!roles.includes("admin") && !roles.includes("accounting")) {
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
    if (authorized) void loadAccount();
  }, [authorized, loadAccount]);

  useEffect(() => {
    if (!reminderOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !sendingReminder) setReminderOpen(false);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [reminderOpen, sendingReminder]);

  const paymentMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const payment of payments) {
      if (!payment.billing_id) continue;
      map.set(
        payment.billing_id,
        (map.get(payment.billing_id) || 0) + Number(payment.amount_paid || 0),
      );
    }
    return map;
  }, [payments]);

  const financials = useMemo(() => {
    let billed = 0,
      paid = 0,
      overdue = 0,
      open = 0;
    for (const bill of billing) {
      const amount = amountOf(bill);
      const paidAmount = paymentMap.get(bill.id) || 0;
      const balance = Math.max(amount - paidAmount, 0);
      billed += amount;
      paid += paidAmount;
      if (balance > 0) open++;
      if (billStatus(bill, paidAmount) === "Overdue") overdue += balance;
    }
    return {
      billed,
      paid,
      overdue,
      open,
      outstanding: Math.max(billed - paid, 0),
      progress: billed ? Math.min(Math.round((paid / billed) * 100), 100) : 0,
    };
  }, [billing, paymentMap]);

  const openBills = useMemo(
    () =>
      billing.filter((bill) => (paymentMap.get(bill.id) || 0) < amountOf(bill)),
    [billing, paymentMap],
  );

  const filteredBills = useMemo(() => {
    const q = billingSearch.trim().toLowerCase();
    if (!q) return billing;
    return billing.filter((bill) =>
      [
        bill.bill_id,
        bill.bill_type,
        bill.status,
        bill.billing_cycle,
        bill.billing_period_start,
        bill.billing_period_end,
        bill.due_date,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [billing, billingSearch]);

  const filteredPayments = useMemo(() => {
    const q = paymentSearch.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter((payment) =>
      [
        payment.receipt_number,
        payment.payment_id,
        payment.payment_method,
        payment.billing_id,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [payments, paymentSearch]);

  async function openRecord(bill: BillingRecord, balance: number) {
    setRecError("");
    setRecNeedsSecondary(false);
    setRecSecondary("");
    setRecAmount(balance.toFixed(2));
    setRecMethod("Cash");
    setRecReference("");
    setRecNote("");
    setRecDate(phToday());
    setRecMax(phToday());
    setRecWaiting(0);
    setFlash(null);
    setRecordFor({ bill, balance });

    // A payment the customer already sent for this bill must be verified instead.
    const { data } = await supabase
      .from("payment_submissions")
      .select("amount_claimed")
      .eq("billing_id", bill.id)
      .eq("status", "Pending");
    setRecWaiting((data || []).reduce((sum, row) => sum + Number(row.amount_claimed || 0), 0));
  }

  async function submitRecord() {
    if (!recordFor || recBusy) return;
    const amount = Number(recAmount.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) return setRecError("Enter the amount received.");
    if (amount > recordFor.balance + 0.0001) {
      return setRecError(`Only ${formatPeso(recordFor.balance)} is left on this bill.`);
    }
    if (recMethod !== "Cash" && !recReference.trim()) return setRecError("Enter the transaction reference number.");

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return setRecError("Your session has expired. Please sign in again.");

    setRecBusy(true);
    setRecError("");
    try {
      const response = await fetch("/api/accounting/record-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          billingId: recordFor.bill.id,
          amount,
          method: recMethod,
          reference: recReference.trim(),
          paidOn: recDate,
          note: recNote.trim(),
          secondary: recSecondary || undefined,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (response.status === 428 || result?.code === "secondary_wrong") {
        setRecNeedsSecondary(true);
        setRecError(result?.code === "secondary_wrong" ? result.error : "");
        return;
      }
      if (!response.ok) throw new Error(result?.error || "The payment could not be recorded.");

      const left = Number(result?.result?.remaining ?? 0);
      setRecordFor(null);
      setFlash(
        `Recorded ${formatPeso(amount)} (${result?.result?.receipt_number || "receipt issued"}) on bill ${result?.result?.bill_id || ""}. ` +
          (left > 0 ? `${formatPeso(left)} is still due.` : "The bill is now fully paid.") +
          (result?.emailed ? " The customer was emailed." : ""),
      );
      void loadAccount(true);
    } catch (error) {
      setRecError(error instanceof Error ? error.message : "The payment could not be recorded.");
    } finally {
      setRecBusy(false);
    }
  }

  function openAddBill() {
    setAddType(BILL_TYPES_BY_HAND[0]);
    setAddAmount(installFee.toFixed(2));
    setAddDue("");
    setAddNote("");
    setAddError("");
    setFlash(null);
    setAddOpen(true);
  }

  function chooseAddType(type: string) {
    setAddType(type);
    setAddAmount(type === "Installation Fee" ? installFee.toFixed(2) : "");
  }

  async function submitAddBill() {
    if (!client || addBusy) return;
    const amount = Number(addAmount.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) return setAddError("Enter the amount.");
    if (addType === "Adjustment" && !addNote.trim()) return setAddError("Say what the adjustment is for.");

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return setAddError("Your session has expired. Please sign in again.");

    setAddBusy(true);
    setAddError("");
    try {
      const response = await fetch("/api/accounting/add-bill", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          clientId: client.id,
          billType: addType,
          amount,
          dueDate: addDue || undefined,
          note: addNote.trim(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "The bill could not be added.");

      setAddOpen(false);
      setFlash(
        `Added ${addType} bill ${result?.result?.bill_id || ""} for ${formatPeso(amount)}, due ${formatDate(result?.result?.due_date)}. The customer was told.`,
      );
      void loadAccount(true);
    } catch (error) {
      setAddError(error instanceof Error ? error.message : "The bill could not be added.");
    } finally {
      setAddBusy(false);
    }
  }

  async function toggleProof(submission: ProofSubmission) {
    if (proofOpen === submission.id) {
      setProofOpen(null);
      return;
    }
    setProofOpen(submission.id);
    setProofUrl(null);
    setProofError(null);
    if (!submission.proof_path) {
      setProofError("The customer did not attach a receipt.");
      return;
    }
    const { data, error } = await supabase.storage.from("payment-proofs").createSignedUrl(submission.proof_path, 300);
    if (error || !data?.signedUrl) {
      setProofError(error?.message || "Unable to open the receipt image.");
      return;
    }
    setProofUrl(data.signedUrl);
  }

  function openReminder() {
    if (!client) return;
    setReminderResult(null);
    setReminderMessage(
      `Hello ${client.customer_name || "Customer"}, your balance is ${formatPeso(financials.outstanding)}. Please pay in the app at your earliest convenience. Thank you.`,
    );
    setReminderOpen(true);
  }

  async function sendReminder() {
    if (!client) return;
    if (!reminderMessage.trim()) {
      setReminderResult({
        type: "error",
        message: "Please enter a reminder message.",
      });
      return;
    }

    setSendingReminder(true);
    setReminderResult(null);
    try {
      const { error } = await supabase.rpc("remind_customer", {
        p_client: client.id,
        p_message: reminderMessage.trim(),
      });
      if (error) throw new Error(error.message);

      setReminderResult({
        type: "success",
        message: "Reminder sent. The customer will see it in their app.",
      });
    } catch (error) {
      setReminderResult({
        type: "error",
        message:
          error instanceof Error ? error.message : "The reminder could not be sent.",
      });
    } finally {
      setSendingReminder(false);
    }
  }

  if (checkingAccess)
    return <PkcLoader label="Checking accounting access" steps={["Verifying your role", "Opening customer account"]} />;
  if (!authorized) return null;

  if (loading && !client) {
    return (
      <main className="state">
        <div className="loader" />
        <span role="status">Loading customer account…</span>
        <style jsx>{styles}</style>
      </main>
    );
  }

  if (!client) {
    return (
      <main className="state">
        <div className="not-found">
          <span>!</span>
          <small>ACCOUNTING</small>
          <h1>Customer not found</h1>
          <p>This customer account could not be loaded.</p>
          <button
            className="primary"
            onClick={() => router.push("/accounting")}
          >
            ← Back to Accounting
          </button>
        </div>
        <style jsx>{styles}</style>
      </main>
    );
  }

  return (
    <main className="page">
      <StaffHeader current="accounting" roles={staffRoles} />
      <StaffMotion targets={[".panel", ".hero", ".stats article"]} lift={[".stats article"]} />

      <div className="shell">
        <div className="crumb">
          <i /> PKC BIZOFT / ACCOUNTING / CUSTOMER
        </div>

        <section className="customer-head">
          <div className="identity">
            <span className="avatar">{getInitials(client.customer_name)}</span>
            <div>
              <small>CUSTOMER ACCOUNT</small>
              <h1>{client.customer_name || "Unnamed customer"}</h1>
              <p>
                {client.account_id || "No account ID"} ·{" "}
                {client.area || "No purok"} · {planLabel(client.plan_name) || "No plan"}
              </p>
            </div>
          </div>
          <div className="head-actions">
            <span
              className={`badge ${badgeClass(client.account_status || "Unknown")}`}
            >
              {client.account_status || "Unknown"}
            </span>
            <button className="secondary" onClick={openReminder}>
              ↗ Remind customer
            </button>
            <button
              className="refresh"
              onClick={() => void loadAccount(true)}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </section>

        {(billingError || paymentsError) && (
          <div className="notice" role="alert">
            <b>!</b>
            <div>
              <strong>Some records could not be loaded.</strong>
              <span>{billingError || paymentsError}</span>
            </div>
          </div>
        )}

        {flash && (
          <div className="flash" role="status">
            {flash}
          </div>
        )}

        <section className="financials">
          <article>
            <small>TOTAL BILLED</small>
            <strong>{formatPeso(financials.billed)}</strong>
            <span>{billing.length} bills</span>
          </article>
          <article className="green">
            <small>TOTAL PAID</small>
            <strong>{formatPeso(financials.paid)}</strong>
            <span>{payments.length} payments</span>
          </article>
          <article className="orange">
            <small>OUTSTANDING</small>
            <strong>{formatPeso(financials.outstanding)}</strong>
            <span>{financials.open} open bills</span>
          </article>
          <article className="red">
            <small>OVERDUE</small>
            <strong>{formatPeso(financials.overdue)}</strong>
            <span>Collection attention</span>
          </article>
        </section>

        <nav className="tabs">
          <button
            className={activeSection === "overview" ? "active" : ""}
            onClick={() => setActiveSection("overview")}
          >
            Overview
          </button>
          <button
            className={activeSection === "billing" ? "active" : ""}
            onClick={() => setActiveSection("billing")}
          >
            Billing <span>{billing.length}</span>
          </button>
          <button
            className={activeSection === "payments" ? "active" : ""}
            onClick={() => setActiveSection("payments")}
          >
            Payments <span>{payments.length}</span>
          </button>
        </nav>

        {activeSection === "overview" && (
          <section className="overview-grid">
            <div className="main-col">
              <section className="panel">
                <header className="panel-head">
                  <div>
                    <small>COSTS</small>
                    <h2>Repair costs</h2>
                    <p>Materials used on this customer&apos;s jobs, at the inventory unit cost.</p>
                  </div>
                  <strong className="progress-value">
                    {formatPeso(costs.reduce((sum, line) => sum + Number(line.line_cost || 0), 0))}
                  </strong>
                </header>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Job</th>
                        <th>Material</th>
                        <th>Qty</th>
                        <th className="right">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costs.map((line, index) => (
                        <tr key={`${line.used_at}-${index}`}>
                          <td>{formatDate(line.used_at)}</td>
                          <td>
                            <strong>{jobLabel(line.job_type)}</strong>
                            {line.job_note ? <small>{line.job_note}</small> : null}
                          </td>
                          <td>{line.item_name}</td>
                          <td>
                            {Number(line.qty)} {line.unit || ""} × {formatPeso(Number(line.unit_cost))}
                          </td>
                          <td className="right balance">{formatPeso(Number(line.line_cost))}</td>
                        </tr>
                      ))}
                      {costs.length === 0 && (
                        <tr>
                          <td colSpan={5} className="empty">
                            No materials have been used on this customer&apos;s jobs yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="panel">
                <header className="panel-head">
                  <div>
                    <small>COLLECTION</small>
                    <h2>Payment progress</h2>
                    <p>Overall collection against recorded bills.</p>
                  </div>
                  <strong className="progress-value">
                    {financials.progress}%
                  </strong>
                </header>
                <div className="progress-track">
                  <i style={{ width: `${financials.progress}%` }} />
                </div>
                <div className="progress-meta">
                  <span>
                    Paid <b>{formatPeso(financials.paid)}</b>
                  </span>
                  <span>
                    Billed <b>{formatPeso(financials.billed)}</b>
                  </span>
                </div>
              </section>

              <section className="panel">
                <header className="panel-head">
                  <div>
                    <small>COLLECTION</small>
                    <h2>Open bills</h2>
                    <p>Invoices that still have a remaining balance.</p>
                  </div>
                  <span className="count">{openBills.length}</span>
                  <button className="row-action" onClick={openAddBill}>
                    Add bill
                  </button>
                </header>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Bill</th>
                        <th>Due</th>
                        <th>Amount</th>
                        <th>Balance</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {openBills.slice(0, 8).map((bill) => {
                        const amount = amountOf(bill),
                          paid = paymentMap.get(bill.id) || 0,
                          balance = Math.max(amount - paid, 0),
                          status = billStatus(bill, paid);
                        return (
                          <tr key={bill.id}>
                            <td>
                              <strong>
                                {bill.bill_id || bill.id.slice(0, 8)}
                              </strong>
                              <small>{bill.bill_type || "Bill"}</small>
                            </td>
                            <td>{formatDate(bill.due_date)}</td>
                            <td>{formatPeso(amount)}</td>
                            <td className="balance">{formatPeso(balance)}</td>
                            <td>
                              <span className={`badge ${badgeClass(status)}`}>
                                {status}
                              </span>
                            </td>
                            <td className="right">
                              <button className="row-action" onClick={() => void openRecord(bill, balance)}>
                                Record payment
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {openBills.length === 0 && (
                        <tr>
                          <td colSpan={6} className="empty">
                            No outstanding bills.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {openBills.length > 8 && (
                  <button
                    className="table-more"
                    onClick={() => setActiveSection("billing")}
                  >
                    View all {openBills.length} open bills →
                  </button>
                )}
              </section>
            </div>

            <aside className="side-col">
              <section className="panel">
                <header className="panel-head simple">
                  <div>
                    <small>BILLING SCHEDULE</small>
                    <h2>Account cycle</h2>
                  </div>
                </header>
                <div className="details-grid">
                  {client.plan_name?.trim() && client.install_date ? (
                    <>
                      <Detail label="Cycle" value={client.billing_cycle || "Monthly"} />
                      <Detail label="Billed on" value={billingDayText(client.billing_day)} />
                      <Detail label="Due" value={SCHEDULE_TEXT.due} />
                      <Detail label="Grace period" value={SCHEDULE_TEXT.grace} />
                      <Detail label="Disconnect" value={SCHEDULE_TEXT.disconnect} />
                      <Detail label="Terminate" value={SCHEDULE_TEXT.terminate} />
                      <Detail label="Next bill" value={nextBillText(client, billing)} wide />
                    </>
                  ) : (
                    <Detail
                      label="Not started"
                      value="The billing cycle starts once the plan is approved and the installation is done."
                      wide
                    />
                  )}
                </div>
              </section>

              <section className="panel">
                <header className="panel-head simple">
                  <div>
                    <small>CUSTOMER</small>
                    <h2>Account details</h2>
                    <p>View only. Admin and technicians keep these up to date.</p>
                  </div>
                </header>
                <div className="details-grid">
                  <Detail label="Account ID" value={client.account_id} />
                  <Detail label="Mobile" value={client.mobile_number} />
                  <Detail label="Email" value={client.email} />
                  <Detail label="Plan" value={planLabel(client.plan_name) || "No plan yet"} />
                  <Detail label="Purok" value={client.area} />
                  <Detail
                    label="Installation"
                    value={formatDate(client.install_date)}
                  />
                  <Detail label="Technician" value={technician || client.technicians} />
                  <Detail label="Referral code" value={client.referral_code} />
                  <Detail label="Address" value={fullAddress || client.address} wide />
                </div>
              </section>
            </aside>
          </section>
        )}

        {activeSection === "billing" && (
          <section className="panel full">
            <header className="panel-head">
              <div>
                <small>BILLING HISTORY</small>
                <h2>Customer bills</h2>
                <p>Complete billing records associated with this customer.</p>
              </div>
              <span className="count">
                {filteredBills.length} / {billing.length}
              </span>
            </header>
            <div className="table-tools">
              <label>
                ⌕{" "}
                <input
                  value={billingSearch}
                  onChange={(e) => setBillingSearch(e.target.value)}
                  placeholder="Search bill ID, type, status…"
                />
              </label>
            </div>
            <div className="table-wrap">
              <table className="wide-table">
                <thead>
                  <tr>
                    <th>Bill ID</th>
                    <th>Type</th>
                    <th>Bill date</th>
                    <th>Due date</th>
                    <th>Grace until</th>
                    <th>Disconnect</th>
                    <th>Terminate</th>
                    <th>Billing period</th>
                    <th className="right">Amount</th>
                    <th className="right">Balance</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredBills.map((bill) => {
                    const amount = amountOf(bill),
                      paid = paymentMap.get(bill.id) || 0,
                      balance = Math.max(amount - paid, 0),
                      status = billStatus(bill, paid);
                    return (
                      <tr key={bill.id}>
                        <td>
                          <strong>{bill.bill_id || bill.id.slice(0, 8)}</strong>
                        </td>
                        <td>{bill.bill_type || "—"}</td>
                        <td>{formatDate(bill.bill_date)}</td>
                        <td>{formatDate(bill.due_date)}</td>
                        <td>{formatDate(bill.grace_until)}</td>
                        <td>{formatDate(bill.disconnect_date)}</td>
                        <td>{formatDate(bill.terminate_date)}</td>
                        <td>
                          {bill.billing_period_start && bill.billing_period_end
                            ? `${formatDate(bill.billing_period_start)} – ${formatDate(bill.billing_period_end)}`
                            : "—"}
                        </td>
                        <td className="right">{formatPeso(amount)}</td>
                        <td className="right balance">{formatPeso(balance)}</td>
                        <td>
                          <span className={`badge ${badgeClass(status)}`}>
                            {status}
                          </span>
                        </td>
                        <td className="right">
                          {balance > 0 && (
                            <button className="row-action" onClick={() => void openRecord(bill, balance)}>
                              Record payment
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredBills.length === 0 && (
                    <tr>
                      <td colSpan={12} className="empty">
                        No billing records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeSection === "payments" && (
          <section className="panel full">
            <header className="panel-head">
              <div>
                <small>PAYMENT HISTORY</small>
                <h2>Customer payments</h2>
                <p>Recorded payments and receipt history for this customer.</p>
              </div>
              <span className="count">
                {filteredPayments.length} / {payments.length}
              </span>
            </header>
            <div className="table-tools">
              <label>
                ⌕{" "}
                <input
                  value={paymentSearch}
                  onChange={(e) => setPaymentSearch(e.target.value)}
                  placeholder="Search receipt, payment ID, method…"
                />
              </label>
            </div>
            <div className="table-wrap">
              <table className="wide-table">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Payment ID</th>
                    <th>Date</th>
                    <th>Method</th>
                    <th>Billing ID</th>
                    <th className="right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        <strong>{payment.receipt_number || "—"}</strong>
                      </td>
                      <td>{payment.payment_id || "—"}</td>
                      <td>{formatDate(payment.payment_date)}</td>
                      <td>
                        <span className="method">
                          {payment.payment_method || "—"}
                        </span>
                      </td>
                      <td>
                        {payment.billing_id
                          ? payment.billing_id.slice(0, 8)
                          : "—"}
                      </td>
                      <td className="right payment-amount">
                        {formatPeso(Number(payment.amount_paid || 0))}
                      </td>
                    </tr>
                  ))}
                  {filteredPayments.length === 0 && (
                    <tr>
                      <td colSpan={6} className="empty">
                        No payment records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeSection === "payments" && (
          <section className="panel full">
            <header className="panel-head">
              <div>
                <small>PROOF OF PAYMENT</small>
                <h2>Receipts sent by the customer</h2>
                <p>Every receipt this customer uploaded in the app, newest first.</p>
              </div>
              <span className="count">{proofs.length}</span>
            </header>
            <div className="table-wrap">
              <table className="wide-table">
                <thead>
                  <tr>
                    <th>Sent</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th>Status</th>
                    <th className="right">Amount</th>
                    <th className="right">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {proofs.map((proof) => (
                    <Fragment key={proof.id}>
                      <tr>
                        <td>{formatDate(proof.created_at)}</td>
                        <td>
                          <span className="method">{proof.payment_method || "—"}</span>
                        </td>
                        <td>{proof.reference_number || "—"}</td>
                        <td>
                          <span className={`badge ${badgeClass(proof.status || "Pending")}`}>
                            {proof.status || "Pending"}
                          </span>
                          {proof.reject_reason ? <small>{proof.reject_reason}</small> : null}
                        </td>
                        <td className="right payment-amount">{formatPeso(Number(proof.amount_claimed || 0))}</td>
                        <td className="right">
                          <button className="secondary" onClick={() => void toggleProof(proof)}>
                            {proofOpen === proof.id ? "Hide receipt" : "View receipt"}
                          </button>
                        </td>
                      </tr>
                      {proofOpen === proof.id && (
                        <tr>
                          <td colSpan={6}>
                            {proofError ? (
                              <p>{proofError}</p>
                            ) : proofUrl ? (
                              <a href={proofUrl} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={proofUrl}
                                  alt="Customer payment receipt"
                                  style={{ maxWidth: "min(420px, 100%)", borderRadius: 10, border: "1px solid #172832" }}
                                />
                              </a>
                            ) : (
                              <p>Opening the receipt…</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                  {proofs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="empty">
                        The customer has not sent any receipts.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {reminderOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={() => !sendingReminder && setReminderOpen(false)}
        >
          <section className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <header>
              <div>
                <small>COLLECTION</small>
                <h2>Remind customer in the app</h2>
              </div>
              <button
                onClick={() => setReminderOpen(false)}
                disabled={sendingReminder}
              >
                ×
              </button>
            </header>
            <div className="recipient">
              <span className="avatar">
                {getInitials(client.customer_name)}
              </span>
              <div>
                <strong>{client.customer_name || "Customer"}</strong>
                <small>
                  {client.user_id ? "Gets it as a notification in the PKC BIZOFT app" : "Has not signed in to the app yet"}
                </small>
              </div>
            </div>
            <div className="reminder-balance">
              <small>Current outstanding</small>
              <strong>{formatPeso(financials.outstanding)}</strong>
              <span>{formatPeso(financials.overdue)} overdue</span>
            </div>
            <label className="field">
              <span>Message</span>
              <textarea
                value={reminderMessage}
                onChange={(e) => setReminderMessage(e.target.value)}
                rows={6}
                maxLength={300}
                disabled={sendingReminder}
              />
              <small>{reminderMessage.length}/300 · one reminder per customer per hour</small>
            </label>
            {reminderResult && (
              <div className={`result ${reminderResult.type}`}>
                {reminderResult.message}
              </div>
            )}
            <footer>
              <button
                className="secondary"
                onClick={() => setReminderOpen(false)}
                disabled={sendingReminder}
              >
                Cancel
              </button>
              <button
                className="primary"
                onClick={() => void sendReminder()}
                disabled={sendingReminder || !client.user_id}
              >
                {sendingReminder ? "Sending…" : "Send reminder"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {addOpen && (
        <div className="modal-backdrop" onMouseDown={() => !addBusy && setAddOpen(false)}>
          <section className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <header>
              <div>
                <small>BILLING</small>
                <h2>Add a bill</h2>
              </div>
              <button onClick={() => setAddOpen(false)} disabled={addBusy}>
                ×
              </button>
            </header>

            <div className="recipient">
              <span className="avatar">{getInitials(client.customer_name)}</span>
              <div>
                <strong>{client.customer_name || "Customer"}</strong>
                <small>Monthly bills are created automatically. The bill number is assigned for you.</small>
              </div>
            </div>

            <div className="form-grid">
              <label className="field">
                <span>BILL TYPE</span>
                <select value={addType} onChange={(e) => chooseAddType(e.target.value)} disabled={addBusy}>
                  {BILL_TYPES_BY_HAND.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>AMOUNT (₱)</span>
                <input value={addAmount} onChange={(e) => setAddAmount(e.target.value)} inputMode="decimal" disabled={addBusy} />
              </label>
              <label className="field">
                <span>DUE DATE (OPTIONAL)</span>
                <input type="date" value={addDue} min={phToday()} onChange={(e) => setAddDue(e.target.value)} disabled={addBusy} />
              </label>
            </div>
            <p style={{ margin: "4px 0 0", opacity: 0.7, fontSize: 13 }}>
              Left blank, it is due at the end of the month, and never less than 7 days from today. Grace period,
              disconnection and termination follow the same days as a monthly bill.
            </p>

            <label className="field">
              <span>{addType === "Adjustment" ? "WHAT IS THIS FOR? (REQUIRED)" : "NOTE (OPTIONAL, KEPT IN THE AUDIT LOG)"}</span>
              <textarea
                value={addNote}
                onChange={(e) => setAddNote(e.target.value)}
                rows={2}
                maxLength={300}
                disabled={addBusy}
                style={{ minHeight: 60 }}
              />
            </label>

            {addError && <div className="result error">{addError}</div>}

            <footer>
              <button className="secondary" onClick={() => setAddOpen(false)} disabled={addBusy}>
                Cancel
              </button>
              <button className="primary" onClick={() => void submitAddBill()} disabled={addBusy}>
                {addBusy ? "Adding…" : "Add bill"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {recordFor && (
        <div className="modal-backdrop" onMouseDown={() => !recBusy && setRecordFor(null)}>
          <section className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <header>
              <div>
                <small>COLLECTION</small>
                <h2>Record a payment</h2>
              </div>
              <button onClick={() => setRecordFor(null)} disabled={recBusy}>
                ×
              </button>
            </header>

            <div className="recipient">
              <span className="avatar">{getInitials(client.customer_name)}</span>
              <div>
                <strong>{client.customer_name || "Customer"}</strong>
                <small>
                  Bill {recordFor.bill.bill_id || recordFor.bill.id.slice(0, 8)} · {formatPeso(recordFor.balance)} still due
                </small>
              </div>
            </div>

            {recWaiting > 0 && (
              <div className="result error">
                The customer already sent {formatPeso(recWaiting)} for this bill. Verify or reject it under Payment
                verification instead of recording it twice.
              </div>
            )}

            <div className="form-grid">
              <label className="field">
                <span>AMOUNT RECEIVED (₱)</span>
                <input
                  value={recAmount}
                  onChange={(e) => setRecAmount(e.target.value)}
                  inputMode="decimal"
                  disabled={recBusy}
                />
              </label>
              <label className="field">
                <span>HOW THEY PAID</span>
                <select value={recMethod} onChange={(e) => setRecMethod(e.target.value)} disabled={recBusy}>
                  <option>Cash</option>
                  <option>GCash</option>
                  <option>Bank Transfer</option>
                </select>
              </label>
              <label className="field">
                <span>{recMethod === "Cash" ? "RECEIPT / OR NUMBER (OPTIONAL)" : "TRANSACTION REFERENCE"}</span>
                <input
                  value={recReference}
                  onChange={(e) => setRecReference(e.target.value)}
                  disabled={recBusy}
                  maxLength={80}
                />
              </label>
              <label className="field">
                <span>DATE RECEIVED</span>
                <input
                  type="date"
                  value={recDate}
                  max={recMax}
                  onChange={(e) => setRecDate(e.target.value)}
                  disabled={recBusy}
                />
              </label>
            </div>

            <label className="field">
              <span>NOTE (OPTIONAL, KEPT IN THE AUDIT LOG)</span>
              <textarea
                value={recNote}
                onChange={(e) => setRecNote(e.target.value)}
                rows={2}
                maxLength={300}
                disabled={recBusy}
                style={{ minHeight: 60 }}
              />
            </label>

            {recNeedsSecondary && (
              <label className="field">
                <span>SECONDARY PASSWORD (REQUIRED FOR LARGE AMOUNTS)</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={recSecondary}
                  onChange={(e) => setRecSecondary(e.target.value)}
                  disabled={recBusy}
                  autoFocus
                />
              </label>
            )}

            {recError && <div className="result error">{recError}</div>}

            <footer>
              <button className="secondary" onClick={() => setRecordFor(null)} disabled={recBusy}>
                Cancel
              </button>
              <button
                className="primary"
                onClick={() => void submitRecord()}
                disabled={recBusy || recWaiting > 0 || (recNeedsSecondary && !recSecondary)}
              >
                {recBusy ? "Recording…" : "Record payment"}
              </button>
            </footer>
          </section>
        </div>
      )}

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
*{box-sizing:border-box}.page{min-height:100vh;background:#05090d;color:#e7f0f6;font-family:var(--font-geist-sans),ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.topbar{height:70px;padding:0 34px;border-bottom:1px solid #16242d;background:#071016;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:30}.brand,.top-actions,.identity,.head-actions,.secure{display:flex;align-items:center}.brand{gap:11px}.brand-mark{width:36px;height:36px;display:grid;place-items:center;border:1px solid #16486a;border-radius:9px;background:#092237;color:#5ebeff;font-weight:900}.brand strong{color:#fff;font-size:14px}.brand span{color: #677c8c;font-size:14px;font-weight:700}.top-actions{gap:13px}.top-actions>button{border:0;background:none;color:#70baf0;font-size:13px;font-weight:900;cursor:pointer}.secure{gap:8px;color:#718894;font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.secure i{width:7px;height:7px;border-radius:50%;background:#35d38f;box-shadow:0 0 12px #35d38f}.shell{width:min(1500px,calc(100% - 48px));margin:auto;padding:30px 0 50px}.crumb{color:#4b87ad;font-size:12px;font-weight:900;letter-spacing:.13em}.crumb i{display:inline-block;width:6px;height:6px;margin-right:7px;border-radius:50%;background:#1a9cff}.customer-head{margin-top:12px;padding:20px;border:1px solid #172832;border-radius:14px;background:#080f14;display:flex;justify-content:space-between;gap:20px}.identity{gap:12px;min-width:0}.identity>div{min-width:0}.identity small,.panel-head small,.modal small{color:#4287b2;font-size:12px;font-weight:900;letter-spacing:.13em}.identity h1{margin:5px 0 4px;font-size:25px;letter-spacing:-.04em}.identity p{margin:0;color: #6d8491;font-size:13px}.avatar{width:44px;height:44px;display:grid;place-items:center;flex:0 0 auto;border:1px solid #165074;border-radius:10px;background:#092237;color:#63beff;font-size:13px;font-weight:900}.head-actions{gap:8px;flex-wrap:wrap;justify-content:flex-end}.badge{display:inline-flex;align-items:center;padding:5px 8px;border:1px solid #263843;border-radius:999px;background:#0c151b;color:#7d919d;font-size:12px;font-weight:900;white-space:nowrap}.badge.good{border-color:#1a6048;background:#092219;color:#51d99b}.badge.danger{border-color:#6a2830;background:#220d10;color:#ff7b83}.badge.warning{border-color:#6a501e;background:#201707;color:#eabd58}.badge.neutral{color:#8296a2}.secondary,.primary,.refresh{min-height:40px;padding:0 13px;border-radius:8px;font-size:12px;font-weight:900;cursor:pointer}.secondary{border:1px solid #263843;background:#0a1318;color:#91a5b2}.primary{border:1px solid #0e72ad;background:#092237;color:#5ebeff}.refresh{border:1px solid #16486a;background:#092033;color:#6bc0ff}.refresh:disabled,.primary:disabled,.secondary:disabled{opacity:.5;cursor:not-allowed}.notice{display:flex;gap:12px;margin-top:12px;padding:12px;border:1px solid #4a3515;border-radius:10px;background:#171107;color:#c2a15a}.notice>b{width:23px;height:23px;display:grid;place-items:center;border-radius:7px;background:#2b1d08}.notice div{display:grid;gap:3px}.notice strong{font-size:13px}.notice span{font-size:12px;color: #957f53}.financials{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:12px}.financials article{min-height:100px;padding:17px;border:1px solid #172832;border-radius:12px;background:#080f14}.financials small{display:block;color: #6d8490;font-size:12px;font-weight:900;letter-spacing:.1em}.financials strong{display:block;margin:7px 0 4px;font-size:19px;letter-spacing:-.03em}.financials span{color: #71848e;font-size:12px}.financials .green strong{color:#4bd99a}.financials .orange strong{color:#efbf59}.financials .red strong{color:#ff777e}.tabs{display:flex;gap:2px;margin-top:16px;border-bottom:1px solid #172832}.tabs button{padding:11px 15px;border:0;border-bottom:2px solid transparent;background:transparent;color: #6f8491;font-size:13px;font-weight:900;cursor:pointer}.tabs button span{display:inline-grid;place-items:center;min-width:20px;height:19px;margin-left:5px;padding:0 5px;border-radius:6px;background:#0d1a21;color:#77909d;font-size:12px}.tabs button.active{border-bottom-color:#1598ff;color:#66bfff}.overview-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(320px,.9fr);gap:12px;margin-top:12px}.main-col,.side-col{display:grid;gap:12px;align-content:start}.panel{border:1px solid #172832;border-radius:13px;background:#080f14;overflow:hidden}.panel-head{min-height:72px;padding:17px 18px;border-bottom:1px solid #14232c;display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.panel-head.simple{min-height:auto}.panel-head h2{margin:5px 0 3px;font-size:17px}.panel-head p{margin:0;color: #6f8490;font-size:12px}.progress-value{color:#5ebeff;font-size:22px}.progress-track{height:9px;margin:16px 18px 9px;border-radius:99px;background:#142631;overflow:hidden}.progress-track i{display:block;height:100%;border-radius:99px;background:#1598ff}.progress-meta{display:flex;justify-content:space-between;padding:0 18px 16px;color: #6e8490;font-size:12px}.progress-meta b{color:#b9cbd4}.count{display:inline-grid;place-items:center;min-width:28px;height:26px;padding:0 7px;border-radius:7px;background:#0b1922;color:#63bcf7;font-size:12px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:700px}th{padding:11px 14px;text-align:left;color: #6f8490;font-size:12px;letter-spacing:.11em;border-bottom:1px solid #172832;background:#071016;white-space:nowrap}td{padding:12px 14px;border-bottom:1px solid #102029;color:#9bb0bd;font-size:12px;vertical-align:middle}tbody tr{background:#080f14}tbody tr:hover{background:#0a171f}td strong{color:#d2e1e8;font-size:13px}td small{display:block;margin-top:3px;color: #73858f;font-size:12px}.balance{color:#f0c45e!important;font-weight:900}.right{text-align:right}.empty{text-align:center!important;height:130px;color: #677c87!important}.table-more{width:100%;padding:12px;border:0;border-top:1px solid #14232c;background:#071016;color:#59b7f3;font-size:12px;font-weight:900;cursor:pointer}.details-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:14px}.detail{padding:9px;border:1px solid #162a34;border-radius:8px;background:#09141a;min-width:0}.detail.wide{grid-column:1/-1}.detail span{display:block;color: #70848f;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.detail strong{display:block;margin-top:4px;color:#bdd0da;font-size:12px;overflow-wrap:anywhere}.full{margin-top:12px}.table-tools{padding:11px 13px;border-bottom:1px solid #14232c}.table-tools label{display:flex;align-items:center;gap:8px;width:min(360px,100%);height:37px;padding:0 10px;border:1px solid #1c303b;border-radius:8px;background:#060c10;color: #627c8a}.table-tools input{width:100%;border:0;outline:0;background:transparent;color:#dbe8ef;font-size:13px}.method{display:inline-block;padding:4px 7px;border-radius:6px;border:1px solid #1d3946;background:#091923;color:#77a8c4;font-size:12px}.payment-amount{color:#4bd99a;font-weight:900}.modal-backdrop{position:fixed;inset:0;z-index:60;background:rgba(1,5,8,.72);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:18px}.modal{width:min(520px,100%);border:1px solid #203640;border-radius:14px;background:#080f14;box-shadow:0 25px 90px rgba(0,0,0,.6);overflow:hidden}.modal header{display:flex;justify-content:space-between;padding:19px;border-bottom:1px solid #182a34}.modal header>button{width:34px;height:34px;border:1px solid #263943;border-radius:8px;background:#0a1318;color:#8298a5;font-size:20px;cursor:pointer}.modal h2{margin:5px 0 0;font-size:18px}.recipient{display:flex;align-items:center;gap:10px;margin:16px;padding:12px;border:1px solid #1a303b;border-radius:9px;background:#060c10}.recipient strong,.recipient small{display:block}.recipient strong{font-size:13px}.recipient small{margin-top:3px;color: #6f8590;font-size:12px}.reminder-balance{margin:0 16px 15px;padding:14px;border:1px solid #463818;border-radius:9px;background:#171107}.reminder-balance small,.reminder-balance span{display:block;color:#9b8248;font-size:12px}.reminder-balance strong{display:block;margin:4px 0;color:#efc05a;font-size:22px}.field{display:block;margin:0 16px}.field>span{display:block;margin-bottom:7px;color:#8299a6;font-size:12px;font-weight:900}.field textarea{width:100%;resize:vertical;min-height:125px;padding:11px;border:1px solid #1d333e;border-radius:9px;outline:none;background:#050b0f;color:#d8e6ed;font:11px/1.55 inherit}.field textarea:focus{border-color:#197cb6;box-shadow:0 0 0 2px rgba(25,124,182,.12)}.field small{display:block;margin-top:5px;text-align:right;color: #6f838e;font-size:12px}.result{margin:12px 16px 0;padding:10px;border-radius:8px;font-size:12px}.result.success{border:1px solid #1a5c47;background:#092219;color:#54d99b}.result.error{border:1px solid #64272d;background:#210b0e;color:#ff7a82}.modal footer{display:flex;justify-content:flex-end;gap:8px;margin-top:17px;padding:14px 16px;border-top:1px solid #182a34;background:#071016}.state{min-height:100vh;display:grid;place-items:center;align-content:center;gap:10px;background:#05090d;color:#78909e;font:12px var(--font-geist-sans),system-ui}.loader{width:25px;height:25px;border:2px solid #17384f;border-top-color:#1598ff;border-radius:50%;animation:spin .8s linear infinite}.not-found{text-align:center}.not-found>span{display:grid;place-items:center;width:56px;height:56px;margin:0 auto 14px;border:1px solid #642126;border-radius:15px;background:#210b0d;color:#ff737b;font-size:22px;font-weight:900}.not-found small{color:#138fff;font-size:12px;font-weight:900;letter-spacing:.13em}.not-found h1{margin:8px 0;font-size:27px}.not-found p{margin:0 0 18px;color: #718594;font-size:13px}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:1050px){.overview-grid{grid-template-columns:1fr}.financials{grid-template-columns:repeat(2,1fr)}}@media(max-width:700px){.shell{width:calc(100% - 24px);padding-top:24px}.topbar{padding:0 15px}.top-actions>button{display:none}.customer-head{flex-direction:column}.head-actions{justify-content:flex-start}.financials{grid-template-columns:1fr 1fr}.details-grid{grid-template-columns:1fr}.detail.wide{grid-column:auto}.tabs{overflow:auto}.tabs button{white-space:nowrap}}@media(max-width:470px){.financials{grid-template-columns:1fr}.identity h1{font-size:21px}.head-actions>*{flex:1}.modal-backdrop{padding:10px}.modal{max-height:calc(100vh - 20px);overflow:auto}}

/* ---- record payment ---- */
.row-action{padding:6px 10px;border:1px solid #1b3b50;border-radius:8px;background:#091923;color:#5cb9f7;font-size:13px;font-weight:900;cursor:pointer;white-space:nowrap}
.row-action:hover{background:#0c2b45}
.flash{margin-top:12px;padding:12px 14px;border:1px solid #1a5c47;border-radius:10px;background:#092219;color:#54d99b;font-size:12px;line-height:1.5}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 4px}
.field input,.field select{width:100%;height:40px;padding:0 11px;border:1px solid #1d333e;border-radius:9px;outline:none;background:#050b0f;color:#d8e6ed;font:12px/1.4 inherit}
.field input:focus,.field select:focus{border-color:#197cb6;box-shadow:0 0 0 2px rgba(25,124,182,.12)}
.field{margin-bottom:12px}
@media(max-width:560px){.form-grid{grid-template-columns:1fr}}

/* ---- readability + small screens ---- */
td{font-size:16px}th{font-size:14px}td strong{font-size:17px}td small{font-size:14px}.badge{font-size:13px}.detail span{font-size:13px}.detail strong{font-size:15px}.row-action{font-size:14px}.identity p{font-size:15px}.panel-head p{font-size:14px}.financials span{font-size:14px}
.stats small,.panel-head small{font-size:13px}
@media(max-width:760px){.table-wrap{overflow-x:auto}.stats{grid-template-columns:1fr 1fr}}
`;
