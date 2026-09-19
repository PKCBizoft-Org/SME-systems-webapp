"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabaseClient";

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

function getInitials(name: string | null) {
  if (!name) return "?";

  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
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
      (payment) =>
        payment.billing_id === bill.id
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
  const paid = getBillPaidAmount(
    bill,
    payments
  );

  const remaining = Math.max(
    amount - paid,
    0
  );

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

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="detail-item">
      <span>{label}</span>

      <strong>
        {value === null ||
        value === undefined ||
        value === ""
          ? "—"
          : value}
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

  const [client, setClient] =
    useState<Client | null>(null);

  const [billing, setBilling] =
    useState<BillingRecord[]>([]);

  const [payments, setPayments] =
    useState<PaymentRecord[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [paymentsError, setPaymentsError] =
    useState<string | null>(null);

  const [billingError, setBillingError] =
    useState<string | null>(null);

  const [reminderOpen, setReminderOpen] =
    useState(false);

  const [activeSection, setActiveSection] =
    useState<
      "overview" | "billing" | "payments"
    >("overview");

  async function loadAccount() {
    setLoading(true);
    setPaymentsError(null);
    setBillingError(null);

    try {
      const clientResult =
        await supabase
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
          .eq("id", clientId)
          .maybeSingle();

      if (clientResult.error) {
        throw new Error(
          clientResult.error.message
        );
      }

      if (!clientResult.data) {
        setClient(null);
        return;
      }

      setClient(
        clientResult.data as Client
      );

      const billingResult =
        await supabase
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
          .eq("client_id", clientId)
          .order("bill_date", {
            ascending: false,
          });

      if (billingResult.error) {
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

      let paymentsResult =
        await supabase
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
          .eq("client_id", clientId)
          .order("payment_date", {
            ascending: false,
          });

      if (
        paymentsResult.error?.message
          ?.toLowerCase()
          .includes("jwt issued at future")
      ) {
        const refreshResult =
          await supabase.auth.refreshSession();

        if (!refreshResult.error) {
          paymentsResult =
            await supabase
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
              .eq("client_id", clientId)
              .order("payment_date", {
                ascending: false,
              });
        }
      }

      if (paymentsResult.error) {
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
    } catch (error) {
      console.error(
        "Accounting customer error:",
        error
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (clientId) {
      void loadAccount();
    }
  }, [clientId]);

  const financials = useMemo(() => {
    const totalBilled = billing.reduce(
      (sum, bill) =>
        sum + getBillAmount(bill),
      0
    );

    const totalPaid = payments.reduce(
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

    const overdue = billing.reduce(
      (sum, bill) => {
        if (
          getBillStatus(
            bill,
            payments
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
                payments
              ),
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

    return {
      totalBilled,
      totalPaid,
      outstanding,
      overdue,
      progress,
    };
  }, [billing, payments]);

  const openBills = useMemo(() => {
    return billing.filter((bill) => {
      const status = getBillStatus(
        bill,
        payments
      );

      return (
        status === "Unpaid" ||
        status === "Partial" ||
        status === "Overdue"
      );
    });
  }, [billing, payments]);

  if (loading) {
    return (
      <main className="page">
        <div className="loading-page">
          <div className="loading-ring" />
          <span>
            Loading customer account...
          </span>
        </div>

        <style jsx>{`
          .page {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #03070a;
            color: #8297a9;
            font-family:
              Arial,
              Helvetica,
              sans-serif;
          }

          .loading-page {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            font-size: 12px;
          }

          .loading-ring {
            width: 30px;
            height: 30px;
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
        `}</style>
      </main>
    );
  }

  if (!client) {
    return (
      <main className="page">
        <div className="not-found">
          <div className="empty-icon">
            !
          </div>

          <div className="panel-kicker">
            ACCOUNTING
          </div>

          <h1>
            Customer not found
          </h1>

          <p>
            This customer account could not
            be loaded.
          </p>

          <button
            type="button"
            className="primary-button"
            onClick={() =>
              router.push("/accounting")
            }
          >
            ← Back to Accounting
          </button>
        </div>

        <style jsx>{`
          .page {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #03070a;
            color: #eaf2fa;
            font-family:
              Arial,
              Helvetica,
              sans-serif;
          }

          .not-found {
            text-align: center;
          }

          .empty-icon {
            width: 58px;
            height: 58px;
            margin: 0 auto 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px solid #642126;
            border-radius: 15px;
            background: #210b0d;
            color: #ff737b;
            font-size: 22px;
            font-weight: 900;
          }

          .panel-kicker {
            margin-bottom: 8px;
            color: #138fff;
            font-size: 9px;
            font-weight: 900;
            letter-spacing: 0.14em;
          }

          h1 {
            margin: 0;
            font-size: 28px;
          }

          p {
            color: #617788;
            font-size: 12px;
          }

          .primary-button {
            height: 42px;
            padding: 0 16px;
            border: 1px solid #0e72ad;
            border-radius: 9px;
            background: #092237;
            color: #5ebeff;
            font-weight: 900;
            cursor: pointer;
          }
        `}</style>
      </main>
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
          <button
            type="button"
            className="back-button"
            onClick={() =>
              router.push("/accounting")
            }
          >
            ← Accounting
          </button>

          <div className="secure-session">
            <span className="secure-dot" />
            SECURE SESSION
          </div>
        </div>
      </header>

      <div className="container">
        <div className="breadcrumb">
          <span className="breadcrumb-dot" />
          PKC BIZOFT / ACCOUNTING / CUSTOMER
        </div>

        <section className="customer-header">
          <div className="identity">
            <div className="large-avatar">
              {getInitials(
                client.customer_name
              )}
            </div>

            <div>
              <div className="eyebrow">
                CUSTOMER ACCOUNT
              </div>

              <h1>
                {client.customer_name ||
                  "Unnamed Customer"}
              </h1>

              <div className="identity-meta">
                <span>
                  Account ID:{" "}
                  <strong>
                    {client.account_id ||
                      "—"}
                  </strong>
                </span>

                <span>
                  {client.area ||
                    "No area"}
                </span>

                <span>
                  {client.plan_name ||
                    "No plan"}
                </span>
              </div>
            </div>
          </div>

          <div className="header-actions">
            <span
              className={`status large ${getStatusClass(
                client.account_status ||
                  "Unknown"
              )}`}
            >
              {client.account_status ||
                "Unknown"}
            </span>

            <button
              type="button"
              className="remind-button"
              onClick={() =>
                setReminderOpen(true)
              }
            >
              ↗ Remind Customer
            </button>
          </div>
        </section>

        {(paymentsError ||
          billingError) && (
          <div className="notice">
            <span>!</span>

            <div>
              <strong>
                Some account records could not
                be loaded.
              </strong>

              <small>
                {paymentsError ||
                  billingError}
              </small>
            </div>
          </div>
        )}

        <section className="financial-grid">
          <div className="financial-card">
            <span>
              TOTAL BILLED
            </span>

            <strong>
              {peso.format(
                financials.totalBilled
              )}
            </strong>
          </div>

          <div className="financial-card paid">
            <span>
              TOTAL PAID
            </span>

            <strong>
              {peso.format(
                financials.totalPaid
              )}
            </strong>
          </div>

          <div className="financial-card outstanding">
            <span>
              OUTSTANDING
            </span>

            <strong>
              {peso.format(
                financials.outstanding
              )}
            </strong>
          </div>

          <div className="financial-card overdue">
            <span>
              OVERDUE
            </span>

            <strong>
              {peso.format(
                financials.overdue
              )}
            </strong>
          </div>
        </section>

        <nav className="account-tabs">
          <button
            type="button"
            className={
              activeSection ===
              "overview"
                ? "active"
                : ""
            }
            onClick={() =>
              setActiveSection(
                "overview"
              )
            }
          >
            Overview
          </button>

          <button
            type="button"
            className={
              activeSection ===
              "billing"
                ? "active"
                : ""
            }
            onClick={() =>
              setActiveSection(
                "billing"
              )
            }
          >
            Billing
            <span>
              {billing.length}
            </span>
          </button>

          <button
            type="button"
            className={
              activeSection ===
              "payments"
                ? "active"
                : ""
            }
            onClick={() =>
              setActiveSection(
                "payments"
              )
            }
          >
            Payments
            <span>
              {payments.length}
            </span>
          </button>
        </nav>

        {activeSection ===
          "overview" && (
          <section className="content-grid">
            <div className="main-column">
              <div className="panel">
                <div className="panel-header">
                  <div>
                    <div className="eyebrow">
                      COLLECTION
                    </div>

                    <h2>
                      Payment Progress
                    </h2>
                  </div>

                  <strong className="progress-value">
                    {
                      financials.progress
                    }
                    %
                  </strong>
                </div>

                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${financials.progress}%`,
                    }}
                  />
                </div>

                <div className="progress-meta">
                  <span>
                    Paid{" "}
                    {peso.format(
                      financials.totalPaid
                    )}
                  </span>

                  <span>
                    Billed{" "}
                    {peso.format(
                      financials.totalBilled
                    )}
                  </span>
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <div>
                    <div className="eyebrow">
                      OUTSTANDING
                    </div>

                    <h2>
                      Open Bills
                    </h2>

                    <p>
                      Bills that still have
                      an amount remaining.
                    </p>
                  </div>

                  <span className="record-count">
                    {openBills.length} open
                  </span>
                </div>

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>
                          BILL ID
                        </th>

                        <th>
                          DUE DATE
                        </th>

                        <th>
                          AMOUNT
                        </th>

                        <th>
                          BALANCE
                        </th>

                        <th>
                          STATUS
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {openBills.length ===
                      0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="empty-row"
                          >
                            No outstanding
                            bills.
                          </td>
                        </tr>
                      ) : (
                        openBills
                          .slice(0, 8)
                          .map((bill) => {
                            const amount =
                              getBillAmount(
                                bill
                              );

                            const paid =
                              getBillPaidAmount(
                                bill,
                                payments
                              );

                            const balance =
                              Math.max(
                                amount -
                                  paid,
                                0
                              );

                            const status =
                              getBillStatus(
                                bill,
                                payments
                              );

                            return (
                              <tr
                                key={
                                  bill.id
                                }
                              >
                                <td className="strong">
                                  {bill.bill_id ||
                                    bill.id.slice(
                                      0,
                                      8
                                    )}
                                </td>

                                <td>
                                  {formatDate(
                                    bill.due_date
                                  )}
                                </td>

                                <td>
                                  {peso.format(
                                    amount
                                  )}
                                </td>

                                <td className="balance">
                                  {peso.format(
                                    balance
                                  )}
                                </td>

                                <td>
                                  <span
                                    className={`status ${getStatusClass(
                                      status
                                    )}`}
                                  >
                                    {
                                      status
                                    }
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <aside className="side-column">
              <div className="panel">
                <div className="eyebrow">
                  BILLING SCHEDULE
                </div>

                <h2>
                  Account Cycle
                </h2>

                <div className="schedule-grid">
                  <DetailItem
                    label="Cycle"
                    value={
                      client.billing_cycle
                    }
                  />

                  <DetailItem
                    label="Billing Day"
                    value={
                      client.billing_day
                    }
                  />

                  <DetailItem
                    label="Due Day"
                    value={
                      client.due_day
                    }
                  />

                  <DetailItem
                    label="Disconnect"
                    value={
                      client.disconnect_day
                    }
                  />

                  <DetailItem
                    label="Terminate"
                    value={
                      client.terminate_day
                    }
                  />
                </div>
              </div>

              <div className="panel">
                <div className="eyebrow">
                  CUSTOMER INFORMATION
                </div>

                <h2>
                  Account Details
                </h2>

                <div className="details-grid">
                  <DetailItem
                    label="Customer Name"
                    value={
                      client.customer_name
                    }
                  />

                  <DetailItem
                    label="Account ID"
                    value={
                      client.account_id
                    }
                  />

                  <DetailItem
                    label="Mobile"
                    value={
                      client.mobile_number
                    }
                  />

                  <DetailItem
                    label="Email"
                    value={client.email}
                  />

                  <DetailItem
                    label="Address"
                    value={
                      client.address
                    }
                  />

                  <DetailItem
                    label="Area"
                    value={client.area}
                  />

                  <DetailItem
                    label="Plan"
                    value={
                      client.plan_name
                    }
                  />

                  <DetailItem
                    label="Installation Date"
                    value={formatDate(
                      client.install_date
                    )}
                  />

                  <DetailItem
                    label="Installation Status"
                    value={
                      client.installation_status
                    }
                  />

                  <DetailItem
                    label="PPPoE"
                    value={
                      client.pppoe_name
                    }
                  />

                  <DetailItem
                    label="Technician"
                    value={
                      client.technicians
                    }
                  />

                  <DetailItem
                    label="Referral Code"
                    value={
                      client.referral_code
                    }
                  />
                </div>
              </div>
            </aside>
          </section>
        )}

        {activeSection ===
          "billing" && (
          <section className="panel full-panel">
            <div className="panel-header">
              <div>
                <div className="eyebrow">
                  BILLING HISTORY
                </div>

                <h2>
                  Customer Bills
                </h2>

                <p>
                  Complete billing records
                  associated with this
                  customer.
                </p>
              </div>

              <span className="record-count">
                {billing.length} records
              </span>
            </div>

            <div className="table-scroll large-scroll">
              <table>
                <thead>
                  <tr>
                    <th>
                      BILL ID
                    </th>

                    <th>
                      TYPE
                    </th>

                    <th>
                      BILL DATE
                    </th>

                    <th>
                      DUE DATE
                    </th>

                    <th>
                      PERIOD
                    </th>

                    <th className="right">
                      AMOUNT
                    </th>

                    <th className="right">
                      BALANCE
                    </th>

                    <th>
                      STATUS
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {billing.length ===
                  0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="empty-row"
                      >
                        No billing records
                        found.
                      </td>
                    </tr>
                  ) : (
                    billing.map((bill) => {
                      const amount =
                        getBillAmount(
                          bill
                        );

                      const paid =
                        getBillPaidAmount(
                          bill,
                          payments
                        );

                      const balance =
                        Math.max(
                          amount - paid,
                          0
                        );

                      const status =
                        getBillStatus(
                          bill,
                          payments
                        );

                      return (
                        <tr
                          key={bill.id}
                        >
                          <td className="strong">
                            {bill.bill_id ||
                              bill.id.slice(
                                0,
                                8
                              )}
                          </td>

                          <td>
                            {bill.bill_type ||
                              "—"}
                          </td>

                          <td>
                            {formatDate(
                              bill.bill_date
                            )}
                          </td>

                          <td>
                            {formatDate(
                              bill.due_date
                            )}
                          </td>

                          <td>
                            {bill.billing_period_start &&
                            bill.billing_period_end
                              ? `${formatDate(
                                  bill.billing_period_start
                                )} – ${formatDate(
                                  bill.billing_period_end
                                )}`
                              : "—"}
                          </td>

                          <td className="right">
                            {peso.format(
                              amount
                            )}
                          </td>

                          <td className="right balance">
                            {peso.format(
                              balance
                            )}
                          </td>

                          <td>
                            <span
                              className={`status ${getStatusClass(
                                status
                              )}`}
                            >
                              {
                                status
                              }
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeSection ===
          "payments" && (
          <section className="panel full-panel">
            <div className="panel-header">
              <div>
                <div className="eyebrow">
                  PAYMENT HISTORY
                </div>

                <h2>
                  Customer Payments
                </h2>

                <p>
                  Complete payment and
                  receipt history for this
                  customer.
                </p>
              </div>

              <span className="record-count">
                {payments.length} records
              </span>
            </div>

            <div className="table-scroll large-scroll">
              <table>
                <thead>
                  <tr>
                    <th>
                      RECEIPT
                    </th>

                    <th>
                      PAYMENT ID
                    </th>

                    <th>
                      DATE
                    </th>

                    <th>
                      METHOD
                    </th>

                    <th>
                      BILLING ID
                    </th>

                    <th className="right">
                      AMOUNT
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {payments.length ===
                  0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="empty-row"
                      >
                        {paymentsError
                          ? "Payment records are currently unavailable."
                          : "No payment records found."}
                      </td>
                    </tr>
                  ) : (
                    payments.map(
                      (payment) => (
                        <tr
                          key={
                            payment.id
                          }
                        >
                          <td className="strong">
                            {payment.receipt_number ||
                              "—"}
                          </td>

                          <td>
                            {payment.payment_id ||
                              payment.id.slice(
                                0,
                                8
                              )}
                          </td>

                          <td>
                            {formatDate(
                              payment.payment_date
                            )}
                          </td>

                          <td>
                            <span className="method">
                              {payment.payment_method ||
                                "—"}
                            </span>
                          </td>

                          <td>
                            {payment.billing_id
                              ? payment.billing_id.slice(
                                  0,
                                  8
                                )
                              : "—"}
                          </td>

                          <td className="right payment-amount">
                            {peso.format(
                              Number(
                                payment.amount_paid ||
                                  0
                              )
                            )}
                          </td>
                        </tr>
                      )
                    )
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
                <div className="eyebrow">
                  COLLECTION
                </div>

                <h2>
                  Remind Customer
                </h2>
              </div>

              <button
                type="button"
                className="close-button"
                onClick={() =>
                  setReminderOpen(false)
                }
              >
                ×
              </button>
            </div>

            <div className="reminder-customer">
              <div className="client-avatar">
                {getInitials(
                  client.customer_name
                )}
              </div>

              <div>
                <strong>
                  {client.customer_name ||
                    "Unnamed Customer"}
                </strong>

                <span>
                  {client.account_id ||
                    "No account ID"}
                </span>
              </div>
            </div>

            <div className="reminder-balance">
              <span>
                CURRENT OUTSTANDING
              </span>

              <strong>
                {peso.format(
                  financials.outstanding
                )}
              </strong>

              <small>
                {peso.format(
                  financials.overdue
                )}{" "}
                currently overdue
              </small>
            </div>

            <div className="reminder-note">
              <span>i</span>

              <p>
                The reminder interface is
                prepared for the accounting
                workflow. The actual sending,
                reminder history, and RLS
                permissions will be connected
                in the database step.
              </p>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setReminderOpen(false)
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="primary-button disabled"
                disabled
              >
                Send Reminder
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
              circle at 50% -15%,
              rgba(
                0,
                132,
                255,
                0.08
              ),
              transparent 40%
            ),
            #03070a;
          color: #eaf2fa;
          font-family:
            Arial,
            Helvetica,
            sans-serif;
        }

        .topbar {
          height: 82px;
          padding: 0 40px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #151d24;
          background: rgba(
            3,
            7,
            10,
            0.97
          );
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
          border: 1px solid #0d426b;
          border-radius: 12px;
          background: #071b2d;
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
        }

        .brand-name span {
          color: #148eff;
          font-weight: 900;
        }

        .topbar-right {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .back-button {
          border: 0;
          background: transparent;
          color: #91a5b6;
          font-size: 13px;
          cursor: pointer;
        }

        .back-button:hover {
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
          font-size: 10px;
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
            0 0 12px rgba(
              53,
              229,
              140,
              0.7
            );
        }

        .container {
          width: calc(100% - 60px);
          max-width: 1450px;
          margin: 0 auto;
          padding: 43px 0 70px;
        }

        .breadcrumb {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 18px;
          color: #1598ff;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.14em;
        }

        .customer-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 30px;
          margin-bottom: 20px;
        }

        .identity {
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .large-avatar {
          width: 62px;
          height: 62px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #0d5b8e;
          border-radius: 16px;
          background: #08223a;
          color: #55b9ff;
          font-size: 19px;
          font-weight: 900;
        }

        .eyebrow {
          margin-bottom: 7px;
          color: #138fff;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.14em;
        }

        .customer-header h1 {
          margin: 0;
          color: #edf6ff;
          font-size: 31px;
          letter-spacing: -0.035em;
        }

        .identity-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin-top: 10px;
        }

        .identity-meta span {
          padding: 6px 9px;
          border: 1px solid #1c2b35;
          border-radius: 7px;
          background: #060c10;
          color: #617788;
          font-size: 8px;
        }

        .identity-meta strong {
          color: #b5c7d3;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .status {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: fit-content;
          padding: 5px 8px;
          border-radius: 999px;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: 0.04em;
          white-space: nowrap;
        }

        .status.large {
          padding: 8px 11px;
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

        .remind-button {
          height: 39px;
          padding: 0 13px;
          border: 1px solid #245d43;
          border-radius: 9px;
          background: #0a1b14;
          color: #64d99c;
          font-size: 9px;
          font-weight: 900;
          cursor: pointer;
        }

        .remind-button:hover {
          background: #0d281e;
          border-color: #3c9d6c;
        }

        .notice {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          margin-bottom: 17px;
          padding: 13px;
          border: 1px solid #51400d;
          border-radius: 10px;
          background: #171307;
        }

        .notice > span {
          width: 25px;
          height: 25px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border-radius: 7px;
          background: rgba(
            255,
            190,
            0,
            0.1
          );
          color: #f4cf68;
          font-weight: 900;
        }

        .notice strong,
        .notice small {
          display: block;
        }

        .notice strong {
          color: #f4cf68;
          font-size: 11px;
        }

        .notice small {
          margin-top: 3px;
          color: #8d9eaa;
          font-size: 9px;
        }

        .financial-grid {
          display: grid;
          grid-template-columns: repeat(
            4,
            minmax(0, 1fr)
          );
          gap: 12px;
          margin-bottom: 17px;
        }

        .financial-card {
          padding: 17px;
          border: 1px solid #1b2830;
          border-radius: 12px;
          background: #080e13;
        }

        .financial-card span {
          display: block;
          margin-bottom: 8px;
          color: #5a7282;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.1em;
        }

        .financial-card strong {
          color: #e1edf4;
          font-size: 20px;
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

        .account-tabs {
          display: flex;
          gap: 5px;
          padding: 6px;
          margin-bottom: 16px;
          border: 1px solid #1b252d;
          border-radius: 10px;
          background: #080e13;
        }

        .account-tabs button {
          min-height: 37px;
          padding: 0 14px;
          border: 1px solid transparent;
          border-radius: 7px;
          background: transparent;
          color: #6e8492;
          font-size: 9px;
          font-weight: 900;
          cursor: pointer;
        }

        .account-tabs button:hover {
          color: #cbd9e2;
        }

        .account-tabs button.active {
          border-color: #0e5683;
          background: #092237;
          color: #54b7ff;
        }

        .account-tabs span {
          margin-left: 5px;
          padding: 3px 5px;
          border-radius: 5px;
          background: #101d25;
          color: #668394;
          font-size: 7px;
        }

        .content-grid {
          display: grid;
          grid-template-columns:
            minmax(0, 1.5fr)
            minmax(330px, 0.85fr);
          gap: 16px;
          align-items: start;
        }

        .main-column,
        .side-column {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .panel {
          min-width: 0;
          border: 1px solid #1b252d;
          border-radius: 13px;
          background: #080e13;
          overflow: hidden;
        }

        .panel-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          padding: 20px;
        }

        .panel-header h2,
        .panel > .eyebrow + h2 {
          margin: 0;
          color: #e1edf4;
          font-size: 16px;
        }

        .panel-header p {
          margin: 6px 0 0;
          color: #617788;
          font-size: 10px;
        }

        .progress-value {
          color: #48df95;
          font-size: 20px;
        }

        .progress-track {
          height: 9px;
          margin: 0 20px;
          overflow: hidden;
          border-radius: 999px;
          background: #17242d;
        }

        .progress-fill {
          height: 100%;
          border-radius: inherit;
          background: #35df90;
        }

        .progress-meta {
          display: flex;
          justify-content: space-between;
          padding: 9px 20px 18px;
          color: #5a7180;
          font-size: 8px;
        }

        .panel > .eyebrow,
        .panel > h2 {
          margin-left: 20px;
          margin-right: 20px;
        }

        .panel > .eyebrow {
          margin-top: 20px;
        }

        .panel > h2 {
          margin-bottom: 15px;
        }

        .schedule-grid {
          display: grid;
          grid-template-columns: repeat(
            2,
            minmax(0, 1fr)
          );
          gap: 8px;
          padding: 0 20px 20px;
        }

        .detail-item {
          min-width: 0;
          padding: 11px;
          border: 1px solid #182832;
          border-radius: 8px;
          background: #060b0f;
        }

        .detail-item span {
          display: block;
          margin-bottom: 6px;
          color: #526b7b;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .detail-item strong {
          display: block;
          overflow: hidden;
          color: #b8cad6;
          font-size: 10px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .details-grid {
          display: grid;
          grid-template-columns: repeat(
            2,
            minmax(0, 1fr)
          );
          gap: 1px;
          margin: 0 20px 20px;
          overflow: hidden;
          border: 1px solid #18242c;
          border-radius: 9px;
        }

        .details-grid .detail-item {
          border: 0;
          border-right: 1px solid #18242c;
          border-bottom: 1px solid #18242c;
          border-radius: 0;
        }

        .table-scroll {
          width: 100%;
          max-height: 390px;
          overflow: auto;
          scrollbar-width: thin;
          scrollbar-color: #18384e #060b0f;
        }

        .large-scroll {
          max-height: 620px;
        }

        .table-scroll::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        .table-scroll::-webkit-scrollbar-track {
          background: #060b0f;
        }

        .table-scroll::-webkit-scrollbar-thumb {
          background: #18384e;
          border-radius: 999px;
          border: 2px solid #060b0f;
        }

        .table-scroll::-webkit-scrollbar-thumb:hover {
          background: #245a7d;
        }

        table {
          width: 100%;
          min-width: 760px;
          border-collapse: collapse;
        }

        th {
          position: sticky;
          top: 0;
          z-index: 2;
          padding: 10px 13px;
          text-align: left;
          border-top: 1px solid #141e25;
          border-bottom: 1px solid #18242c;
          background: #060b0f;
          color: #536b7b;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: 0.1em;
          white-space: nowrap;
        }

        td {
          padding: 12px 13px;
          border-bottom: 1px solid #111a20;
          color: #718795;
          font-size: 9px;
          white-space: nowrap;
        }

        tbody tr:hover {
          background: rgba(
            20,
            142,
            255,
            0.025
          );
        }

        .strong {
          color: #dbe8f1 !important;
          font-weight: 900;
        }

        .balance {
          color: #ff737b !important;
          font-weight: 800;
        }

        .payment-amount {
          color: #52df9a !important;
          font-weight: 900;
        }

        .right {
          text-align: right;
        }

        .method {
          padding: 4px 7px;
          border: 1px solid #22313a;
          border-radius: 6px;
          background: #101b22;
          color: #8ba1ae;
          font-size: 8px;
        }

        .empty-row {
          padding: 45px 20px !important;
          text-align: center;
          color: #526775 !important;
        }

        .record-count {
          padding: 6px 9px;
          border: 1px solid #1c303e;
          border-radius: 7px;
          background: #07131c;
          color: #62849a;
          font-size: 8px;
          white-space: nowrap;
        }

        .full-panel {
          width: 100%;
        }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
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
          width: min(470px, 100%);
          overflow: hidden;
          border: 1px solid #22333f;
          border-radius: 15px;
          background: #080e13;
          box-shadow:
            0 25px 80px rgba(
              0,
              0,
              0,
              0.55
            );
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          padding: 21px;
          border-bottom: 1px solid #182229;
        }

        .modal-header h2 {
          margin: 0;
          color: #e5f0f7;
          font-size: 19px;
        }

        .close-button {
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #25343d;
          border-radius: 8px;
          background: #0a1116;
          color: #8398a6;
          font-size: 21px;
          cursor: pointer;
        }

        .close-button:hover {
          border-color: #b33c45;
          color: #ff737b;
        }

        .reminder-customer {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 18px 21px;
          padding: 12px;
          border: 1px solid #192b36;
          border-radius: 10px;
          background: #060b0f;
        }

        .client-avatar {
          width: 38px;
          height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border: 1px solid #12496e;
          border-radius: 10px;
          background: #0a2032;
          color: #4fb5ff;
          font-size: 11px;
          font-weight: 900;
        }

        .reminder-customer strong,
        .reminder-customer span {
          display: block;
        }

        .reminder-customer strong {
          color: #dce8f0;
          font-size: 11px;
        }

        .reminder-customer span {
          margin-top: 3px;
          color: #637a89;
          font-size: 8px;
        }

        .reminder-balance {
          margin: 0 21px 18px;
          padding: 15px;
          border: 1px solid #382d16;
          border-radius: 10px;
          background: #151107;
        }

        .reminder-balance span,
        .reminder-balance small {
          display: block;
        }

        .reminder-balance span {
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

        .reminder-balance small {
          margin-top: 4px;
          color: #78663d;
          font-size: 8px;
        }

        .reminder-note {
          display: flex;
          gap: 10px;
          margin: 0 21px;
          padding: 12px;
          border: 1px solid #183448;
          border-radius: 9px;
          background: #07131c;
        }

        .reminder-note > span {
          color: #52b6ff;
          font-weight: 900;
        }

        .reminder-note p {
          margin: 0;
          color: #718795;
          font-size: 9px;
          line-height: 1.55;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 9px;
          margin-top: 20px;
          padding: 18px 21px;
          border-top: 1px solid #182229;
        }

        .primary-button,
        .secondary-button {
          min-height: 40px;
          padding: 0 14px;
          border-radius: 8px;
          font-size: 9px;
          font-weight: 900;
          cursor: pointer;
        }

        .primary-button {
          border: 1px solid #0e72ad;
          background: #092237;
          color: #5ebeff;
        }

        .secondary-button {
          border: 1px solid #26343d;
          background: #0b1318;
          color: #91a5b6;
        }

        .disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        @media (max-width: 950px) {
          .content-grid {
            grid-template-columns: 1fr;
          }

          .financial-grid {
            grid-template-columns: repeat(
              2,
              minmax(0, 1fr)
            );
          }
        }

        @media (max-width: 700px) {
          .topbar {
            padding: 0 18px;
          }

          .back-button {
            display: none;
          }

          .container {
            width: calc(100% - 30px);
            padding-top: 30px;
          }

          .customer-header {
            flex-direction: column;
          }

          .header-actions {
            width: 100%;
            justify-content: space-between;
          }

          .customer-header h1 {
            font-size: 25px;
          }

          .financial-grid {
            grid-template-columns: 1fr 1fr;
          }

          .details-grid {
            grid-template-columns: 1fr;
          }

          .secure-session {
            padding: 8px 10px;
            font-size: 8px;
          }
        }
      `}</style>
    </main>
  );
}