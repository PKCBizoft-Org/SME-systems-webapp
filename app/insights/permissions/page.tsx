"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "../../../lib/supabaseClient";
import { StaffHeader } from "../../components/StaffHeader";
import { PkcLoader } from "../../components/PkcLoader";
import { InsightsNav } from "../InsightsNav";
import { useInsightsAccess } from "../useInsightsAccess";
import styles from "../../accounting/reports/reports.module.css";

type Matrix = Record<string, Record<string, boolean>>;

const supabase = createClient();

const ROLES: { key: string; label: string }[] = [
  { key: "accounting", label: "Accounting" },
  { key: "inventory", label: "Inventory" },
  { key: "technician", label: "Technician" },
];

// Pages and features an admin can switch. "Enforced" ones are checked by the
// database itself, so they can be switched on for any role; the older pages are
// protected by built-in role rules, so they can only be switched off.
const FEATURES: { key: string; label: string; help: string; enforced: boolean }[] = [
  { key: "clients", label: "Clients", help: "The customer list and records", enforced: false },
  { key: "inventory", label: "Inventory", help: "Stock and kits", enforced: false },
  { key: "accounting", label: "Accounting", help: "Billing, payments and reports", enforced: false },
  { key: "ratings", label: "Ratings", help: "Customer ratings and surveys", enforced: false },
  { key: "analytics", label: "Revenue analytics", help: "Monthly revenue and collections", enforced: true },
  { key: "tickets", label: "Tickets", help: "Read and answer customer chats", enforced: true },
  { key: "audit", label: "Audit log", help: "Who changed what, and when", enforced: true },
];

const DEFAULTS: Record<string, string[]> = {
  accounting: ["clients", "accounting", "ratings", "analytics", "tickets", "audit"],
  inventory: ["clients", "inventory"],
  technician: ["clients"],
};

export default function PermissionsPage() {
  const access = useInsightsAccess("users");
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("list_role_permissions");
    if (rpcError) setError(rpcError.message);
    else setMatrix(data as Matrix);
  }, []);

  useEffect(() => {
    // Loading data once access is confirmed is a genuine external sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (access.authorized) void load();
  }, [access.authorized, load]);

  async function toggle(role: string, permission: string, allowed: boolean) {
    const id = `${role}:${permission}`;
    setBusy(id);
    setError("");
    setSaved("");
    const { error: rpcError } = await supabase.rpc("set_role_permission", { p_role: role, p_permission: permission, p_allowed: allowed });
    setBusy(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setSaved(`${ROLES.find((r) => r.key === role)?.label}: ${FEATURES.find((f) => f.key === permission)?.label} turned ${allowed ? "on" : "off"}.`);
    await load();
  }

  if (access.checking) return <PkcLoader label="Opening permissions" steps={["Verifying your role", "Loading permissions"]} />;
  if (!access.authorized) return null;

  return (
    <main className={styles.page}>
      <StaffHeader current="insights" roles={access.roles} />
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <h1>Role permissions</h1>
            <p>
              Choose what each staff role can open. Admins always have everything. Changes apply the next time that person opens
              a page and are recorded in the audit log.
            </p>
          </div>
        </section>

        <InsightsNav current="permissions" permissions={access.permissions} />

        {error && (
          <div className={styles.notice} role="alert">
            {error}
          </div>
        )}
        {saved && (
          <div className={styles.notice} role="status" style={{ borderColor: "rgba(52,211,153,0.5)" }}>
            {saved}
          </div>
        )}

        <div className={styles.panel}>
          {!matrix ? (
            <div className={styles.empty}>Loading…</div>
          ) : (
            <table className={styles.matrix}>
              <thead>
                <tr>
                  <th>Page or feature</th>
                  {ROLES.map((r) => (
                    <th key={r.key}>{r.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURES.map((feature) => (
                  <tr key={feature.key}>
                    <td className={styles.wrap}>
                      <strong>{feature.label}</strong>
                      <br />
                      <span className={styles.muted}>{feature.help}</span>
                    </td>
                    {ROLES.map((role) => {
                      const on = !!matrix[role.key]?.[feature.key];
                      const canTurnOn = feature.enforced || DEFAULTS[role.key]?.includes(feature.key);
                      const id = `${role.key}:${feature.key}`;
                      const locked = busy === id || (!on && !canTurnOn);
                      return (
                        <td key={role.key}>
                          <button
                            className={`${styles.toggle} ${on ? styles.toggleOn : ""}`}
                            role="switch"
                            aria-checked={on}
                            aria-label={`${feature.label} for ${role.label}`}
                            disabled={locked}
                            title={!on && !canTurnOn ? "This page is protected by built-in role rules and cannot be switched on for this role yet." : undefined}
                            onClick={() => void toggle(role.key, feature.key, !on)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className={styles.muted} style={{ marginTop: 10 }}>
          Greyed-out switches are pages whose data is protected by built-in role rules, so they cannot be handed to a role that never had
          them. Revenue analytics, tickets and the audit log are checked by the database itself and can be switched for any role. Managing
          users is always admin-only.
        </p>
      </div>
    </main>
  );
}
