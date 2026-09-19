"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabaseClient";

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

const supabase = createClient();

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 2,
});

function formatDate(value: string | null) {
  if (!value) return "—";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getBillAmount(bill: BillingRecord) {
  return Number(
    bill.final_amount ??
      bill.amount_due ??
      bill.original_amount ??
      0
  );
}

function getBillPaidAmount(
  bill: BillingRecord,
  payments: PaymentRecord[]
) {
  return payments
    .filter(
      (payment) => payment.billing_id === bill.id
    )
    .reduce(
      (sum, payment) =>
        sum + Number(payment.amount_paid || 0),
      0
    );
}

function getBillStatus(
  bill: BillingRecord,
  payments: PaymentRecord[]
) {
  const amount = getBillAmount(bill);
  const paid = getBillPaidAmount(bill, payments);
  const remaining = Math.max(amount - paid, 0);

  if (remaining <= 0) {
    return "Paid";
  }

  if (paid > 0) {
    return "Partial";
  }

  if (bill.due_date) {
    const today = new Date();

    today.setHours(0, 0, 0, 0);

    const dueDate = new Date(
      `${bill.due_date}T00:00:00`
    );

    if (
      !Number.isNaN(dueDate.getTime()) &&
      dueDate < today
    ) {
      return "Overdue";
    }
  }

  return "Unpaid";
}

function getStatusClass(status: string) {
  switch (status) {
    case "Paid":
    case "Active":
      return "status-paid";

    case "Overdue":
    case "Suspended":
      return "status-overdue";

    case "Partial":
      return "status-partial";

    default:
      return "status-unpaid";
  }
}

function getInitials(name: string | null) {
  if (!name) {
    return "?";
  }

  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return `${parts[0][0]}${
    parts[parts.length - 1][0]
  }`.toUpperCase();
}

export default function AccountingPage() {
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [billing, setBilling] = useState<
    BillingRecord[]
  >([]);
  const [payments, setPayments] = useState<
    PaymentRecord[]
  >([]);

  const [selectedClientId, setSelectedClientId] =
    useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState("All");
  const [areaFilter, setAreaFilter] =
    useState("All");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] =
    useState(false);

  const [billingError, setBillingError] =
    useState<string | null>(null);

  const [paymentsError, setPaymentsError] =
    useState<string | null>(null);

  const [reminderOpen, setReminderOpen] =
    useState(false);

  const [reminderMessage, setReminderMessage] =
    useState("");

  const [sendingReminder, setSendingReminder] =
    useState(false);

  const [reminderResult, setReminderResult] =
    useState<{
      type: "success" | "error";
      message: string;
    } | null>(null);

  async function loadAccountingData(
    showRefresh = false
  ) {
    if (showRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setBillingError(null);
    setPaymentsError(null);

    try {
      const clientsResult = await supabase
        .from("clients")
        .select(`
          id,
          tenant_id,
          customer_name,
          install_date,
          plan_name,
          area,
          installation_status,
          account_status,
          account_id,
          mobile_number,
          pppoe_name,
          map_location,
          technicians,
          latitude,
          longitude,
          user_id,
          referral_code,
          billing_cycle,
          billing_day,
          due_day,
          disconnect_day,
          terminate_day,
          email,
          birth_date,
          gender,
          address
        `)
        .order("customer_name", {
          ascending: true,
        });

      if (clientsResult.error) {
        throw new Error(
          `Clients: ${clientsResult.error.message}`
        );
      }

      const loadedClients =
        (clientsResult.data || []) as Client[];

      setClients(loadedClients);

      const billingResult = await supabase
        .from("billing")
        .select(`
          id,
          tenant_id,
          client_id,
          bill_id,
          status,
          bill_type,
          bill_date,
          due_date,
          amount_due,
          billing_cycle,
          billing_period_start,
          billing_period_end,
          disconnect_date,
          terminate_date,
          original_amount,
          discount_amount,
          final_amount,
          discount_reason,
          paid_at
        `)
        .order("bill_date", {
          ascending: false,
        });

      if (billingResult.error) {
        console.error(
          "Accounting billing error:",
          billingResult.error
        );

        setBillingError(
          billingResult.error.message
        );

        setBilling([]);
      } else {
        setBilling(
          (billingResult.data ||
            []) as BillingRecord[]
        );
      }

      let paymentsResult = await supabase
        .from("payments")
        .select(`
          id,
          tenant_id,
          client_id,
          billing_id,
          payment_id,
          receipt_number,
          amount_paid,
          payment_date,
          payment_method
        `)
        .order("payment_date", {
          ascending: false,
        });

      if (
        paymentsResult.error?.message
          ?.toLowerCase()
          .includes("jwt issued at future")
      ) {
        console.warn(
          "Payments session appears stale. Attempting session refresh."
        );

        const refreshResult =
          await supabase.auth.refreshSession();

        if (!refreshResult.error) {
          paymentsResult = await supabase
            .from("payments")
            .select(`
              id,
              tenant_id,
              client_id,
              billing_id,
              payment_id,
              receipt_number,
              amount_paid,
              payment_date,
              payment_method
            `)
            .order("payment_date", {
              ascending: false,
            });
        }
      }

      if (paymentsResult.error) {
        console.error(
          "Accounting payments error:",
          paymentsResult.error
        );

        setPaymentsError(
          paymentsResult.error.message
        );

        setPayments([]);
      } else {
        setPayments(
          (paymentsResult.data ||
            []) as PaymentRecord[]
        );
      }

      setSelectedClientId((current) => {
        if (
          current &&
          loadedClients.some(
            (client) => client.id === current
          )
        ) {
          return current;
        }

        return null;
      });
    } catch (error) {
      console.error(
        "Accounting dashboard error:",
        error
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadAccountingData();
  }, []);

  useEffect(() => {
    if (!selectedClientId && !reminderOpen) {
      return;
    }

    const handleKeyDown = (
      event: KeyboardEvent
    ) => {
      if (event.key !== "Escape") {
        return;
      }

      if (reminderOpen) {
        setReminderOpen(false);
      } else {
        setSelectedClientId(null);
      }
    };

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = "hidden";

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    selectedClientId,
    reminderOpen,
  ]);

  const areas = useMemo(() => {
    const values = clients
      .map((client) => client.area)
      .filter(
        (area): area is string =>
          Boolean(area && area.trim())
      );

    return Array.from(
      new Set(values)
    ).sort();
  }, [clients]);

  const filteredClients = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase();

    return clients.filter((client) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          client.customer_name,
          client.account_id,
          client.mobile_number,
          client.email,
          client.area,
          client.plan_name,
          client.pppoe_name,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value)
              .toLowerCase()
              .includes(normalizedSearch)
          );

      const matchesStatus =
        statusFilter === "All" ||
        client.account_status ===
          statusFilter;

      const matchesArea =
        areaFilter === "All" ||
        client.area === areaFilter;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesArea
      );
    });
  }, [
    clients,
    search,
    statusFilter,
    areaFilter,
  ]);

  const selectedClient = useMemo(() => {
    if (!selectedClientId) {
      return null;
    }

    return (
      clients.find(
        (client) =>
          client.id === selectedClientId
      ) || null
    );
  }, [
    clients,
    selectedClientId,
  ]);

  const selectedBills = useMemo(() => {
    if (!selectedClientId) {
      return [];
    }

    return billing.filter(
      (bill) =>
        bill.client_id === selectedClientId
    );
  }, [
    billing,
    selectedClientId,
  ]);

  const selectedPayments = useMemo(() => {
    if (!selectedClientId) {
      return [];
    }

    return payments.filter(
      (payment) =>
        payment.client_id ===
        selectedClientId
    );
  }, [
    payments,
    selectedClientId,
  ]);

  const selectedFinancials = useMemo(() => {
    const totalBilled =
      selectedBills.reduce(
        (sum, bill) =>
          sum + getBillAmount(bill),
        0
      );

    const totalPaid =
      selectedPayments.reduce(
        (sum, payment) =>
          sum +
          Number(
            payment.amount_paid || 0
          ),
        0
      );

    const outstanding = Math.max(
      totalBilled - totalPaid,
      0
    );

    const overdue =
      selectedBills.reduce(
        (sum, bill) => {
          const status =
            getBillStatus(
              bill,
              selectedPayments
            );

          if (status !== "Overdue") {
            return sum;
          }

          const amount =
            getBillAmount(bill);

          const paid =
            getBillPaidAmount(
              bill,
              selectedPayments
            );

          return (
            sum +
            Math.max(
              amount - paid,
              0
            )
          );
        },
        0
      );

    const progress =
      totalBilled > 0
        ? Math.min(
            Math.round(
              (totalPaid /
                totalBilled) *
                100
            ),
            100
          )
        : 0;

    const unpaidBills =
      selectedBills.filter(
        (bill) => {
          const status =
            getBillStatus(
              bill,
              selectedPayments
            );

          return (
            status === "Unpaid" ||
            status === "Partial" ||
            status === "Overdue"
          );
        }
      );

    return {
      totalBilled,
      totalPaid,
      outstanding,
      overdue,
      progress,
      unpaidBills,
    };
  }, [
    selectedBills,
    selectedPayments,
  ]);

  const overallStats = useMemo(() => {
    const totalBilled =
      billing.reduce(
        (sum, bill) =>
          sum + getBillAmount(bill),
        0
      );

    const totalPaid =
      payments.reduce(
        (sum, payment) =>
          sum +
          Number(
            payment.amount_paid || 0
          ),
        0
      );

    const outstanding = Math.max(
      totalBilled - totalPaid,
      0
    );

    const overdue =
      billing.reduce(
        (sum, bill) => {
          const billPayments =
            payments.filter(
              (payment) =>
                payment.billing_id ===
                bill.id
            );

          if (
            getBillStatus(
              bill,
              billPayments
            ) !== "Overdue"
          ) {
            return sum;
          }

          return (
            sum +
            Math.max(
              getBillAmount(bill) -
                getBillPaidAmount(
                  bill,
                  billPayments
                ),
              0
            )
          );
        },
        0
      );

    const unpaidBills =
      billing.filter(
        (bill) => {
          const billPayments =
            payments.filter(
              (payment) =>
                payment.billing_id ===
                bill.id
            );

          const status =
            getBillStatus(
              bill,
              billPayments
            );

          return (
            status === "Unpaid" ||
            status === "Partial" ||
            status === "Overdue"
          );
        }
      ).length;

    return {
      totalBilled,
      totalPaid,
      outstanding,
      overdue,
      unpaidBills,
    };
  }, [
    billing,
    payments,
  ]);

  function buildDefaultReminderMessage(
    client: Client
  ) {
    const name =
      client.customer_name?.trim() ||
      "Customer";

    const balance =
      peso.format(
        selectedFinancials.outstanding
      );

    return `Hi ${name}, this is PKC BIZOFT. This is a reminder that your account currently has an outstanding balance of ${balance}. Please settle your account at your earliest convenience. Thank you.`;
  }

  async function sendCustomerReminder() {
    if (!selectedClient) {
      return;
    }

    if (!selectedClient.mobile_number?.trim()) {
      setReminderResult({
        type: "error",
        message:
          "This customer does not have a mobile number saved.",
      });
      return;
    }

    const message =
      reminderMessage.trim();

    if (!message) {
      setReminderResult({
        type: "error",
        message:
          "Please enter a reminder message.",
      });
      return;
    }

    setSendingReminder(true);
    setReminderResult(null);

    try {
      const sessionResult =
        await supabase.auth.getSession();

      const accessToken =
        sessionResult.data.session
          ?.access_token;

      if (!accessToken) {
        throw new Error(
          "Your session has expired. Please sign in again."
        );
      }

      const response = await fetch(
        "/api/sms/send",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            clientId:
              selectedClient.id,
            message,
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "The SMS could not be sent."
        );
      }

      setReminderResult({
        type: "success",
        message:
          `SMS queued successfully for ${result.recipient}.`,
      });
    } catch (error) {
      console.error(
        "Customer SMS reminder error:",
        error
      );

      setReminderResult({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "The SMS could not be sent.",
      });
    } finally {
      setSendingReminder(false);
    }
  }

  function clearSelection() {
    setReminderOpen(false);
    setSelectedClientId(null);
    setReminderResult(null);
  }

  function openAccountDetails() {
    if (!selectedClientId) {
      return;
    }

    router.push(
      `/accounting/${selectedClientId}`
    );
  }

  return (
    <main className="accounting-page">
      <header className="topbar">
        <div className="brand">
          <div className="brand-logo">
            <div className="logo-mark">
              P
            </div>
          </div>

          <div className="brand-name">
            PKC <span>BIZOFT</span>
          </div>
        </div>

        <div className="topbar-right">
          <a
            href="/clients"
            className="top-link"
          >
            Clients
          </a>

          <div className="secure-session">
            <span className="secure-dot" />
            SECURE SESSION
          </div>
        </div>
      </header>

      <div className="page-container">
        <section className="page-intro">
          <div>
            <div className="breadcrumb">
              <span className="breadcrumb-dot" />
              PKC BIZOFT / ACCOUNTING
            </div>

            <h1>Accounting</h1>

            <p>
              Review customer accounts,
              billing, payments, balances,
              and collections.
            </p>
          </div>

          <button
            type="button"
            className="refresh-button"
            onClick={() =>
              void loadAccountingData(
                true
              )
            }
            disabled={refreshing}
          >
            <span>↻</span>

            {refreshing
              ? "Refreshing..."
              : "Refresh"}
          </button>
        </section>

        {(paymentsError ||
          billingError) && (
          <div className="system-notice">
            <div className="notice-symbol">
              !
            </div>

            <div>
              <strong>
                Some accounting records need
                attention.
              </strong>

              <span>
                {paymentsError
                  ? " Payment records could not be loaded. "
                  : ""}

                {billingError
                  ? " Billing records could not be loaded."
                  : ""}
              </span>
            </div>
          </div>
        )}

        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon blue">
              👥
            </div>

            <div className="stat-content">
              <span className="stat-label">
                CUSTOMER ACCOUNTS
              </span>

              <strong className="stat-value">
                {loading
                  ? "—"
                  : clients.length}
              </strong>

              <small>
                Total customers
              </small>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon blue">
              ₱
            </div>

            <div className="stat-content">
              <span className="stat-label">
                TOTAL BILLED
              </span>

              <strong className="stat-value">
                {loading
                  ? "—"
                  : peso.format(
                      overallStats.totalBilled
                    )}
              </strong>

              <small>
                All billing records
              </small>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon green">
              ✓
            </div>

            <div className="stat-content">
              <span className="stat-label">
                COLLECTED
              </span>

              <strong className="stat-value green-text">
                {loading
                  ? "—"
                  : peso.format(
                      overallStats.totalPaid
                    )}
              </strong>

              <small>
                Recorded payments
              </small>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon red">
              !
            </div>

            <div className="stat-content">
              <span className="stat-label">
                OUTSTANDING
              </span>

              <strong className="stat-value">
                {loading
                  ? "—"
                  : peso.format(
                      overallStats.outstanding
                    )}
              </strong>

              <small>
                {peso.format(
                  overallStats.overdue
                )}{" "}
                overdue
              </small>
            </div>
          </div>
        </section>

        <section className="workspace">
          <aside className="client-directory">
            <div className="directory-header">
              <div>
                <div className="panel-kicker">
                  CUSTOMER ACCOUNTS
                </div>

                <h2>
                  Client Directory
                </h2>

                <p>
                  Select a customer to open
                  their accounting summary.
                </p>
              </div>

              <div className="client-count">
                {filteredClients.length}
              </div>
            </div>

            <div className="filters">
              <div className="search-wrapper">
                <span>⌕</span>

                <input
                  value={search}
                  onChange={(event) =>
                    setSearch(
                      event.target.value
                    )
                  }
                  placeholder="Search customer, ID, mobile..."
                />
              </div>

              <div className="filter-row">
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(
                      event.target.value
                    )
                  }
                >
                  <option value="All">
                    All statuses
                  </option>

                  <option value="Active">
                    Active
                  </option>

                  <option value="Suspended">
                    Suspended
                  </option>

                  <option value="Inactive">
                    Inactive
                  </option>
                </select>

                <select
                  value={areaFilter}
                  onChange={(event) =>
                    setAreaFilter(
                      event.target.value
                    )
                  }
                >
                  <option value="All">
                    All areas
                  </option>

                  {areas.map((area) => (
                    <option
                      key={area}
                      value={area}
                    >
                      {area}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="directory-summary">
              Showing{" "}
              <strong>
                {filteredClients.length}
              </strong>{" "}
              of{" "}
              <strong>
                {clients.length}
              </strong>{" "}
              customers
            </div>

            <div className="client-list">
              {loading ? (
                <div className="list-empty">
                  <div className="loading-ring" />
                  Loading customers...
                </div>
              ) : filteredClients.length ===
                0 ? (
                <div className="list-empty">
                  No customers match the
                  current filters.
                </div>
              ) : (
                filteredClients.map(
                  (client) => {
                    const clientBills =
                      billing.filter(
                        (bill) =>
                          bill.client_id ===
                          client.id
                      );

                    const clientPayments =
                      payments.filter(
                        (payment) =>
                          payment.client_id ===
                          client.id
                      );

                    const billed =
                      clientBills.reduce(
                        (sum, bill) =>
                          sum +
                          getBillAmount(
                            bill
                          ),
                        0
                      );

                    const paid =
                      clientPayments.reduce(
                        (
                          sum,
                          payment
                        ) =>
                          sum +
                          Number(
                            payment.amount_paid ||
                              0
                          ),
                        0
                      );

                    const balance =
                      Math.max(
                        billed - paid,
                        0
                      );

                    const selected =
                      selectedClientId ===
                      client.id;

                    return (
                      <button
                        type="button"
                        key={client.id}
                        className={`client-row ${
                          selected
                            ? "selected"
                            : ""
                        }`}
                        onClick={() =>
                          setSelectedClientId(
                            client.id
                          )
                        }
                      >
                        <div className="client-avatar">
                          {getInitials(
                            client.customer_name
                          )}
                        </div>

                        <div className="client-main">
                          <strong>
                            {client.customer_name ||
                              "Unnamed Customer"}
                          </strong>

                          <span>
                            {client.account_id ||
                              "No account ID"}
                          </span>

                          <small>
                            {client.area ||
                              "No area"}{" "}
                            ·{" "}
                            {client.plan_name ||
                              "No plan"}
                          </small>
                        </div>

                        <div className="client-balance">
                          <strong>
                            {peso.format(
                              balance
                            )}
                          </strong>

                          <span>
                            {balance > 0
                              ? "balance"
                              : "clear"}
                          </span>
                        </div>

                        <span
                          className={`status ${getStatusClass(
                            client.account_status ||
                              "Unknown"
                          )}`}
                        >
                          {client.account_status ||
                            "Unknown"}
                        </span>

                        <span className="chevron">
                          ›
                        </span>
                      </button>
                    );
                  }
                )
              )}
            </div>
          </aside>
        </section>
      </div>

      {/* =========================================================
          CUSTOMER ACCOUNT SIDE DRAWER
          ========================================================= */}

      {selectedClient && (
        <div
          className="account-drawer-backdrop"
          onMouseDown={clearSelection}
        >
          <aside
            className="account-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-account-title"
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <div className="account-drawer-scroll">
              {/* HEADER */}

              <div className="drawer-header">
                <div className="drawer-identity">
                  <div className="large-avatar">
                    {getInitials(
                      selectedClient.customer_name
                    )}
                  </div>

                  <div className="drawer-title">
                    <div className="panel-kicker">
                      CUSTOMER ACCOUNT
                    </div>

                    <h2 id="customer-account-title">
                      {selectedClient.customer_name ||
                        "Unnamed Customer"}
                    </h2>

                    <div className="identity-meta">
                      <span>
                        {selectedClient.account_id ||
                          "No account ID"}
                      </span>

                      <span>
                        {selectedClient.area ||
                          "No area"}
                      </span>

                      <span>
                        {selectedClient.plan_name ||
                          "No plan"}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="close-button"
                  onClick={clearSelection}
                  aria-label="Close customer account"
                  title="Close"
                >
                  ×
                </button>
              </div>

              {/* STATUS */}

              <div className="drawer-status-row">
                <span
                  className={`status large ${getStatusClass(
                    selectedClient.account_status ||
                      "Unknown"
                  )}`}
                >
                  {selectedClient.account_status ||
                    "Unknown"}
                </span>

                {selectedFinancials.overdue >
                  0 && (
                  <span className="attention-label">
                    <span />
                    Payment attention required
                  </span>
                )}
              </div>

              {/* FINANCIAL SUMMARY */}

              <section className="drawer-section financial-section">
                <div className="financial-grid">
                  <div className="financial-card">
                    <span>
                      TOTAL BILLED
                    </span>

                    <strong>
                      {peso.format(
                        selectedFinancials.totalBilled
                      )}
                    </strong>
                  </div>

                  <div className="financial-card paid">
                    <span>
                      TOTAL PAID
                    </span>

                    <strong>
                      {peso.format(
                        selectedFinancials.totalPaid
                      )}
                    </strong>
                  </div>

                  <div className="financial-card outstanding">
                    <span>
                      OUTSTANDING
                    </span>

                    <strong>
                      {peso.format(
                        selectedFinancials.outstanding
                      )}
                    </strong>
                  </div>

                  <div className="financial-card overdue">
                    <span>
                      OVERDUE
                    </span>

                    <strong>
                      {peso.format(
                        selectedFinancials.overdue
                      )}
                    </strong>
                  </div>
                </div>
              </section>

              {/* COLLECTION */}

              <section className="drawer-section">
                <div className="section-heading">
                  <div>
                    <div className="panel-kicker">
                      COLLECTION
                    </div>

                    <h3>
                      Payment Progress
                    </h3>
                  </div>

                  <strong className="progress-value">
                    {selectedFinancials.progress}%
                  </strong>
                </div>

                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${selectedFinancials.progress}%`,
                    }}
                  />
                </div>

                <div className="progress-meta">
                  <span>
                    Paid{" "}
                    {peso.format(
                      selectedFinancials.totalPaid
                    )}
                  </span>

                  <span>
                    Billed{" "}
                    {peso.format(
                      selectedFinancials.totalBilled
                    )}
                  </span>
                </div>
              </section>

              {/* CUSTOMER INFORMATION */}

              <section className="drawer-section">
                <div className="section-heading">
                  <div>
                    <div className="panel-kicker">
                      CUSTOMER INFORMATION
                    </div>

                    <h3>
                      Account Details
                    </h3>
                  </div>
                </div>

                <div className="information-groups">
                  {/* CONTACT */}

                  <div className="information-group">
                    <div className="information-group-title">
                      CONTACT
                    </div>

                    <div className="information-grid">
                      <InfoItem
                        label="Customer Name"
                        value={
                          selectedClient.customer_name
                        }
                      />

                      <InfoItem
                        label="Mobile"
                        value={
                          selectedClient.mobile_number
                        }
                      />

                      <InfoItem
                        label="Email"
                        value={
                          selectedClient.email
                        }
                      />

                      <InfoItem
                        label="Address"
                        value={
                          selectedClient.address
                        }
                        wide
                      />
                    </div>
                  </div>

                  {/* ACCOUNT */}

                  <div className="information-group">
                    <div className="information-group-title">
                      ACCOUNT
                    </div>

                    <div className="information-grid">
                      <InfoItem
                        label="Account ID"
                        value={
                          selectedClient.account_id
                        }
                      />

                      <InfoItem
                        label="Account Status"
                        value={
                          selectedClient.account_status
                        }
                      />

                      <InfoItem
                        label="Plan"
                        value={
                          selectedClient.plan_name
                        }
                      />

                      <InfoItem
                        label="Area"
                        value={
                          selectedClient.area
                        }
                      />

                      <InfoItem
                        label="Installation Status"
                        value={
                          selectedClient.installation_status
                        }
                      />

                      <InfoItem
                        label="Installation Date"
                        value={formatDate(
                          selectedClient.install_date
                        )}
                      />
                    </div>
                  </div>

                  {/* SERVICE */}

                  <div className="information-group">
                    <div className="information-group-title">
                      SERVICE
                    </div>

                    <div className="information-grid">
                      <InfoItem
                        label="PPPoE"
                        value={
                          selectedClient.pppoe_name
                        }
                      />

                      <InfoItem
                        label="Technician"
                        value={
                          selectedClient.technicians
                        }
                      />

                      <InfoItem
                        label="Map Location"
                        value={
                          selectedClient.map_location
                        }
                        wide
                      />
                    </div>
                  </div>

                  {/* BILLING SETUP */}

                  <div className="information-group">
                    <div className="information-group-title">
                      BILLING SETUP
                    </div>

                    <div className="information-grid">
                      <InfoItem
                        label="Billing Cycle"
                        value={
                          selectedClient.billing_cycle
                        }
                      />

                      <InfoItem
                        label="Billing Day"
                        value={
                          selectedClient.billing_day
                            ?.toString() || null
                        }
                      />

                      <InfoItem
                        label="Due Day"
                        value={
                          selectedClient.due_day
                            ?.toString() || null
                        }
                      />

                      <InfoItem
                        label="Disconnect Day"
                        value={
                          selectedClient.disconnect_day
                            ?.toString() || null
                        }
                      />

                      <InfoItem
                        label="Terminate Day"
                        value={
                          selectedClient.terminate_day
                            ?.toString() || null
                        }
                      />

                      <InfoItem
                        label="Open Bills"
                        value={String(
                          selectedFinancials
                            .unpaidBills.length
                        )}
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* BILLING SCHEDULE */}

              <section className="drawer-section">
                <div className="section-heading">
                  <div>
                    <div className="panel-kicker">
                      ACCOUNT SETUP
                    </div>

                    <h3>
                      Billing Schedule
                    </h3>
                  </div>
                </div>

                <div className="schedule-grid">
                  <div>
                    <span>CYCLE</span>

                    <strong>
                      {selectedClient.billing_cycle ||
                        "—"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      BILLING DAY
                    </span>

                    <strong>
                      {selectedClient.billing_day ??
                        "—"}
                    </strong>
                  </div>

                  <div>
                    <span>DUE DAY</span>

                    <strong>
                      {selectedClient.due_day ??
                        "—"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      DISCONNECT
                    </span>

                    <strong>
                      {selectedClient.disconnect_day ??
                        "—"}
                    </strong>
                  </div>
                </div>
              </section>

              {/* ACCOUNT STATUS SUMMARY */}

              <section className="drawer-section">
                <div className="section-heading">
                  <div>
                    <div className="panel-kicker">
                      COLLECTION
                    </div>

                    <h3>
                      Account Collection
                    </h3>
                  </div>
                </div>

                <div className="collection-summary">
                  <div>
                    <span>
                      OPEN BILLS
                    </span>

                    <strong>
                      {
                        selectedFinancials
                          .unpaidBills.length
                      }
                    </strong>
                  </div>

                  <div>
                    <span>
                      OUTSTANDING
                    </span>

                    <strong className="purple-text">
                      {peso.format(
                        selectedFinancials.outstanding
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>
                      OVERDUE
                    </span>

                    <strong className="red-text">
                      {peso.format(
                        selectedFinancials.overdue
                      )}
                    </strong>
                  </div>
                </div>
              </section>

              {/* ACTIONS */}

              <div className="drawer-actions">
                <button
                  type="button"
                  className="primary-action"
                  onClick={
                    openAccountDetails
                  }
                >
                  <span>
                    View Account Details
                  </span>

                  <span className="action-arrow">
                    →
                  </span>
                </button>

                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => {
                    if (selectedClient) {
                      setReminderMessage(
                        buildDefaultReminderMessage(
                          selectedClient
                        )
                      );
                    }

                    setReminderResult(null);
                    setReminderOpen(true);
                  }}
                >
                  <span>↗</span>

                  Remind Customer
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* =========================================================
          SMS CUSTOMER REMINDER
          ========================================================= */}

      {reminderOpen &&
        selectedClient && (
          <div
            className="modal-backdrop"
            onMouseDown={() =>
              setReminderOpen(false)
            }
          >
            <div
              className="reminder-modal"
              onMouseDown={(event) =>
                event.stopPropagation()
              }
            >
              <div className="modal-header">
                <div>
                  <div className="panel-kicker">
                    SMS COLLECTION REMINDER
                  </div>

                  <h2>
                    Remind Customer
                  </h2>

                  <p className="modal-subtitle">
                    Send an SMS directly to the
                    customer's saved mobile number.
                  </p>
                </div>

                <button
                  type="button"
                  className="close-button"
                  onClick={() =>
                    setReminderOpen(false)
                  }
                  aria-label="Close reminder"
                >
                  ×
                </button>
              </div>

              <div className="reminder-customer">
                <div className="client-avatar">
                  {getInitials(
                    selectedClient.customer_name
                  )}
                </div>

                <div className="reminder-customer-copy">
                  <strong>
                    {selectedClient.customer_name ||
                      "Unnamed Customer"}
                  </strong>

                  <span>
                    {selectedClient.account_id ||
                      "No account ID"}
                  </span>

                  <small>
                    {selectedClient.mobile_number ||
                      "No mobile number saved"}
                  </small>
                </div>
              </div>

              <div className="reminder-balance">
                <span>
                  CURRENT OUTSTANDING
                </span>

                <strong>
                  {peso.format(
                    selectedFinancials.outstanding
                  )}
                </strong>
              </div>

              <div className="reminder-field">
                <label htmlFor="customer-reminder-message">
                  MESSAGE
                </label>

                <textarea
                  id="customer-reminder-message"
                  value={reminderMessage}
                  onChange={(event) => {
                    setReminderMessage(
                      event.target.value
                    );
                    setReminderResult(null);
                  }}
                  rows={6}
                  maxLength={640}
                  placeholder="Enter the SMS reminder..."
                  disabled={sendingReminder}
                />

                <div className="message-counter">
                  <span>
                    SMS messages may be split into
                    multiple segments when long.
                  </span>

                  <strong>
                    {reminderMessage.length}/640
                  </strong>
                </div>
              </div>

              {reminderResult && (
                <div
                  className={`reminder-result ${reminderResult.type}`}
                  role={
                    reminderResult.type ===
                    "error"
                      ? "alert"
                      : "status"
                  }
                >
                  <span>
                    {reminderResult.type ===
                    "success"
                      ? "✓"
                      : "!"}
                  </span>

                  <p>
                    {reminderResult.message}
                  </p>
                </div>
              )}

              <div className="reminder-safety-note">
                <span>i</span>

                <p>
                  Only send account-related messages
                  to customers who should receive
                  them. Keep the message factual and
                  avoid unnecessary personal
                  information.
                </p>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() =>
                    setReminderOpen(false)
                  }
                  disabled={sendingReminder}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="primary-action"
                  onClick={() =>
                    void sendCustomerReminder()
                  }
                  disabled={sendingReminder}
                >
                  {sendingReminder ? (
                    <>
                      <span className="button-spinner" />
                      Sending SMS...
                    </>
                  ) : (
                    <>
                      <span>↗</span>
                      Send SMS Reminder
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        

      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        .accounting-page {
          min-height: 100vh;
          background:
            radial-gradient(
              circle at 50% -20%,
              rgba(0, 132, 255, 0.09),
              transparent 38%
            ),
            #03070a;
          color: #eaf2fa;
          font-family:
            Arial,
            Helvetica,
            sans-serif;
        }

        /* =====================================================
           TOP BAR
           ===================================================== */

        .topbar {
          height: 82px;
          padding: 0 40px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #151d24;
          background: rgba(3, 7, 10, 0.97);
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .brand-logo {
          width: 47px;
          height: 47px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          background: #071b2d;
          border: 1px solid #0d426b;
          box-shadow:
            0 0 22px
              rgba(0, 140, 255, 0.13);
        }

        .logo-mark {
          color: #148eff;
          font-size: 25px;
          font-weight: 900;
          font-style: italic;
        }

        .brand-name {
          color: #eaf2fa;
          font-size: 19px;
          letter-spacing: -0.02em;
        }

        .brand-name span {
          color: #148eff;
          font-weight: 900;
        }

        .topbar-right {
          display: flex;
          align-items: center;
          gap: 28px;
        }

        .top-link {
          color: #91a5b6;
          text-decoration: none;
          font-size: 14px;
        }

        .top-link:hover {
          color: #ffffff;
        }

        .secure-session {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 15px;
          border: 1px solid #114b38;
          border-radius: 999px;
          background: rgba(
            7,
            38,
            29,
            0.55
          );
          color: #7de6ae;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.05em;
        }

        .secure-dot,
        .breadcrumb-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #35e58c;
          box-shadow:
            0 0 12px
              rgba(53, 229, 140, 0.7);
        }

        /* =====================================================
           PAGE
           ===================================================== */

        .page-container {
          width: calc(100% - 60px);
          max-width: 1550px;
          margin: 0 auto;
          padding: 46px 0 70px;
        }

        .page-intro {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 30px;
          margin-bottom: 34px;
        }

        .breadcrumb {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 18px;
          color: #1598ff;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.14em;
        }

        .page-intro h1 {
          margin: 0;
          color: #edf6ff;
          font-size: clamp(
            48px,
            5vw,
            68px
          );
          line-height: 0.98;
          letter-spacing: -0.055em;
        }

        .page-intro p {
          margin: 18px 0 0;
          color: #8297a9;
          font-size: 15px;
          line-height: 1.5;
        }

        .refresh-button {
          min-width: 118px;
          height: 48px;
          border: 1px solid #0d4f7d;
          border-radius: 11px;
          background: #061522;
          color: #6dc4ff;
          font-size: 13px;
          font-weight: 900;
          cursor: pointer;
          transition: 0.18s ease;
        }

        .refresh-button:hover {
          background: #092236;
          border-color: #1478b5;
        }

        .refresh-button:disabled {
          opacity: 0.55;
          cursor: wait;
        }

        .refresh-button span {
          margin-right: 7px;
          font-size: 17px;
        }

        /* =====================================================
           NOTICE
           ===================================================== */

        .system-notice {
          display: flex;
          gap: 13px;
          align-items: center;
          margin-bottom: 18px;
          padding: 13px 16px;
          border: 1px solid #51400d;
          border-radius: 11px;
          background: #171307;
          color: #f4cf68;
          font-size: 12px;
        }

        .system-notice strong {
          display: block;
          margin-bottom: 2px;
        }

        .system-notice span {
          color: #8d9eaa;
        }

        .notice-symbol {
          width: 27px;
          height: 27px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: rgba(
            255,
            190,
            0,
            0.1
          );
          font-weight: 900;
        }

        /* =====================================================
           STAT CARDS
           ===================================================== */

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(
            4,
            minmax(0, 1fr)
          );
          gap: 14px;
          margin-bottom: 20px;
        }

        .stat-card {
          min-height: 120px;
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 20px;
          border: 1px solid #1b252d;
          border-radius: 13px;
          background: #080e13;
        }

        .stat-icon {
          width: 47px;
          height: 47px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          border: 1px solid;
          font-size: 18px;
          font-weight: 900;
        }

        .stat-icon.blue {
          background: #071b2b;
          border-color: #0c466c;
          color: #43aeff;
        }

        .stat-icon.green {
          background: #071e17;
          border-color: #10553c;
          color: #42df91;
        }

        .stat-icon.red {
          background: #210b0d;
          border-color: #642126;
          color: #ff6670;
        }

        .stat-content {
          min-width: 0;
        }

        .stat-label {
          display: block;
          margin-bottom: 7px;
          color: #647b8d;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.12em;
        }

        .stat-value {
          display: block;
          color: #edf6ff;
          font-size: 22px;
          font-weight: 900;
          letter-spacing: -0.035em;
        }

        .green-text {
          color: #52df9a;
        }

        .stat-content small {
          display: block;
          margin-top: 5px;
          color: #536979;
          font-size: 10px;
        }

        /* =====================================================
           CLIENT DIRECTORY
           ===================================================== */

        .workspace {
          display: block;
        }

        .client-directory {
          min-width: 0;
          height: 760px;
          display: flex;
          flex-direction: column;
          border: 1px solid #1b252d;
          border-radius: 14px;
          background: #080e13;
          overflow: hidden;
        }

        .directory-header {
          padding: 22px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          border-bottom: 1px solid #182229;
        }

        .panel-kicker {
          margin-bottom: 7px;
          color: #138fff;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.14em;
        }

        .directory-header h2 {
          margin: 0;
          color: #e8f2fa;
          font-size: 20px;
          font-weight: 900;
          letter-spacing: -0.025em;
        }

        .directory-header p {
          margin: 7px 0 0;
          color: #617788;
          font-size: 11px;
        }

        .client-count {
          min-width: 38px;
          height: 33px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #17466a;
          border-radius: 9px;
          background: #071725;
          color: #53b7ff;
          font-size: 12px;
          font-weight: 900;
        }

        .filters {
          padding: 13px;
          border-bottom: 1px solid #182229;
        }

        .search-wrapper {
          position: relative;
          margin-bottom: 9px;
        }

        .search-wrapper span {
          position: absolute;
          left: 13px;
          top: 50%;
          transform: translateY(-50%);
          color: #5f7788;
          font-size: 17px;
        }

        .filters input,
        .filters select {
          width: 100%;
          height: 43px;
          border: 1px solid #202d36;
          border-radius: 9px;
          outline: none;
          background: #060b0f;
          color: #cbd9e2;
          font-size: 11px;
        }

        .filters input {
          padding: 0 12px 0 37px;
        }

        .filters select {
          padding: 0 10px;
        }

        .filters input:focus,
        .filters select:focus {
          border-color: #116da5;
          box-shadow:
            0 0 0 2px
              rgba(
                17,
                109,
                165,
                0.1
              );
        }

        .filter-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 9px;
        }

        .directory-summary {
          padding: 10px 15px;
          border-bottom: 1px solid #121b21;
          color: #526b7a;
          font-size: 9px;
        }

        .directory-summary strong {
          color: #8ca2b1;
        }

        .client-list {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color:
            #18384e
            #060b0f;
        }

        .client-list::-webkit-scrollbar {
          width: 8px;
        }

        .client-list::-webkit-scrollbar-track {
          background: #060b0f;
        }

        .client-list::-webkit-scrollbar-thumb {
          background: #18384e;
          border: 2px solid #060b0f;
          border-radius: 999px;
        }

        .client-list::-webkit-scrollbar-thumb:hover {
          background: #245a7d;
        }

        .client-row {
          width: 100%;
          display: grid;
          grid-template-columns:
            38px
            minmax(0, 1fr)
            auto
            auto
            15px;
          gap: 10px;
          align-items: center;
          padding: 13px 14px;
          border: 0;
          border-bottom: 1px solid #121b21;
          background: transparent;
          color: inherit;
          text-align: left;
          cursor: pointer;
          transition: 0.16s ease;
        }

        .client-row:hover {
          background: #0b141a;
        }

        .client-row.selected {
          background: #091b29;
          box-shadow:
            inset 3px 0 0 #168fff;
        }

        .client-avatar,
        .large-avatar {
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #12496e;
          background: #0a2032;
          color: #4fb5ff;
          font-weight: 900;
        }

        .client-avatar {
          width: 38px;
          height: 38px;
          border-radius: 11px;
          font-size: 12px;
        }

        .client-main {
          min-width: 0;
          display: flex;
          flex-direction: column;
        }

        .client-main strong {
          overflow: hidden;
          color: #dce8f0;
          font-size: 11px;
          font-weight: 900;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .client-main span {
          margin-top: 3px;
          color: #657d8d;
          font-size: 9px;
        }

        .client-main small {
          margin-top: 4px;
          overflow: hidden;
          color: #4d6372;
          font-size: 8px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .client-balance {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }

        .client-balance strong {
          color: #dbe8f1;
          font-size: 10px;
        }

        .client-balance span {
          margin-top: 3px;
          color: #4e6473;
          font-size: 7px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        /* =====================================================
           STATUS
           ===================================================== */

        .status {
          display: inline-flex;
          width: fit-content;
          align-items: center;
          justify-content: center;
          padding: 5px 8px;
          border-radius: 999px;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: 0.04em;
          white-space: nowrap;
        }

        .status.large {
          padding: 7px 10px;
          font-size: 8px;
        }

        .status-paid {
          color: #59dfa0;
          background: #092319;
          border: 1px solid #154c35;
        }

        .status-overdue {
          color: #ff737b;
          background: #270d10;
          border: 1px solid #652027;
        }

        .status-partial {
          color: #f0c45e;
          background: #211b0a;
          border: 1px solid #51420f;
        }

        .status-unpaid {
          color: #8fa4b4;
          background: #111a20;
          border: 1px solid #26343d;
        }

        .chevron {
          color: #486171;
          font-size: 21px;
        }

        .list-empty {
          min-height: 220px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 30px;
          color: #526775;
          text-align: center;
          font-size: 11px;
        }

        .loading-ring {
          width: 24px;
          height: 24px;
          margin-bottom: 12px;
          border: 2px solid #17384f;
          border-top-color: #1598ff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        /* =====================================================
           RIGHT SIDE ACCOUNT DRAWER
           ===================================================== */

        .account-drawer-backdrop {
          position: fixed;
          inset: 0;
          z-index: 90;
          display: flex;
          align-items: stretch;
          justify-content: flex-end;
          background: rgba(
            0,
            0,
            0,
            0.68
          );
          backdrop-filter: blur(5px);
          animation: drawerBackdropIn
            0.16s ease-out;
        }

        .account-drawer {
          width: min(650px, 92vw);
          height: 100%;
          border-left: 1px solid #22333f;
          background: #080e13;
          box-shadow:
            -25px 0 90px
              rgba(0, 0, 0, 0.55);
          animation: drawerSlideIn
            0.2s ease-out;
        }

        .account-drawer-scroll {
          height: 100%;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color:
            #18384e
            #060b0f;
        }

        .account-drawer-scroll::-webkit-scrollbar {
          width: 9px;
        }

        .account-drawer-scroll::-webkit-scrollbar-track {
          background: #060b0f;
        }

        .account-drawer-scroll::-webkit-scrollbar-thumb {
          background: #18384e;
          border: 2px solid #060b0f;
          border-radius: 999px;
        }

        .account-drawer-scroll::-webkit-scrollbar-thumb:hover {
          background: #245a7d;
        }

        @keyframes drawerBackdropIn {
          from {
            opacity: 0;
          }

          to {
            opacity: 1;
          }
        }

        @keyframes drawerSlideIn {
          from {
            opacity: 0;
            transform: translateX(35px);
          }

          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .drawer-header {
          position: sticky;
          top: 0;
          z-index: 5;
          min-height: 105px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 20px 22px;
          border-bottom: 1px solid #182229;
          background: rgba(
            8,
            14,
            19,
            0.97
          );
          backdrop-filter: blur(12px);
        }

        .drawer-identity {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .drawer-title {
          min-width: 0;
        }

        .drawer-title h2 {
          margin: 0;
          color: #e8f2fa;
          font-size: 21px;
          line-height: 1.15;
          letter-spacing: -0.025em;
        }

        .large-avatar {
          width: 56px;
          height: 56px;
          flex-shrink: 0;
          border-radius: 15px;
          font-size: 17px;
        }

        .identity-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 9px;
        }

        .identity-meta span {
          padding: 5px 8px;
          border: 1px solid #1c2b35;
          border-radius: 7px;
          background: #060c10;
          color: #668092;
          font-size: 8px;
        }

        .close-button {
          width: 38px;
          height: 38px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #25343d;
          border-radius: 9px;
          background: #0a1116;
          color: #8398a6;
          font-size: 23px;
          line-height: 1;
          cursor: pointer;
          transition: 0.18s ease;
        }

        .close-button:hover {
          border-color: #b33c45;
          background: #1b0b0e;
          color: #ff737b;
        }

        .drawer-status-row {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          padding: 13px 22px;
          border-bottom: 1px solid #182229;
        }

        .attention-label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #d49f45;
          font-size: 8px;
          font-weight: 800;
        }

        .attention-label span {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #e0a94f;
        }

        /* =====================================================
           DRAWER SECTIONS
           ===================================================== */

        .drawer-section {
          padding: 21px 22px;
          border-bottom: 1px solid #182229;
        }

        .financial-section {
          padding-top: 18px;
          padding-bottom: 18px;
        }

        .section-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 15px;
        }

        .section-heading h3 {
          margin: 0;
          color: #e1edf4;
          font-size: 15px;
        }

        /* =====================================================
           FINANCIAL CARDS
           ===================================================== */

        .financial-grid {
          display: grid;
          grid-template-columns: repeat(
            2,
            minmax(0, 1fr)
          );
          gap: 9px;
        }

        .financial-card {
          min-width: 0;
          padding: 14px;
          border: 1px solid #19262f;
          border-radius: 10px;
          background: #060b0f;
        }

        .financial-card span {
          display: block;
          margin-bottom: 8px;
          color: #556d7d;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: 0.1em;
        }

        .financial-card strong {
          color: #dce8f0;
          font-size: 15px;
        }

        .financial-card.paid strong {
          color: #52df9a;
        }

        .financial-card.outstanding strong {
          color: #bd8cff;
        }

        .financial-card.overdue strong {
          color: #ff7078;
        }

        /* =====================================================
           PROGRESS
           ===================================================== */

        .progress-value {
          color: #48df95;
          font-size: 20px;
        }

        .progress-track {
          height: 9px;
          overflow: hidden;
          border-radius: 999px;
          background: #17242d;
        }

        .progress-fill {
          height: 100%;
          border-radius: inherit;
          background: #35df90;
          box-shadow:
            0 0 12px
              rgba(
                53,
                223,
                144,
                0.25
              );
          transition: width 0.3s ease;
        }

        .progress-meta {
          display: flex;
          justify-content: space-between;
          margin-top: 8px;
          color: #5a7180;
          font-size: 8px;
        }

        /* =====================================================
           CUSTOMER INFORMATION
           ===================================================== */

        .information-groups {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .information-group {
          padding: 13px;
          border: 1px solid #182832;
          border-radius: 10px;
          background: #060b0f;
        }

        .information-group-title {
          margin-bottom: 11px;
          color: #1598ff;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.12em;
        }

        .information-grid {
          display: grid;
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
          gap: 8px;
        }

        .information-item {
          min-width: 0;
          min-height: 56px;
          padding: 10px;
          border: 1px solid #14232c;
          border-radius: 8px;
          background: #080f14;
        }

        .information-item.wide {
          grid-column: 1 / -1;
        }

        .information-item span {
          display: block;
          margin-bottom: 6px;
          color: #526b7b;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .information-item strong {
          display: block;
          overflow: hidden;
          color: #c5d5df;
          font-size: 10px;
          line-height: 1.35;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .information-item.wide strong {
          white-space: normal;
          word-break: break-word;
        }

        /* =====================================================
           BILLING SCHEDULE
           ===================================================== */

        .schedule-grid {
          display: grid;
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
          gap: 8px;
        }

        .schedule-grid > div {
          min-width: 0;
          padding: 11px;
          border: 1px solid #182832;
          border-radius: 8px;
          background: #060b0f;
        }

        .schedule-grid span {
          display: block;
          margin-bottom: 6px;
          color: #526b7b;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: 0.08em;
        }

        .schedule-grid strong {
          display: block;
          overflow: hidden;
          color: #b8cad6;
          font-size: 10px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* =====================================================
           COLLECTION SUMMARY
           ===================================================== */

        .collection-summary {
          display: grid;
          grid-template-columns:
            repeat(
              3,
              minmax(0, 1fr)
            );
          gap: 8px;
        }

        .collection-summary > div {
          padding: 12px;
          border: 1px solid #182832;
          border-radius: 8px;
          background: #060b0f;
        }

        .collection-summary span {
          display: block;
          margin-bottom: 7px;
          color: #526b7b;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: 0.08em;
        }

        .collection-summary strong {
          display: block;
          color: #dce8f0;
          font-size: 13px;
        }

        .purple-text {
          color: #bd8cff !important;
        }

        .red-text {
          color: #ff7078 !important;
        }

        /* =====================================================
           DRAWER ACTIONS
           ===================================================== */

        .drawer-actions {
          position: sticky;
          bottom: 0;
          z-index: 5;
          display: flex;
          gap: 9px;
          padding: 15px 22px 18px;
          border-top: 1px solid #182229;
          background: rgba(
            8,
            14,
            19,
            0.97
          );
          backdrop-filter: blur(12px);
        }

        .primary-action,
        .secondary-action {
          min-height: 43px;
          padding: 0 15px;
          border-radius: 9px;
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
          transition: 0.18s ease;
        }

        .primary-action {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #0e72ad;
          background: #092237;
          color: #5ebeff;
        }

        .primary-action:hover {
          background: #0c2e48;
          border-color: #1598ff;
        }

        .action-arrow {
          margin-left: 8px;
          font-size: 14px;
        }

        .secondary-action {
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #245d43;
          background: #0a1b14;
          color: #64d99c;
        }

        .secondary-action:hover {
          border-color: #3c9d6c;
          background: #0d281e;
        }

        .secondary-action span {
          margin-right: 6px;
        }

        /* =====================================================
           REMINDER MODAL
           ===================================================== */

        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 120;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(
            0,
            0,
            0,
            0.72
          );
          backdrop-filter: blur(5px);
        }

        .reminder-modal {
          width: min(480px, 100%);
          border: 1px solid #22333f;
          border-radius: 15px;
          background: #080e13;
          box-shadow:
            0 25px 80px
              rgba(0, 0, 0, 0.55);
          overflow: hidden;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          padding: 22px;
          border-bottom: 1px solid #182229;
        }

        .modal-header h2 {
          margin: 0;
          color: #e5f0f7;
          font-size: 20px;
        }

        .reminder-customer {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 18px 22px;
          padding: 13px;
          border: 1px solid #192b36;
          border-radius: 10px;
          background: #060b0f;
        }

        .reminder-customer strong,
        .reminder-customer span {
          display: block;
        }

        .reminder-customer strong {
          color: #dce8f0;
          font-size: 12px;
        }

        .reminder-customer span {
          margin-top: 3px;
          color: #637a89;
          font-size: 9px;
        }

        .reminder-balance {
          margin: 0 22px 18px;
          padding: 15px;
          border: 1px solid #382d16;
          border-radius: 10px;
          background: #151107;
        }

        .reminder-balance span {
          display: block;
          color: #9c8144;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.1em;
        }

        .reminder-balance strong {
          display: block;
          margin-top: 5px;
          color: #f0c45e;
          font-size: 22px;
        }

        .reminder-note {
          display: flex;
          gap: 10px;
          margin: 0 22px;
          padding: 12px;
          border: 1px solid #183448;
          border-radius: 9px;
          background: #07131c;
        }

        .reminder-note p {
          margin: 0;
          color: #718795;
          font-size: 10px;
          line-height: 1.55;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 9px;
          padding: 20px 22px;
          margin-top: 20px;
          border-top: 1px solid #182229;
        }

        .disabled-action {
          flex: none;
          opacity: 0.45;
          cursor: not-allowed;
        }

        /* =====================================================
           RESPONSIVE
           ===================================================== */

        @media (max-width: 1000px) {
          .stats-grid {
            grid-template-columns:
              repeat(
                2,
                minmax(0, 1fr)
              );
          }

          .account-drawer {
            width: min(650px, 96vw);
          }
        }

        @media (max-width: 700px) {
          .topbar {
            padding: 0 18px;
          }

          .top-link {
            display: none;
          }

          .page-container {
            width: calc(100% - 30px);
            padding-top: 32px;
          }

          .page-intro {
            flex-direction: column;
            align-items: flex-start;
          }

          .page-intro h1 {
            font-size: 48px;
          }

          .client-directory {
            height: 620px;
          }

          .stats-grid {
            grid-template-columns: 1fr;
          }

          .client-row {
            grid-template-columns:
              38px
              minmax(0, 1fr)
              16px;
          }

          .client-balance,
          .client-row .status {
            display: none;
          }

          .account-drawer {
            width: 100%;
            border-left: 0;
          }

          .drawer-header {
            min-height: 90px;
            padding: 16px;
          }

          .drawer-title h2 {
            font-size: 18px;
          }

          .identity-meta {
            display: none;
          }

          .drawer-section {
            padding: 18px 16px;
          }

          .financial-grid {
            grid-template-columns: 1fr 1fr;
          }

          .information-grid {
            grid-template-columns: 1fr;
          }

          .information-item.wide {
            grid-column: auto;
          }

          .schedule-grid {
            grid-template-columns: 1fr 1fr;
          }

          .collection-summary {
            grid-template-columns: 1fr;
          }

          .drawer-actions {
            padding: 13px 16px 16px;
            flex-direction: column;
          }

          .secure-session {
            padding: 8px 10px;
            font-size: 9px;
          }
        }

        @media (max-width: 430px) {
          .financial-grid {
            grid-template-columns: 1fr;
          }

          .schedule-grid {
            grid-template-columns: 1fr;
          }

          .drawer-identity {
            gap: 10px;
          }

          .large-avatar {
            width: 48px;
            height: 48px;
          }

          .close-button {
            width: 34px;
            height: 34px;
          }
        }

        /* =========================================================
           READABILITY PASS
           The previous accounting UI was using dashboard-scale text
           (9-11px) almost everywhere. This pass deliberately makes
           the directory readable at normal browser zoom.
           ========================================================= */

        .accounting-page {
          font-size: 14px !important;
        }

        .accounting-page .page-container {
          width: min(1500px, calc(100% - 56px)) !important;
          max-width: none !important;
          padding-top: 38px !important;
        }

        .accounting-page .page-intro {
          margin-bottom: 28px !important;
        }

        .accounting-page .breadcrumb {
          font-size: 11px !important;
          letter-spacing: .09em !important;
        }

        .accounting-page .page-intro h1 {
          font-size: clamp(38px, 4vw, 56px) !important;
          line-height: 1 !important;
        }

        .accounting-page .page-intro p {
          margin-top: 12px !important;
          font-size: 14px !important;
          line-height: 1.55 !important;
          color: #7e96a6 !important;
        }

        .accounting-page .refresh-button {
          min-height: 48px !important;
          padding: 0 18px !important;
          font-size: 12px !important;
        }

        /* TOP SUMMARY */

        .accounting-page .stats-grid {
          gap: 16px !important;
          margin-bottom: 24px !important;
        }

        .accounting-page .stat-card {
          min-height: 128px !important;
          padding: 22px !important;
          gap: 17px !important;
        }

        .accounting-page .stat-icon {
          width: 52px !important;
          height: 52px !important;
          font-size: 20px !important;
        }

        .accounting-page .stat-label {
          margin-bottom: 8px !important;
          font-size: 10px !important;
        }

        .accounting-page .stat-value {
          font-size: 25px !important;
        }

        .accounting-page .stat-content small {
          margin-top: 7px !important;
          font-size: 11px !important;
        }

        /* DIRECTORY */

        .accounting-page .client-directory {
          height: 700px !important;
          border-radius: 16px !important;
        }

        .accounting-page .directory-header {
          padding: 26px 28px !important;
        }

        .accounting-page .panel-kicker {
          margin-bottom: 9px !important;
          font-size: 10px !important;
        }

        .accounting-page .directory-header h2 {
          font-size: 25px !important;
          line-height: 1.2 !important;
        }

        .accounting-page .directory-header p {
          margin-top: 9px !important;
          font-size: 13px !important;
          line-height: 1.45 !important;
        }

        .accounting-page .client-count {
          min-width: 44px !important;
          height: 38px !important;
          font-size: 13px !important;
        }

        .accounting-page .filters {
          padding: 18px !important;
        }

        .accounting-page .search-wrapper {
          margin-bottom: 12px !important;
        }

        .accounting-page .search-wrapper span {
          left: 16px !important;
          font-size: 19px !important;
        }

        .accounting-page .filters input,
        .accounting-page .filters select {
          height: 50px !important;
          font-size: 13px !important;
          border-radius: 11px !important;
        }

        .accounting-page .filters input {
          padding-left: 43px !important;
        }

        .accounting-page .filters select {
          padding-left: 14px !important;
        }

        .accounting-page .filter-row {
          gap: 12px !important;
        }

        .accounting-page .directory-summary {
          padding: 13px 20px !important;
          font-size: 11px !important;
        }

        /* CUSTOMER ROWS: this is the main readability fix */

        .accounting-page .client-list {
          scrollbar-width: auto !important;
        }

        .accounting-page .client-list::-webkit-scrollbar {
          width: 11px !important;
        }

        .accounting-page .client-list::-webkit-scrollbar-thumb {
          border-radius: 999px !important;
          border: 3px solid #060b0f !important;
          background: #24536f !important;
        }

        .accounting-page .client-row {
          width: 100% !important;
          min-height: 92px !important;
          display: grid !important;
          grid-template-columns: 52px minmax(0, 1fr) 150px 105px 24px !important;
          align-items: center !important;
          gap: 18px !important;
          padding: 17px 22px !important;
          text-align: left !important;
        }

        .accounting-page .client-row:hover {
          background: #0b151d !important;
        }

        .accounting-page .client-row.selected {
          background: #0b1c28 !important;
          box-shadow: inset 3px 0 0 #1699ed !important;
        }

        .accounting-page .client-avatar {
          width: 52px !important;
          height: 52px !important;
          border-radius: 14px !important;
          font-size: 14px !important;
        }

        .accounting-page .client-main {
          min-width: 0 !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: flex-start !important;
          gap: 5px !important;
        }

        .accounting-page .client-main strong {
          display: block !important;
          color: #edf6fb !important;
          font-size: 16px !important;
          line-height: 1.25 !important;
          font-weight: 850 !important;
        }

        .accounting-page .client-main span {
          display: block !important;
          color: #7e9caf !important;
          font-size: 11px !important;
          line-height: 1.2 !important;
        }

        .accounting-page .client-main small {
          display: block !important;
          color: #557384 !important;
          font-size: 11px !important;
          line-height: 1.25 !important;
        }

        .accounting-page .client-balance {
          min-width: 0 !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: flex-end !important;
          gap: 4px !important;
        }

        .accounting-page .client-balance strong {
          color: #e9f4fa !important;
          font-size: 15px !important;
          line-height: 1.2 !important;
          font-weight: 900 !important;
        }

        .accounting-page .client-balance span {
          color: #6a8494 !important;
          font-size: 9px !important;
          text-transform: uppercase !important;
          letter-spacing: .1em !important;
        }

        .accounting-page .client-row .status {
          justify-self: center !important;
          min-width: 76px !important;
          padding: 7px 9px !important;
          text-align: center !important;
          font-size: 10px !important;
          line-height: 1 !important;
        }

        .accounting-page .client-row .chevron {
          font-size: 24px !important;
          color: #607b8a !important;
        }

        /* Make the whole page use stronger contrast. */
        .accounting-page .client-row,
        .accounting-page .directory-summary,
        .accounting-page .filters {
          border-color: #1c303c !important;
        }

        @media (max-width: 1000px) {
          .accounting-page .client-row {
            grid-template-columns: 50px minmax(0, 1fr) 125px 88px 20px !important;
            gap: 13px !important;
          }
        }

        @media (max-width: 760px) {
          .accounting-page .page-container {
            width: calc(100% - 28px) !important;
          }

          .accounting-page .client-directory {
            height: 680px !important;
          }

          .accounting-page .client-row {
            grid-template-columns: 48px minmax(0, 1fr) 22px !important;
            min-height: 86px !important;
            padding: 15px !important;
          }

          .accounting-page .client-balance,
          .accounting-page .client-row .status {
            display: none !important;
          }

          .accounting-page .client-main strong {
            font-size: 15px !important;
          }

          .accounting-page .client-main span,
          .accounting-page .client-main small {
            font-size: 10px !important;
          }
        }

        @media (max-width: 500px) {
          .accounting-page .page-container {
            width: calc(100% - 20px) !important;
            padding-top: 24px !important;
          }

          .accounting-page .directory-header {
            padding: 20px !important;
          }

          .accounting-page .filters {
            padding: 12px !important;
          }

          .accounting-page .filter-row {
            grid-template-columns: 1fr !important;
          }
        }


        /* =========================================================
           CLEAN CUSTOMER ACCOUNT DRAWER
           ========================================================= */

        .account-drawer-backdrop {
          z-index: 1000 !important;
          background: rgba(0, 0, 0, .78) !important;
          backdrop-filter: blur(8px) !important;
        }

        .account-drawer-backdrop .account-drawer {
          width: min(860px, 72vw) !important;
          min-width: 700px !important;
          max-width: 860px !important;
          height: 100vh !important;
          border-left: 1px solid #243c4a !important;
          background: #071016 !important;
          box-shadow: -28px 0 90px rgba(0,0,0,.65) !important;
        }

        .account-drawer-backdrop .account-drawer-scroll {
          height: 100% !important;
          overflow-y: auto !important;
          overflow-x: hidden !important;
          scrollbar-width: auto !important;
          scrollbar-color: #2a617f #050a0e !important;
        }

        .account-drawer-backdrop .account-drawer-scroll::-webkit-scrollbar {
          width: 11px !important;
        }

        .account-drawer-backdrop .account-drawer-scroll::-webkit-scrollbar-track {
          background: #050a0e !important;
        }

        .account-drawer-backdrop .account-drawer-scroll::-webkit-scrollbar-thumb {
          background: #24566f !important;
          border: 3px solid #050a0e !important;
          border-radius: 999px !important;
        }

        /* ---------- HEADER ---------- */

        .account-drawer-backdrop .drawer-header {
          position: sticky !important;
          top: 0 !important;
          z-index: 50 !important;
          min-height: 132px !important;
          padding: 24px 28px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          gap: 20px !important;
          background: rgba(7,16,22,.98) !important;
          border-bottom: 1px solid #1d3441 !important;
          backdrop-filter: blur(18px) !important;
        }

        .account-drawer-backdrop .drawer-identity {
          min-width: 0 !important;
          display: flex !important;
          align-items: center !important;
          gap: 17px !important;
        }

        .account-drawer-backdrop .large-avatar {
          flex: 0 0 auto !important;
          width: 64px !important;
          height: 64px !important;
          border-radius: 17px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-size: 21px !important;
          background: #082033 !important;
          border: 1px solid #0b86c9 !important;
          color: #4ab8ff !important;
        }

        .account-drawer-backdrop .drawer-title {
          min-width: 0 !important;
        }

        .account-drawer-backdrop .drawer-title .panel-kicker {
          margin-bottom: 5px !important;
          font-size: 9px !important;
          color: #1ca4ff !important;
          letter-spacing: .14em !important;
        }

        .account-drawer-backdrop .drawer-title h2 {
          margin: 0 !important;
          color: #f1f7fa !important;
          font-size: 28px !important;
          line-height: 1.15 !important;
          font-weight: 850 !important;
          letter-spacing: -.025em !important;
        }

        .account-drawer-backdrop .identity-meta {
          display: flex !important;
          flex-wrap: wrap !important;
          gap: 6px !important;
          margin-top: 9px !important;
        }

        .account-drawer-backdrop .identity-meta span {
          padding: 5px 8px !important;
          color: #7792a2 !important;
          background: #09151c !important;
          border: 1px solid #1e3744 !important;
          border-radius: 7px !important;
          font-size: 8px !important;
        }

        .account-drawer-backdrop .close-button {
          flex: 0 0 auto !important;
          width: 44px !important;
          height: 44px !important;
          border-radius: 11px !important;
          border: 1px solid #29424f !important;
          background: #09141b !important;
          color: #90a6b2 !important;
          font-size: 24px !important;
        }

        /* ---------- STATUS BAR ---------- */

        .account-drawer-backdrop .drawer-status-row {
          min-height: 54px !important;
          padding: 12px 28px !important;
          display: flex !important;
          align-items: center !important;
          gap: 12px !important;
          background: #060d12 !important;
          border-bottom: 1px solid #172c38 !important;
        }

        .account-drawer-backdrop .drawer-status-row .status {
          display: inline-flex !important;
          align-items: center !important;
          min-height: 29px !important;
          padding: 6px 10px !important;
          font-size: 10px !important;
          border-radius: 999px !important;
        }

        /* ---------- SECTION SPACING ---------- */

        .account-drawer-backdrop .drawer-section {
          padding: 25px 28px !important;
          border-bottom: 1px solid #172b36 !important;
        }

        .account-drawer-backdrop .section-heading {
          margin: 0 0 16px !important;
          display: flex !important;
          align-items: flex-end !important;
          justify-content: space-between !important;
        }

        .account-drawer-backdrop .section-heading h3 {
          margin: 3px 0 0 !important;
          color: #e8f1f5 !important;
          font-size: 18px !important;
          line-height: 1.25 !important;
          font-weight: 850 !important;
        }

        .account-drawer-backdrop .section-heading .panel-kicker {
          font-size: 9px !important;
          color: #1ca4ff !important;
          letter-spacing: .14em !important;
        }

        /* ---------- FINANCIAL SUMMARY ---------- */

        .account-drawer-backdrop .financial-section {
          padding-top: 22px !important;
          padding-bottom: 22px !important;
        }

        .account-drawer-backdrop .financial-grid {
          display: grid !important;
          grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          gap: 10px !important;
        }

        .account-drawer-backdrop .financial-card {
          min-width: 0 !important;
          min-height: 92px !important;
          padding: 14px !important;
          border-radius: 11px !important;
          border: 1px solid #203742 !important;
          background: #09141b !important;
        }

        .account-drawer-backdrop .financial-card span {
          display: block !important;
          margin-bottom: 10px !important;
          color: #668292 !important;
          font-size: 8px !important;
          font-weight: 950 !important;
          letter-spacing: .11em !important;
        }

        .account-drawer-backdrop .financial-card strong {
          display: block !important;
          color: #edf5f8 !important;
          font-size: 17px !important;
          line-height: 1.2 !important;
          font-weight: 900 !important;
        }

        /* ---------- COLLECTION ---------- */

        .account-drawer-backdrop .progress-value {
          color: #58dda0 !important;
          font-size: 18px !important;
        }

        .account-drawer-backdrop .progress-track {
          height: 10px !important;
          margin-top: 3px !important;
          border-radius: 999px !important;
          background: #172932 !important;
          overflow: hidden !important;
        }

        .account-drawer-backdrop .progress-fill {
          height: 100% !important;
          border-radius: inherit !important;
          background: #32db8b !important;
        }

        .account-drawer-backdrop .progress-meta {
          display: flex !important;
          justify-content: space-between !important;
          margin-top: 9px !important;
          color: #698493 !important;
          font-size: 9px !important;
        }

        /* =========================================================
           INFORMATION CARDS
           The key change: label and value are independent rows.
           ========================================================= */

        .account-drawer-backdrop .information-groups {
          display: flex !important;
          flex-direction: column !important;
          gap: 14px !important;
        }

        .account-drawer-backdrop .information-group {
          padding: 15px !important;
          border: 1px solid #203742 !important;
          border-radius: 12px !important;
          background: #08131a !important;
        }

        .account-drawer-backdrop .information-group-title {
          margin: 0 0 12px !important;
          color: #159fff !important;
          font-size: 9px !important;
          line-height: 1 !important;
          font-weight: 950 !important;
          letter-spacing: .13em !important;
        }

        .account-drawer-backdrop .information-grid {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 9px !important;
        }

        .account-drawer-backdrop .information-item {
          min-width: 0 !important;
          min-height: 78px !important;
          padding: 12px 13px !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: flex-start !important;
          justify-content: flex-start !important;
          gap: 7px !important;
          box-sizing: border-box !important;
          border: 1px solid #1b303b !important;
          border-radius: 9px !important;
          background: #0a161e !important;
        }

        .account-drawer-backdrop .information-item.wide {
          grid-column: 1 / -1 !important;
          min-height: 76px !important;
        }

        .account-drawer-backdrop .information-item .information-label {
          display: block !important;
          width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          color: #718b9a !important;
          font-size: 8px !important;
          line-height: 1.1 !important;
          font-weight: 950 !important;
          letter-spacing: .1em !important;
          text-transform: uppercase !important;
          white-space: normal !important;
        }

        .account-drawer-backdrop .information-item .information-value {
          display: block !important;
          width: 100% !important;
          min-width: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          color: #eef6f9 !important;
          font-size: 13px !important;
          line-height: 1.4 !important;
          font-weight: 750 !important;
          white-space: normal !important;
          overflow: visible !important;
          text-overflow: clip !important;
          overflow-wrap: anywhere !important;
          word-break: break-word !important;
        }

        /* ---------- BILLING / COLLECTION GRIDS ---------- */

        .account-drawer-backdrop .schedule-grid {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 9px !important;
        }

        .account-drawer-backdrop .schedule-grid > div {
          min-height: 65px !important;
          padding: 12px !important;
          border: 1px solid #1b303b !important;
          border-radius: 9px !important;
          background: #0a161e !important;
        }

        .account-drawer-backdrop .schedule-grid span {
          display: block !important;
          margin-bottom: 7px !important;
          color: #718b9a !important;
          font-size: 8px !important;
          font-weight: 950 !important;
          letter-spacing: .1em !important;
        }

        .account-drawer-backdrop .schedule-grid strong {
          display: block !important;
          color: #e6f0f4 !important;
          font-size: 12px !important;
          line-height: 1.3 !important;
          white-space: normal !important;
        }

        .account-drawer-backdrop .collection-summary {
          gap: 9px !important;
        }

        /* ---------- ACTION FOOTER ---------- */

        .account-drawer-backdrop .drawer-actions {
          position: sticky !important;
          bottom: 0 !important;
          z-index: 60 !important;
          display: flex !important;
          gap: 10px !important;
          padding: 14px 28px 18px !important;
          background: rgba(7,16,22,.98) !important;
          border-top: 1px solid #203742 !important;
          backdrop-filter: blur(18px) !important;
        }

        .account-drawer-backdrop .primary-action,
        .account-drawer-backdrop .secondary-action {
          min-height: 48px !important;
          border-radius: 10px !important;
          font-size: 11px !important;
          font-weight: 900 !important;
        }

        .account-drawer-backdrop .primary-action {
          flex: 1 !important;
        }

        .account-drawer-backdrop .secondary-action {
          min-width: 150px !important;
        }

        /* ---------- TABLET / MOBILE ---------- */

        @media (max-width: 1050px) {
          .account-drawer-backdrop .account-drawer {
            width: min(760px, 72vw) !important;
            min-width: 620px !important;
          }
        }

        @media (max-width: 760px) {
          .account-drawer-backdrop .account-drawer {
            width: 100vw !important;
            min-width: 0 !important;
            max-width: none !important;
          }

          .account-drawer-backdrop .drawer-header,
          .account-drawer-backdrop .drawer-section,
          .account-drawer-backdrop .drawer-status-row {
            padding-left: 18px !important;
            padding-right: 18px !important;
          }

          .account-drawer-backdrop .information-grid,
          .account-drawer-backdrop .schedule-grid {
            grid-template-columns: 1fr !important;
          }

          .account-drawer-backdrop .information-item.wide {
            grid-column: auto !important;
          }

          .account-drawer-backdrop .financial-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .account-drawer-backdrop .drawer-actions {
            padding-left: 18px !important;
            padding-right: 18px !important;
          }
        }

        @media (max-width: 460px) {
          .account-drawer-backdrop .financial-grid {
            grid-template-columns: 1fr !important;
          }

          .account-drawer-backdrop .drawer-title h2 {
            font-size: 22px !important;
          }

          .account-drawer-backdrop .large-avatar {
            width: 54px !important;
            height: 54px !important;
          }

          .account-drawer-backdrop .drawer-actions {
            flex-direction: column !important;
          }

          .account-drawer-backdrop .secondary-action {
            width: 100% !important;
          }
        }


        /* =========================================================
           SMS REMINDER MODAL
           z-index intentionally sits ABOVE the account drawer.
           ========================================================= */

        .modal-backdrop {
          position: fixed !important;
          inset: 0 !important;
          z-index: 5000 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 24px !important;
          background: rgba(0, 0, 0, .82) !important;
          backdrop-filter: blur(9px) !important;
        }

        .reminder-modal {
          position: relative !important;
          z-index: 5001 !important;
          width: min(620px, calc(100vw - 48px)) !important;
          max-height: calc(100vh - 48px) !important;
          overflow-y: auto !important;
          border: 1px solid #294453 !important;
          border-radius: 18px !important;
          background: #071016 !important;
          box-shadow:
            0 35px 100px rgba(0,0,0,.72),
            0 0 0 1px rgba(18,150,224,.08) !important;
        }

        .reminder-modal .modal-header {
          padding: 24px 26px !important;
          border-bottom: 1px solid #1c303c !important;
          display: flex !important;
          align-items: flex-start !important;
          justify-content: space-between !important;
          gap: 18px !important;
        }

        .reminder-modal .modal-header h2 {
          margin: 5px 0 0 !important;
          color: #f0f7fa !important;
          font-size: 25px !important;
          line-height: 1.2 !important;
        }

        .modal-subtitle {
          margin: 8px 0 0 !important;
          color: #718b9a !important;
          font-size: 12px !important;
          line-height: 1.45 !important;
        }

        .reminder-customer {
          margin: 20px 26px 12px !important;
          padding: 15px !important;
          display: flex !important;
          align-items: center !important;
          gap: 13px !important;
          border: 1px solid #203742 !important;
          border-radius: 12px !important;
          background: #0a161e !important;
        }

        .reminder-customer-copy {
          min-width: 0 !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 4px !important;
        }

        .reminder-customer-copy strong {
          color: #eef6f9 !important;
          font-size: 15px !important;
        }

        .reminder-customer-copy span {
          color: #718b9a !important;
          font-size: 10px !important;
        }

        .reminder-customer-copy small {
          color: #2eb2ff !important;
          font-size: 11px !important;
          font-weight: 800 !important;
        }

        .reminder-balance {
          margin: 0 26px 18px !important;
          padding: 15px 16px !important;
          border: 1px solid #2b4b59 !important;
          border-radius: 12px !important;
          background: #091820 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          gap: 15px !important;
        }

        .reminder-balance span {
          color: #718b9a !important;
          font-size: 9px !important;
          font-weight: 950 !important;
          letter-spacing: .1em !important;
        }

        .reminder-balance strong {
          color: #f2f8fb !important;
          font-size: 20px !important;
        }

        .reminder-field {
          margin: 0 26px !important;
        }

        .reminder-field label {
          display: block !important;
          margin-bottom: 8px !important;
          color: #1ca4ff !important;
          font-size: 9px !important;
          font-weight: 950 !important;
          letter-spacing: .12em !important;
        }

        .reminder-field textarea {
          width: 100% !important;
          min-height: 145px !important;
          resize: vertical !important;
          padding: 14px !important;
          border: 1px solid #294453 !important;
          border-radius: 11px !important;
          outline: none !important;
          background: #050d12 !important;
          color: #edf6f9 !important;
          font: inherit !important;
          font-size: 13px !important;
          line-height: 1.55 !important;
        }

        .reminder-field textarea:focus {
          border-color: #149df0 !important;
          box-shadow: 0 0 0 3px rgba(20,157,240,.1) !important;
        }

        .reminder-field textarea:disabled {
          opacity: .65 !important;
        }

        .message-counter {
          display: flex !important;
          justify-content: space-between !important;
          gap: 15px !important;
          margin-top: 7px !important;
          color: #5f7988 !important;
          font-size: 9px !important;
          line-height: 1.35 !important;
        }

        .message-counter strong {
          flex: 0 0 auto !important;
          color: #7894a3 !important;
        }

        .reminder-safety-note {
          margin: 14px 26px 0 !important;
          padding: 11px 13px !important;
          display: flex !important;
          gap: 10px !important;
          border: 1px solid #263c47 !important;
          border-radius: 10px !important;
          background: #08131a !important;
        }

        .reminder-safety-note > span {
          flex: 0 0 auto !important;
          width: 20px !important;
          height: 20px !important;
          display: grid !important;
          place-items: center !important;
          border-radius: 50% !important;
          background: #0d2634 !important;
          color: #55bfff !important;
          font-weight: 900 !important;
        }

        .reminder-safety-note p {
          margin: 0 !important;
          color: #718b9a !important;
          font-size: 10px !important;
          line-height: 1.45 !important;
        }

        .reminder-result {
          margin: 13px 26px 0 !important;
          padding: 11px 13px !important;
          display: flex !important;
          gap: 10px !important;
          align-items: flex-start !important;
          border-radius: 10px !important;
        }

        .reminder-result.success {
          border: 1px solid #246b4d !important;
          background: #071b13 !important;
          color: #63dfa2 !important;
        }

        .reminder-result.error {
          border: 1px solid #70413f !important;
          background: #21100f !important;
          color: #ff9c92 !important;
        }

        .reminder-result span {
          flex: 0 0 auto !important;
          font-weight: 950 !important;
        }

        .reminder-result p {
          margin: 0 !important;
          color: inherit !important;
          font-size: 11px !important;
          line-height: 1.4 !important;
        }

        .reminder-modal .modal-actions {
          margin-top: 20px !important;
          padding: 15px 26px 20px !important;
          display: flex !important;
          justify-content: flex-end !important;
          gap: 10px !important;
          border-top: 1px solid #1c303c !important;
          background: #071016 !important;
        }

        .reminder-modal .modal-actions button {
          min-height: 46px !important;
          border-radius: 10px !important;
          padding: 0 17px !important;
          font-size: 11px !important;
          font-weight: 900 !important;
        }

        .reminder-modal .modal-actions .primary-action {
          min-width: 175px !important;
        }

        .button-spinner {
          width: 14px !important;
          height: 14px !important;
          margin-right: 7px !important;
          border: 2px solid rgba(255,255,255,.25) !important;
          border-top-color: currentColor !important;
          border-radius: 50% !important;
          animation: sms-spin .7s linear infinite !important;
        }

        @keyframes sms-spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 600px) {
          .modal-backdrop {
            padding: 12px !important;
          }

          .reminder-modal {
            width: 100% !important;
            max-height: calc(100vh - 24px) !important;
          }

          .reminder-modal .modal-header,
          .reminder-customer,
          .reminder-balance,
          .reminder-field,
          .reminder-safety-note,
          .reminder-result {
            margin-left: 16px !important;
            margin-right: 16px !important;
          }

          .reminder-modal .modal-header {
            padding: 20px 16px !important;
          }

          .reminder-customer {
            margin-top: 16px !important;
          }

          .reminder-modal .modal-actions {
            padding-left: 16px !important;
            padding-right: 16px !important;
          }

          .reminder-modal .modal-actions {
            flex-direction: column-reverse !important;
          }

          .reminder-modal .modal-actions button {
            width: 100% !important;
          }
        }

      `}</style>
    </main>
  );
}

/* =============================================================
   SMALL REUSABLE CUSTOMER INFORMATION COMPONENT
   ============================================================= */

function InfoItem({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string | null;
  wide?: boolean;
}) {
  return (
    <div
      className={`information-item ${
        wide ? "wide" : ""
      }`}
    >
      <span className="information-label">{label}</span>

      <strong className="information-value">
        {value && value.trim()
          ? value
          : "—"}
      </strong>
    </div>
  );
}