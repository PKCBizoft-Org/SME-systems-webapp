"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import Link from "next/link";

type Client = {
  id: string;
  customer_name: string;
  install_date: string;
  plan_name: string;
  area: string;
  installation_status: string;
  account_status: string;
  account_id: string;
  mobile_number: string;
  pppoe_name: string;
  map_location: string;
  technicians: string;
};

type Billing = {
  id: string;
  bill_id: string;
  status: string;
  bill_type: string;
  bill_date: string;
  due_date: string;
  amount_due: number;
};

type Payment = {
  id: string;
  payment_id: string;
  receipt_number: string;
  amount_paid: number;
  payment_date: string;
  payment_method: string;
  billing: {
    bill_id: string;
    bill_type: string;
  } | null;
};

type AuditLog = {
  id: number;
  tenant_id: string | null;
  client_id: string | null;
  changed_by_email: string | null;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_at: string | null;
};

const INSTALLATION_STATUS_OPTIONS = [
  "Scheduled",
  "Completed",
  "Cancelled",
  "Terminated",
];

const ACCOUNT_STATUS_OPTIONS = ["Paid", "Due", "Overdue"];

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function ClientDetailPage() {
  const [client, setClient] = useState<Client | null>(null);
  const [billing, setBilling] = useState<Billing[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [installationSaveStatus, setInstallationSaveStatus] =
    useState<SaveStatus>("idle");

  const [accountSaveStatus, setAccountSaveStatus] =
    useState<SaveStatus>("idle");

  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  useEffect(() => {
    const fetchAll = async () => {
      const supabase = createClient();

      const { data: sessionData } = await supabase.auth.getSession();

      if (!sessionData.session) {
        router.push("/login");
        return;
      }

      // Load client
      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("*")
        .eq("id", id)
        .single();

      if (clientError) {
        setError(clientError.message);
        setLoading(false);
        return;
      }

      setClient(clientData);

      // Load billing
      const { data: billingData } = await supabase
        .from("billing")
        .select("*")
        .eq("client_id", id)
        .order("bill_date", {
          ascending: false,
        });

      setBilling(billingData || []);

      // Load payments
      const { data: paymentData } = await supabase
        .from("payments")
        .select("*, billing(bill_id, bill_type)")
        .eq("client_id", id)
        .order("payment_date", {
          ascending: false,
        });

      setPayments((paymentData as unknown as Payment[]) || []);

      // Load audit history for this client
      const { data: auditData, error: auditError } = await supabase
        .from("audit_log")
        .select("*")
        .eq("client_id", id)
        .order("changed_at", { ascending: false });

      if (auditError) {
        console.error("Audit history load failed:", auditError);
      }

      setAuditLogs((auditData as AuditLog[]) || []);

      setLoading(false);
    };

    fetchAll();
  }, [id, router]);

  // =========================================================
  // AUTO-SAVE INSTALLATION STATUS
  // =========================================================

  const handleInstallationStatusChange = async (value: string) => {
    if (!client) return;

    const previousValue = client.installation_status;

    // Change the screen immediately
    setClient((prev) =>
      prev
        ? {
            ...prev,
            installation_status: value,
          }
        : prev,
    );

    setInstallationSaveStatus("saving");

    const supabase = createClient();

    const { error } = await supabase
      .from("clients")
      .update({
        installation_status: value,
      })
      .eq("id", id);

    if (error) {
      console.error("Installation status save failed:", error);

      // Revert if Supabase rejected the update
      setClient((prev) =>
        prev
          ? {
              ...prev,
              installation_status: previousValue,
            }
          : prev,
      );

      setInstallationSaveStatus("error");

      setTimeout(() => {
        setInstallationSaveStatus("idle");
      }, 4000);

      return;
    }

    setInstallationSaveStatus("saved");

    setTimeout(() => {
      setInstallationSaveStatus("idle");
    }, 2500);
  };

  // =========================================================
  // AUTO-SAVE ACCOUNT STATUS
  // =========================================================

  const handleAccountStatusChange = async (value: string) => {
    if (!client) return;

    const previousValue = client.account_status;

    // Change the screen immediately
    setClient((prev) =>
      prev
        ? {
            ...prev,
            account_status: value,
          }
        : prev,
    );

    setAccountSaveStatus("saving");

    const supabase = createClient();

    const { error } = await supabase
      .from("clients")
      .update({
        account_status: value,
      })
      .eq("id", id);

    if (error) {
      console.error("Account status save failed:", error);

      // Revert if Supabase rejected the update
      setClient((prev) =>
        prev
          ? {
              ...prev,
              account_status: previousValue,
            }
          : prev,
      );

      setAccountSaveStatus("error");

      setTimeout(() => {
        setAccountSaveStatus("idle");
      }, 4000);

      return;
    }

    setAccountSaveStatus("saved");

    setTimeout(() => {
      setAccountSaveStatus("idle");
    }, 2500);
  };

  // =========================================================
  // LOADING / ERROR
  // =========================================================

  if (loading) {
    return <p style={{ padding: 40 }}>Loading...</p>;
  }

  if (error) {
    return <p style={{ padding: 40 }}>Error: {error}</p>;
  }

  if (!client) {
    return <p style={{ padding: 40 }}>Client not found.</p>;
  }

  // =========================================================
  // STYLES
  // =========================================================

  const rowStyle = {
    display: "flex",
    padding: "10px 0",
    borderBottom: "1px solid #eee",
    alignItems: "center",
  };

  const labelStyle = {
    width: 180,
    fontWeight: "bold" as const,
  };

  const tableStyle = {
    borderCollapse: "collapse" as const,
    width: "100%",
    marginTop: 10,
    marginBottom: 30,
  };

  const thStyle = {
    textAlign: "left" as const,
    padding: 8,
    borderBottom: "2px solid #333",
  };

  const tdStyle = {
    padding: 8,
    borderBottom: "1px solid #eee",
  };

  const selectStyle = {
    padding: 6,
  };

  // =========================================================
  // SAVE STATUS DISPLAY
  // =========================================================

  const installationSaveIndicator = () => {
    if (installationSaveStatus === "saving") {
      return (
        <span
          style={{
            marginLeft: 10,
            color: "#666",
            fontSize: 13,
          }}
        >
          Saving...
        </span>
      );
    }

    if (installationSaveStatus === "saved") {
      return (
        <span
          style={{
            marginLeft: 10,
            color: "green",
            fontSize: 13,
            fontWeight: "bold",
          }}
        >
          ✓ Saved
        </span>
      );
    }

    if (installationSaveStatus === "error") {
      return (
        <span
          style={{
            marginLeft: 10,
            color: "red",
            fontSize: 13,
            fontWeight: "bold",
          }}
        >
          ⚠ Failed to save
        </span>
      );
    }

    return null;
  };

  const accountSaveIndicator = () => {
    if (accountSaveStatus === "saving") {
      return (
        <span
          style={{
            marginLeft: 10,
            color: "#666",
            fontSize: 13,
          }}
        >
          Saving...
        </span>
      );
    }

    if (accountSaveStatus === "saved") {
      return (
        <span
          style={{
            marginLeft: 10,
            color: "green",
            fontSize: 13,
            fontWeight: "bold",
          }}
        >
          ✓ Saved
        </span>
      );
    }

    if (accountSaveStatus === "error") {
      return (
        <span
          style={{
            marginLeft: 10,
            color: "red",
            fontSize: 13,
            fontWeight: "bold",
          }}
        >
          ⚠ Failed to save
        </span>
      );
    }

    return null;
  };

  return (
    <div
      style={{
        padding: 40,
        fontFamily: "sans-serif",
        maxWidth: 900,
      }}
    >
      {/* =====================================================
          BACK TO CLIENT LIST
      ====================================================== */}

      <Link href="/clients">&larr; Back to Client List</Link>

      {/* =====================================================
          CLIENT NAME
      ====================================================== */}

      <h1 style={{ marginTop: 20 }}>{client.customer_name}</h1>

      {/* =====================================================
          CLIENT INFORMATION
      ====================================================== */}

      <div style={rowStyle}>
        <span style={labelStyle}>Account ID</span>

        <span>{client.account_id}</span>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Area</span>

        <span>{client.area}</span>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Plan</span>

        <span>{client.plan_name}</span>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Install Date</span>

        <span>{client.install_date}</span>
      </div>

      {/* =====================================================
          INSTALLATION STATUS - AUTO SAVE
      ====================================================== */}

      <div style={rowStyle}>
        <span style={labelStyle}>Installation Status</span>

        <select
          id="installation-status"
          name="installation-status"
          value={client.installation_status || ""}
          onChange={(e) => handleInstallationStatusChange(e.target.value)}
          style={selectStyle}
        >
          {INSTALLATION_STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        {installationSaveIndicator()}
      </div>

      {/* =====================================================
          ACCOUNT STATUS - AUTO SAVE
      ====================================================== */}

      <div style={rowStyle}>
        <span style={labelStyle}>Account Status</span>

        <select
          id="account-status"
          name="account-status"
          value={client.account_status || ""}
          onChange={(e) => handleAccountStatusChange(e.target.value)}
          style={selectStyle}
        >
          {ACCOUNT_STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        {accountSaveIndicator()}
      </div>

      {/* =====================================================
          OTHER CLIENT INFORMATION
      ====================================================== */}

      <div style={rowStyle}>
        <span style={labelStyle}>Mobile Number</span>

        <span>{client.mobile_number}</span>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>PPPoE Name</span>

        <span>{client.pppoe_name}</span>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Map Location</span>

        <span>{client.map_location || "—"}</span>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Technicians</span>

        <span>{client.technicians}</span>
      </div>

      {/* =====================================================
          BILLING HISTORY
      ====================================================== */}

      <h2 style={{ marginTop: 30 }}>Billing History</h2>

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Bill ID</th>

            <th style={thStyle}>Type</th>

            <th style={thStyle}>Bill Date</th>

            <th style={thStyle}>Due Date</th>

            <th style={thStyle}>Amount Due</th>

            <th style={thStyle}>Status</th>
          </tr>
        </thead>

        <tbody>
          {billing.length === 0 && (
            <tr>
              <td style={tdStyle} colSpan={6}>
                No billing records yet.
              </td>
            </tr>
          )}

          {billing.map((b) => (
            <tr key={b.id}>
              <td style={tdStyle}>{b.bill_id}</td>

              <td style={tdStyle}>{b.bill_type}</td>

              <td style={tdStyle}>{b.bill_date}</td>

              <td style={tdStyle}>{b.due_date}</td>

              <td style={tdStyle}>{b.amount_due}</td>

              <td style={tdStyle}>{b.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* =====================================================
          PAYMENT HISTORY
      ====================================================== */}

      <h2>Payment History</h2>

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Receipt #</th>

            <th style={thStyle}>Applied to Bill</th>

            <th style={thStyle}>Bill Type</th>

            <th style={thStyle}>Amount Paid</th>

            <th style={thStyle}>Payment Date</th>

            <th style={thStyle}>Method</th>
          </tr>
        </thead>

        <tbody>
          {payments.length === 0 && (
            <tr>
              <td style={tdStyle} colSpan={6}>
                No payment records yet.
              </td>
            </tr>
          )}

          {payments.map((p) => (
            <tr key={p.id}>
              <td style={tdStyle}>{p.receipt_number}</td>

              <td style={tdStyle}>{p.billing?.bill_id || "—"}</td>

              <td style={tdStyle}>{p.billing?.bill_type || "—"}</td>

              <td style={tdStyle}>{p.amount_paid}</td>

              <td style={tdStyle}>{p.payment_date}</td>

              <td style={tdStyle}>{p.payment_method}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* =====================================================
          AUDIT TRAIL / CHANGE HISTORY
      ====================================================== */}

      <h2 style={{ marginTop: 40 }}>Audit Trail / Change History</h2>

      {auditLogs.length === 0 ? (
        <div
          style={{
            padding: 16,
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            background: "#f9fafb",
            color: "#666",
            marginTop: 10,
          }}
        >
          No changes have been recorded for this client yet.
        </div>
      ) : (
        <div
          style={{
            overflowX: "auto",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            marginTop: 10,
          }}
        >
          <table
            style={{
              ...tableStyle,
              marginTop: 0,
              marginBottom: 0,
            }}
          >
            <thead>
              <tr>
                <th style={thStyle}>Date & Time</th>
                <th style={thStyle}>Changed By</th>
                <th style={thStyle}>Field</th>
                <th style={thStyle}>Previous Value</th>
                <th style={thStyle}>New Value</th>
              </tr>
            </thead>

            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td style={tdStyle}>
                    {log.changed_at
                      ? new Date(log.changed_at).toLocaleString()
                      : "—"}
                  </td>

                  <td style={tdStyle}>{log.changed_by_email || "Unknown"}</td>

                  <td style={tdStyle}>
                    {log.field_name
                      ? log.field_name
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (char) => char.toUpperCase())
                      : "—"}
                  </td>

                  <td style={tdStyle}>{log.old_value || "—"}</td>

                  <td
                    style={{
                      ...tdStyle,
                      fontWeight: "bold",
                    }}
                  >
                    {log.new_value || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
