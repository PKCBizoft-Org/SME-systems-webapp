
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabaseClient";

const PKC_LOGO = "data:image/png;base64,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";

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

const supabase = createClient();

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 2,
});

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
  billing_period_end, disconnect_date, terminate_date, original_amount,
  discount_amount, final_amount, discount_reason, paid_at
`;

const PAYMENT_COLUMNS = `
  id, tenant_id, client_id, billing_id, payment_id, receipt_number,
  amount_paid, payment_date, payment_method
`;

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getInitials(name: string | null) {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getBillAmount(bill: BillingRecord) {
  return Number(bill.final_amount ?? bill.amount_due ?? bill.original_amount ?? 0);
}

function getBillPaidAmount(billId: string, payments: PaymentRecord[]) {
  return payments
    .filter((payment) => payment.billing_id === billId)
    .reduce((sum, payment) => sum + Number(payment.amount_paid || 0), 0);
}

function getBillStatus(bill: BillingRecord, paid: number) {
  const remaining = Math.max(getBillAmount(bill) - paid, 0);
  if (remaining <= 0) return "Paid";
  if (paid > 0) return "Partial";
  if (bill.due_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(`${bill.due_date}T00:00:00`);
    if (!Number.isNaN(due.getTime()) && due < today) return "Overdue";
  }
  return "Unpaid";
}

function statusClass(status: string) {
  if (status === "Paid" || status === "Active") return "good";
  if (status === "Overdue" || status === "Suspended") return "danger";
  if (status === "Partial") return "warning";
  return "neutral";
}

function money(value: number) {
  return peso.format(Number.isFinite(value) ? value : 0);
}

function Detail({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="detail">
      <span>{label}</span>
      <strong>{value === null || value === undefined || value === "" ? "—" : value}</strong>
    </div>
  );
}

export default function AccountingPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [clients, setClients] = useState<Client[]>([]);
  const [billing, setBilling] = useState<BillingRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [areaFilter, setAreaFilter] = useState("All");
  const [sortBy, setSortBy] = useState("balance");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);

  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderMessage, setReminderMessage] = useState("");
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderResult, setReminderResult] = useState<ReminderResult | null>(null);

  const loadAccountingData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    setBillingError(null);
    setPaymentsError(null);

    try {
      const [clientsResult, billingResult, paymentsResultRaw] = await Promise.all([
        supabase.from("clients").select(CLIENT_COLUMNS).order("customer_name", { ascending: true }),
        supabase.from("billing").select(BILLING_COLUMNS).order("bill_date", { ascending: false }),
        supabase.from("payments").select(PAYMENT_COLUMNS).order("payment_date", { ascending: false }),
      ]);

      setClients((clientsResult.data || []) as Client[]);

      if (clientsResult.error) {
        throw new Error(`Clients: ${clientsResult.error.message}`);
      }

      if (billingResult.error) {
        setBilling([]);
        setBillingError(billingResult.error.message);
      } else {
        setBilling((billingResult.data || []) as BillingRecord[]);
      }

      let paymentsResult = paymentsResultRaw;
      if (paymentsResult.error?.message?.toLowerCase().includes("jwt issued at future")) {
        const refreshed = await supabase.auth.refreshSession();
        if (!refreshed.error) {
          paymentsResult = await supabase.from("payments")
            .select(PAYMENT_COLUMNS)
            .order("payment_date", { ascending: false });
        }
      }

      if (paymentsResult.error) {
        setPayments([]);
        setPaymentsError(paymentsResult.error.message);
      } else {
        setPayments((paymentsResult.data || []) as PaymentRecord[]);
      }

      setSelectedClientId((current) =>
        current && (clientsResult.data || []).some((client) => client.id === current)
          ? current
          : null
      );
    } catch (error) {
      console.error("Accounting load error:", error);
      if (error instanceof Error) setBillingError(error.message);
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

      if (membershipError) {
        console.error("Accounting access check error:", membershipError);
        router.replace("/clients");
        return;
      }

      const roles = (memberships || []).map((item) => item.role);
      const canView = roles.includes("admin") || roles.includes("accounting");

      if (!canView) {
        router.replace("/clients");
        return;
      }

      setIsAdmin(roles.includes("admin"));
      setAuthorized(true);
      setCheckingAccess(false);
    }

    void checkAccess();
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    if (authorized) void loadAccountingData();
  }, [authorized, loadAccountingData]);

  useEffect(() => {
    if (!selectedClientId && !reminderOpen) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (reminderOpen) setReminderOpen(false);
      else setSelectedClientId(null);
    };

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [selectedClientId, reminderOpen]);

  const paymentMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const payment of payments) {
      if (!payment.billing_id) continue;
      map.set(
        payment.billing_id,
        (map.get(payment.billing_id) || 0) + Number(payment.amount_paid || 0)
      );
    }
    return map;
  }, [payments]);

  const clientStats = useMemo(() => {
    const map = new Map<string, { billed: number; paid: number; balance: number; overdue: number; open: number }>();
    for (const client of clients) {
      map.set(client.id, { billed: 0, paid: 0, balance: 0, overdue: 0, open: 0 });
    }

    for (const bill of billing) {
      if (!bill.client_id) continue;
      const current = map.get(bill.client_id) || { billed: 0, paid: 0, balance: 0, overdue: 0, open: 0 };
      const amount = getBillAmount(bill);
      const paid = paymentMap.get(bill.id) || 0;
      const balance = Math.max(amount - paid, 0);
      const status = getBillStatus(bill, paid);

      current.billed += amount;
      current.paid += paid;
      current.balance += balance;
      current.open += balance > 0 ? 1 : 0;
      if (status === "Overdue") current.overdue += balance;
      map.set(bill.client_id, current);
    }
    return map;
  }, [clients, billing, paymentMap]);

  const totals = useMemo(() => {
    let billed = 0, paid = 0, overdue = 0, openBills = 0;
    for (const bill of billing) {
      const amount = getBillAmount(bill);
      const paidAmount = paymentMap.get(bill.id) || 0;
      const balance = Math.max(amount - paidAmount, 0);
      const status = getBillStatus(bill, paidAmount);
      billed += amount;
      paid += paidAmount;
      if (balance > 0) openBills++;
      if (status === "Overdue") overdue += balance;
    }
    const outstanding = Math.max(billed - paid, 0);
    return { billed, paid, outstanding, overdue, openBills };
  }, [billing, paymentMap]);

  const areas = useMemo(
    () => Array.from(new Set(clients.map((c) => c.area).filter(Boolean) as string[])).sort(),
    [clients]
  );

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();

    const rows = clients.filter((client) => {
      const matchesSearch = !q || [
        client.customer_name, client.account_id, client.mobile_number,
        client.email, client.area, client.plan_name, client.pppoe_name,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(q));

      return matchesSearch
        && (statusFilter === "All" || client.account_status === statusFilter)
        && (areaFilter === "All" || client.area === areaFilter);
    });

    return rows.sort((a, b) => {
      const sa = clientStats.get(a.id);
      const sb = clientStats.get(b.id);
      if (sortBy === "name") return (a.customer_name || "").localeCompare(b.customer_name || "");
      if (sortBy === "overdue") return (sb?.overdue || 0) - (sa?.overdue || 0);
      if (sortBy === "open") return (sb?.open || 0) - (sa?.open || 0);
      return (sb?.balance || 0) - (sa?.balance || 0);
    });
  }, [clients, search, statusFilter, areaFilter, sortBy, clientStats]);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

  const selectedBills = useMemo(
    () => billing.filter((bill) => bill.client_id === selectedClientId),
    [billing, selectedClientId]
  );

  const selectedPayments = useMemo(
    () => payments.filter((payment) => payment.client_id === selectedClientId),
    [payments, selectedClientId]
  );

  const selectedFinancials = useMemo(() => {
    let billed = 0, paid = 0, overdue = 0, open = 0;
    for (const bill of selectedBills) {
      const amount = getBillAmount(bill);
      const paidAmount = paymentMap.get(bill.id) || 0;
      const balance = Math.max(amount - paidAmount, 0);
      billed += amount;
      paid += paidAmount;
      if (balance > 0) open++;
      if (getBillStatus(bill, paidAmount) === "Overdue") overdue += balance;
    }
    return {
      billed,
      paid,
      outstanding: Math.max(billed - paid, 0),
      overdue,
      open,
      progress: billed ? Math.min(Math.round((paid / billed) * 100), 100) : 0,
    };
  }, [selectedBills, paymentMap]);

  function openReminder(client = selectedClient) {
    if (!client) return;
    const stats = clientStats.get(client.id);
    const balance = stats?.balance || 0;
    setReminderResult(null);
    setReminderMessage(
      `Hello ${client.customer_name || "Customer"}, this is a friendly reminder from PKC BIZOFT. Your current outstanding balance is ${money(balance)}. Please settle your account at your earliest convenience. Thank you.`
    );
    setReminderOpen(true);
  }

  async function sendCustomerReminder() {
    if (!selectedClient) return;
    if (!selectedClient.mobile_number?.trim()) {
      setReminderResult({ type: "error", message: "This customer does not have a mobile number saved." });
      return;
    }
    if (!reminderMessage.trim()) {
      setReminderResult({ type: "error", message: "Please enter a reminder message." });
      return;
    }

    setSendingReminder(true);
    setReminderResult(null);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Your session has expired. Please sign in again.");

      const response = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clientId: selectedClient.id, message: reminderMessage.trim() }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The SMS could not be sent.");

      setReminderResult({
        type: "success",
        message: `SMS queued successfully for ${result.recipient || selectedClient.mobile_number}.`,
      });
    } catch (error) {
      setReminderResult({
        type: "error",
        message: error instanceof Error ? error.message : "The SMS could not be sent.",
      });
    } finally {
      setSendingReminder(false);
    }
  }

  if (checkingAccess) return <main className="state-page"><div className="loader" /><span>Checking accounting access…</span><style jsx>{styles}</style></main>;
  if (!authorized) return null;

  return (
    <main className="page">
      <header className="topbar">
        <div className="brand">
          <img src={PKC_LOGO} alt="PKC BIZOFT" />
          <div><strong>PKC</strong> <span>BIZOFT</span></div>
        </div>
        <div className="top-actions">
          {isAdmin && <a href="/users">Users</a>}
          <span className="secure"><i /> Secure session</span>
        </div>
      </header>

      <div className="shell">
        <section className="hero">
          <div>
            <div className="crumb"><i /> PKC BIZOFT / ACCOUNTING</div>
            <h1>Accounting</h1>
            <p>Monitor customer balances, billing, payments, and collection activity from one workspace.</p>
          </div>
          <button className="refresh" onClick={() => void loadAccountingData(true)} disabled={refreshing}>
            <span className={refreshing ? "spin" : ""}>↻</span>{refreshing ? "Refreshing…" : "Refresh data"}
          </button>
        </section>

        {(billingError || paymentsError) && (
          <div className="notice">
            <b>!</b>
            <div><strong>Some accounting data needs attention.</strong><span>{billingError || paymentsError}</span></div>
          </div>
        )}

        <section className="stats">
          <article><span className="stat-icon">👥</span><div><small>Customer accounts</small><strong>{loading ? "—" : clients.length}</strong><em>All registered accounts</em></div></article>
          <article><span className="stat-icon">₱</span><div><small>Total billed</small><strong>{loading ? "—" : money(totals.billed)}</strong><em>{billing.length} billing records</em></div></article>
          <article className="accent-green"><span className="stat-icon">✓</span><div><small>Total collected</small><strong>{loading ? "—" : money(totals.paid)}</strong><em>{payments.length} payments</em></div></article>
          <article className="accent-orange"><span className="stat-icon">◐</span><div><small>Outstanding</small><strong>{loading ? "—" : money(totals.outstanding)}</strong><em>{totals.openBills} open bills</em></div></article>
          <article className="accent-red"><span className="stat-icon">!</span><div><small>Overdue</small><strong>{loading ? "—" : money(totals.overdue)}</strong><em>Needs collection follow-up</em></div></article>
        </section>

        <section className="workspace">
          <div className="directory panel">
            <div className="panel-head">
              <div><small>ACCOUNT DIRECTORY</small><h2>Customer Accounts</h2></div>
              <strong>{filteredClients.length}<span> / {clients.length}</span></strong>
            </div>

            <div className="filters">
              <label className="search"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, account, mobile, plan…" /></label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option>All</option><option>Active</option><option>Suspended</option><option>Inactive</option></select>
              <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}><option>All areas</option>{areas.map((area) => <option key={area}>{area}</option>)}</select>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}><option value="balance">Highest balance</option><option value="overdue">Highest overdue</option><option value="open">Most open bills</option><option value="name">Name A–Z</option></select>
            </div>

            <div className="quick-filters">
              <button className={statusFilter === "All" ? "active" : ""} onClick={() => setStatusFilter("All")}>All</button>
              <button className={statusFilter === "Active" ? "active" : ""} onClick={() => setStatusFilter("Active")}>Active</button>
              <button onClick={() => setSortBy("overdue")}>Overdue first</button>
              <button onClick={() => setSortBy("balance")}>Balance first</button>
            </div>

            <div className="table-wrap">
              <table>
                <thead><tr><th>Customer</th><th>Plan / Area</th><th>Status</th><th>Open</th><th className="right">Balance</th><th /></tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={6} className="empty"><div className="loader" />Loading customer accounts…</td></tr>
                  : filteredClients.length === 0 ? <tr><td colSpan={6} className="empty">No customer accounts match these filters.</td></tr>
                  : filteredClients.map((client) => {
                    const stats = clientStats.get(client.id);
                    const selected = selectedClientId === client.id;
                    return (
                      <tr key={client.id} className={selected ? "selected" : ""} onClick={() => setSelectedClientId(client.id)}>
                        <td><div className="customer-cell"><span className="avatar">{getInitials(client.customer_name)}</span><div><strong>{client.customer_name || "Unnamed customer"}</strong><small>{client.account_id || client.mobile_number || "No account ID"}</small></div></div></td>
                        <td><strong>{client.plan_name || "No plan"}</strong><small>{client.area || "No area"}</small></td>
                        <td><span className={`badge ${statusClass(client.account_status || "Unknown")}`}>{client.account_status || "Unknown"}</span></td>
                        <td><span className="open-count">{stats?.open || 0}</span></td>
                        <td className="right"><strong className={stats?.overdue ? "balance danger-text" : "balance"}>{money(stats?.balance || 0)}</strong></td>
                        <td><button className="row-open" onClick={(e) => { e.stopPropagation(); setSelectedClientId(client.id); }}>View →</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      {selectedClient && (
        <div className="drawer-backdrop" onMouseDown={() => setSelectedClientId(null)}>
          <aside className="drawer" onMouseDown={(e) => e.stopPropagation()}>
            <div className="drawer-top">
              <div><small>ACCOUNT OVERVIEW</small><button onClick={() => setSelectedClientId(null)} aria-label="Close">×</button></div>
              <div className="identity"><span className="avatar large">{getInitials(selectedClient.customer_name)}</span><div><h2>{selectedClient.customer_name || "Unnamed customer"}</h2><p>{selectedClient.account_id || "No account ID"} · {selectedClient.area || "No area"}</p></div></div>
              <div className="drawer-status"><span className={`badge ${statusClass(selectedClient.account_status || "Unknown")}`}>{selectedClient.account_status || "Unknown"}</span><span>{selectedClient.plan_name || "No plan"}</span></div>
            </div>

            <div className="drawer-body">
              <section className="mini-financials">
                <div><small>Outstanding</small><strong>{money(selectedFinancials.outstanding)}</strong></div>
                <div><small>Overdue</small><strong className="danger-text">{money(selectedFinancials.overdue)}</strong></div>
                <div><small>Collected</small><strong className="good-text">{money(selectedFinancials.paid)}</strong></div>
              </section>

              <section className="progress-box">
                <div><span>Collection progress</span><strong>{selectedFinancials.progress}%</strong></div>
                <div className="progress"><i style={{ width: `${selectedFinancials.progress}%` }} /></div>
                <small>{money(selectedFinancials.paid)} collected of {money(selectedFinancials.billed)}</small>
              </section>

              <section className="drawer-section">
                <header><div><small>COLLECTION</small><h3>Open bills</h3></div><span>{selectedFinancials.open}</span></header>
                {selectedBills.filter((bill) => (paymentMap.get(bill.id) || 0) < getBillAmount(bill)).slice(0, 5).map((bill) => {
                  const amount = getBillAmount(bill), paid = paymentMap.get(bill.id) || 0, balance = Math.max(amount - paid, 0);
                  return <div className="bill-row" key={bill.id}><div><strong>{bill.bill_id || bill.id.slice(0, 8)}</strong><small>Due {formatDate(bill.due_date)}</small></div><div><strong>{money(balance)}</strong><span className={`badge ${statusClass(getBillStatus(bill, paid))}`}>{getBillStatus(bill, paid)}</span></div></div>;
                })}
                {selectedFinancials.open === 0 && <p className="muted">No outstanding bills.</p>}
              </section>

              <section className="drawer-section">
                <header><div><small>CUSTOMER</small><h3>Account details</h3></div></header>
                <div className="details-grid">
                  <Detail label="Mobile" value={selectedClient.mobile_number} />
                  <Detail label="Email" value={selectedClient.email} />
                  <Detail label="Plan" value={selectedClient.plan_name} />
                  <Detail label="Area" value={selectedClient.area} />
                  <Detail label="Installation" value={formatDate(selectedClient.install_date)} />
                  <Detail label="Technician" value={selectedClient.technicians} />
                  <Detail label="PPPoE" value={selectedClient.pppoe_name} />
                  <Detail label="Referral" value={selectedClient.referral_code} />
                  <Detail label="Address" value={selectedClient.address} />
                </div>
              </section>

              <section className="drawer-section">
                <header><div><small>BILLING SCHEDULE</small><h3>Account cycle</h3></div></header>
                <div className="details-grid compact">
                  <Detail label="Cycle" value={selectedClient.billing_cycle} />
                  <Detail label="Billing day" value={selectedClient.billing_day} />
                  <Detail label="Due day" value={selectedClient.due_day} />
                  <Detail label="Disconnect" value={selectedClient.disconnect_day} />
                  <Detail label="Terminate" value={selectedClient.terminate_day} />
                </div>
              </section>
            </div>

            <footer className="drawer-actions">
              <button className="secondary" onClick={() => setSelectedClientId(null)}>Close</button>
              <button className="secondary" onClick={() => openReminder()}>Remind</button>
              <button className="primary" onClick={() => router.push(`/accounting/${selectedClient.id}`)}>View full account →</button>
            </footer>
          </aside>
        </div>
      )}

      {reminderOpen && selectedClient && (
        <div className="modal-backdrop" onMouseDown={() => !sendingReminder && setReminderOpen(false)}>
          <section className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <header><div><small>COLLECTION</small><h2>Send payment reminder</h2></div><button onClick={() => setReminderOpen(false)} disabled={sendingReminder}>×</button></header>
            <div className="recipient"><span className="avatar">{getInitials(selectedClient.customer_name)}</span><div><strong>{selectedClient.customer_name || "Customer"}</strong><small>{selectedClient.mobile_number || "No mobile number saved"}</small></div></div>
            <div className="reminder-balance"><small>Current outstanding</small><strong>{money(selectedFinancials.outstanding)}</strong><span>{money(selectedFinancials.overdue)} overdue</span></div>
            <label className="field"><span>SMS message</span><textarea value={reminderMessage} onChange={(e) => setReminderMessage(e.target.value)} maxLength={480} rows={6} disabled={sendingReminder} /><small>{reminderMessage.length}/480 characters</small></label>
            {reminderResult && <div className={`result ${reminderResult.type}`}>{reminderResult.message}</div>}
            <footer><button className="secondary" onClick={() => setReminderOpen(false)} disabled={sendingReminder}>Cancel</button><button className="primary" onClick={() => void sendCustomerReminder()} disabled={sendingReminder || !selectedClient.mobile_number}>{sendingReminder ? "Sending…" : "Send SMS reminder"}</button></footer>
          </section>
        </div>
      )}

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
* { box-sizing: border-box; }
.page { min-height:100vh; background:#05090d; color:#e7f0f6; font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
.topbar { height:70px; padding:0 34px; border-bottom:1px solid #16242d; background:#071016; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:30; }
.brand,.top-actions,.secure,.crumb,.hero,.identity,.drawer-status,.drawer-actions,.recipient,.panel-head,.panel-head>div,.filters,.quick-filters,.customer-cell,.progress-box>div,.drawer-top>div:first-child { display:flex; align-items:center; }
.brand { gap:11px; }
.brand img { width:36px; height:36px; object-fit:contain; border-radius:9px; }
.brand div { font-size:14px; letter-spacing:.06em; }
.brand strong { color:#fff; } .brand span { color:#5d7485; font-weight:700; }
.top-actions { gap:18px; } .top-actions a { color:#7ebeff; text-decoration:none; font-size:12px; font-weight:800; }
.secure { gap:8px; color:#7b909f; font-size:10px; font-weight:900; letter-spacing:.09em; text-transform:uppercase; }
.secure i { width:7px;height:7px;border-radius:50%;background:#33d18c;box-shadow:0 0 12px #33d18c; }
.shell { width:min(1500px,calc(100% - 48px)); margin:auto; padding:36px 0 50px; }
.hero { justify-content:space-between; gap:25px; margin-bottom:24px; }
.crumb { gap:8px; color:#4f86a9; font-size:9px; font-weight:900; letter-spacing:.13em; }
.crumb i { width:6px;height:6px;border-radius:50%;background:#1b9cff; }
.hero h1 { margin:9px 0 5px; font-size:34px; letter-spacing:-.04em; }
.hero p { margin:0; color:#738998; font-size:13px; }
.refresh,.primary,.secondary,.row-open,.quick-filters button { border-radius:9px; cursor:pointer; font-weight:900; }
.refresh { min-height:42px; padding:0 16px; border:1px solid #16486a; background:#092033; color:#6bc0ff; }
.refresh span { margin-right:8px; font-size:17px; } .spin { display:inline-block;animation:spin .7s linear infinite; }
.notice { display:flex;gap:12px;padding:13px 15px;margin-bottom:18px;border:1px solid #4a3515;border-radius:10px;background:#171107;color:#c2a15a; }
.notice>b { width:23px;height:23px;display:grid;place-items:center;border-radius:7px;background:#2b1d08; } .notice div { display:grid;gap:3px; } .notice strong{font-size:11px}.notice span{font-size:10px;color:#8e7748}
.stats { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:10px; margin-bottom:18px; }
.stats article { min-height:108px; padding:18px; border:1px solid #172832; border-radius:13px; background:linear-gradient(145deg,#091218,#070d12); display:flex;gap:13px; }
.stat-icon { width:38px;height:38px;display:grid;place-items:center;border:1px solid #124666;border-radius:10px;background:#092033;color:#55b8ff;font-weight:900;flex:0 0 auto; }
.stats article div { min-width:0;display:grid;align-content:center;gap:3px; } .stats small{color:#5d7584;font-size:8px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.stats strong{font-size:19px;letter-spacing:-.03em}.stats em{font-style:normal;color:#4e6472;font-size:9px}.accent-green .stat-icon{color:#48d997;border-color:#1a5c47;background:#09251c}.accent-orange .stat-icon{color:#f1bb5a;border-color:#604719;background:#211708}.accent-red .stat-icon{color:#ff717b;border-color:#60262b;background:#210b0e}
.panel { border:1px solid #172832; border-radius:14px; background:#080f14; overflow:hidden; }
.panel-head { justify-content:space-between; padding:19px 20px 15px; border-bottom:1px solid #14232c; } .panel-head small,.drawer-top small,.drawer-section header small,.modal small{color:#4287b2;font-size:8px;font-weight:900;letter-spacing:.13em}.panel-head h2{margin:5px 0 0;font-size:18px}.panel-head>strong{font-size:18px}.panel-head>strong span{color:#4f6573;font-size:11px;font-weight:700}
.filters { gap:8px; padding:13px 14px; border-bottom:1px solid #14232c; flex-wrap:wrap; }
.search { flex:1 1 280px; min-width:220px; height:39px;display:flex;align-items:center;gap:8px;padding:0 11px;border:1px solid #1c303b;border-radius:8px;background:#060c10;color:#547180; }
.search input{width:100%;border:0;outline:0;background:transparent;color:#dbe8ef;font-size:11px}.search input::placeholder{color:#4b626f}
.filters select{height:39px;padding:0 11px;border:1px solid #1c303b;border-radius:8px;background:#0a1218;color:#8ca3b1;font-size:10px;outline:none;cursor:pointer}
.quick-filters{gap:7px;padding:9px 14px;border-bottom:1px solid #14232c;overflow:auto}.quick-filters button{white-space:nowrap;padding:7px 10px;border:1px solid #1b303c;background:#0a1319;color:#708896;font-size:9px}.quick-filters button.active,.quick-filters button:hover{border-color:#155c86;background:#092237;color:#5ebeff}
.table-wrap{overflow:auto} table{width:100%;border-collapse:collapse;min-width:850px}th{padding:11px 15px;text-align:left;color:#4f6978;font-size:8px;letter-spacing:.12em;border-bottom:1px solid #172832;background:#071016;white-space:nowrap}td{padding:13px 15px;border-bottom:1px solid #102029;color:#9bb0bd;font-size:10px;vertical-align:middle}tbody tr{transition:.15s;background:#080f14;cursor:pointer}tbody tr:hover,tbody tr.selected{background:#0a1821}tbody tr.selected{box-shadow:inset 2px 0 #1a9fff}td small,.customer-cell small{display:block;margin-top:3px;color:#506673;font-size:9px}.customer-cell{gap:10px}.customer-cell>div{min-width:0}.customer-cell strong{display:block;color:#d9e6ed;font-size:11px}.avatar{width:34px;height:34px;display:grid;place-items:center;flex:0 0 auto;border:1px solid #165074;border-radius:9px;background:#092237;color:#63beff;font-size:10px;font-weight:900}.avatar.large{width:48px;height:48px;font-size:13px}.badge{display:inline-flex;align-items:center;padding:5px 8px;border:1px solid #263843;border-radius:999px;background:#0c151b;color:#7d919d;font-size:8px;font-weight:900}.badge.good{border-color:#1a6048;background:#092219;color:#51d99b}.badge.danger{border-color:#6a2830;background:#220d10;color:#ff7b83}.badge.warning{border-color:#6a501e;background:#201707;color:#eabd58}.open-count{display:inline-grid;place-items:center;min-width:25px;height:25px;border:1px solid #223741;border-radius:7px;color:#b7cad4;background:#0b141a}.right{text-align:right}.balance{color:#e0edf3;font-size:11px}.danger-text{color:#ff777e!important}.good-text{color:#4bd99a!important}.row-open{padding:6px 9px;border:1px solid #1b3b50;background:#091923;color:#5cb9f7;font-size:8px}
.empty{height:220px;text-align:center;color:#536b79}.empty .loader{margin:0 auto 10px}.loader{width:25px;height:25px;border:2px solid #17384f;border-top-color:#1598ff;border-radius:50%;animation:spin .8s linear infinite}
.drawer-backdrop,.modal-backdrop{position:fixed;inset:0;z-index:60;background:rgba(1,5,8,.72);backdrop-filter:blur(4px);display:flex;justify-content:flex-end}
.drawer{width:min(560px,100%);height:100%;background:#071016;border-left:1px solid #1b303b;box-shadow:-20px 0 70px rgba(0,0,0,.45);display:flex;flex-direction:column}
.drawer-top{padding:20px;border-bottom:1px solid #172832}.drawer-top>div:first-child{justify-content:space-between}.drawer-top button,.modal header>button{width:34px;height:34px;border:1px solid #263943;border-radius:8px;background:#0a1318;color:#8298a5;font-size:20px;cursor:pointer}.identity{gap:12px;margin-top:16px}.identity h2{margin:0;font-size:20px}.identity p{margin:4px 0 0;color:#617885;font-size:10px}.drawer-status{gap:8px;margin-top:14px;color:#708693;font-size:9px}
.drawer-body{flex:1;overflow:auto;padding:16px 20px}.mini-financials{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.mini-financials>div,.progress-box{padding:12px;border:1px solid #182b35;border-radius:10px;background:#091218}.mini-financials small,.progress-box small{display:block;color:#5e7481;font-size:8px}.mini-financials strong{display:block;margin-top:4px;font-size:14px}.progress-box{margin-top:9px}.progress-box>div{justify-content:space-between}.progress-box span{font-size:9px;color:#8aa0ad}.progress-box strong{color:#5ebeff;font-size:12px}.progress{height:6px!important;margin:9px 0;border-radius:99px;background:#142631!important;overflow:hidden}.progress i{display:block;height:100%;background:#1598ff;border-radius:99px}.drawer-section{margin-top:15px;padding:15px;border:1px solid #172832;border-radius:11px;background:#080f14}.drawer-section header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}.drawer-section h3{margin:4px 0 0;font-size:13px}.drawer-section header>span{min-width:25px;height:25px;display:grid;place-items:center;border-radius:7px;background:#0b1922;color:#63bcf7;font-size:9px}.bill-row{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid #12232c}.bill-row:first-of-type{border-top:0}.bill-row div:last-child{text-align:right}.bill-row strong{display:block;color:#cfe0e8;font-size:10px}.bill-row small{display:block;margin-top:3px;color:#526a77;font-size:8px}.bill-row .badge{margin-top:4px}.details-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.detail{padding:9px;border:1px solid #162a34;border-radius:8px;background:#09141a;min-width:0}.detail span{display:block;color:#506976;font-size:7px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.detail strong{display:block;margin-top:4px;color:#bdd0da;font-size:9px;overflow-wrap:anywhere}.details-grid .detail:last-child:nth-child(odd){grid-column:1/-1}.compact .detail:last-child:nth-child(odd){grid-column:auto}.muted{margin:0;color:#506773;font-size:9px}
.drawer-actions{gap:8px;padding:14px 20px;border-top:1px solid #172832;background:#071016}.primary,.secondary{min-height:40px;padding:0 13px;font-size:9px}.primary{border:1px solid #0e72ad;background:#092237;color:#5ebeff}.secondary{border:1px solid #263843;background:#0a1318;color:#91a5b2}
.modal-backdrop{align-items:center;justify-content:center;padding:18px}.modal{width:min(520px,100%);border:1px solid #203640;border-radius:14px;background:#080f14;box-shadow:0 25px 90px rgba(0,0,0,.6);overflow:hidden}.modal header{display:flex;justify-content:space-between;padding:19px;border-bottom:1px solid #182a34}.modal h2{margin:5px 0 0;font-size:18px}.recipient{gap:10px;margin:16px;padding:12px;border:1px solid #1a303b;border-radius:9px;background:#060c10}.recipient strong,.recipient small{display:block}.recipient strong{font-size:10px}.recipient small{margin-top:3px;color:#5f7784;font-size:8px}.reminder-balance{margin:0 16px 15px;padding:14px;border:1px solid #463818;border-radius:9px;background:#171107}.reminder-balance small,.reminder-balance span{display:block;color:#9b8248;font-size:8px}.reminder-balance strong{display:block;margin:4px 0;color:#efc05a;font-size:22px}.field{display:block;margin:0 16px}.field>span{display:block;margin-bottom:7px;color:#8299a6;font-size:9px;font-weight:900}.field textarea{width:100%;resize:vertical;min-height:125px;padding:11px;border:1px solid #1d333e;border-radius:9px;outline:none;background:#050b0f;color:#d8e6ed;font:11px/1.55 inherit}.field textarea:focus{border-color:#197cb6;box-shadow:0 0 0 2px rgba(25,124,182,.12)}.field small{display:block;margin-top:5px;text-align:right;color:#4f6875;font-size:8px}.result{margin:12px 16px 0;padding:10px;border-radius:8px;font-size:9px}.result.success{border:1px solid #1a5c47;background:#092219;color:#54d99b}.result.error{border:1px solid #64272d;background:#210b0e;color:#ff7a82}.modal footer{display:flex;justify-content:flex-end;gap:8px;margin-top:17px;padding:14px 16px;border-top:1px solid #182a34;background:#071016}.modal button:disabled,.refresh:disabled{opacity:.5;cursor:not-allowed}
.state-page{min-height:100vh;display:grid;place-items:center;align-content:center;gap:10px;background:#05090d;color:#78909e;font:12px Inter,system-ui}.state-page .loader{margin:0}
@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:1100px){.stats{grid-template-columns:repeat(3,1fr)}}
@media(max-width:760px){.shell{width:min(100% - 24px,1500px);padding-top:24px}.topbar{padding:0 15px}.top-actions a{display:none}.hero{align-items:flex-start;flex-direction:column}.stats{grid-template-columns:1fr 1fr}.stats article{min-height:94px}.stats article:nth-child(5){grid-column:1/-1}.filters select{flex:1}.drawer{width:100%}.details-grid{grid-template-columns:1fr}.details-grid .detail:last-child:nth-child(odd){grid-column:auto}}
@media(max-width:480px){.stats{grid-template-columns:1fr}.stats article:nth-child(5){grid-column:auto}.hero h1{font-size:28px}.mini-financials{grid-template-columns:1fr}.drawer-actions{flex-wrap:wrap}.drawer-actions button{flex:1}}
`;
