"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabaseClient";
import { StaffHeader } from "../../components/StaffHeader";
import { PkcLoader } from "../../components/PkcLoader";
import styles from "../reports/reports.module.css";

type AuditRow = {
  id: number;
  client_id: string | null;
  changed_by_email: string | null;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_at: string | null;
};

type Group = "payments" | "installs" | "status" | "all";

const supabase = createClient();

const LABELS: Record<string, string> = {
  payment_verified: "Payment verified",
  payment_rejected: "Payment rejected",
  installation_completed: "Installation completed",
  installation_status: "Installation status",
  account_status: "Account status",
};

function groupOf(field: string | null): Exclude<Group, "all"> | "other" {
  if (field === "payment_verified" || field === "payment_rejected") return "payments";
  if (field === "installation_completed") return "installs";
  if (field === "installation_status" || field === "account_status") return "status";
  return "other";
}

export default function AuditPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [group, setGroup] = useState<Group>("payments");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!sessionData.session) {
        router.replace("/login");
        return;
      }
      const { data: memberships } = await supabase.from("tenant_users").select("role").eq("user_id", sessionData.session.user.id);
      const userRoles = (memberships || []).map((m) => m.role).filter((r): r is string => Boolean(r));
      // The audit log is for admins only.
      if (!userRoles.includes("admin")) {
        router.replace(userRoles.includes("accounting") ? "/accounting" : "/clients");
        return;
      }
      setRoles(userRoles);

      const { data, error: auditError } = await supabase
        .from("audit_log")
        .select("id, client_id, changed_by_email, field_name, old_value, new_value, changed_at")
        .order("changed_at", { ascending: false })
        .limit(500);
      if (cancelled) return;
      if (auditError) setError(auditError.message);
      const list = (data || []) as AuditRow[];
      setRows(list);

      const ids = [...new Set(list.map((r) => r.client_id).filter((v): v is string => Boolean(v)))];
      if (ids.length) {
        const { data: clientData } = await supabase.from("clients").select("id, customer_name").in("id", ids);
        if (!cancelled) setNames(new Map((clientData || []).map((c) => [c.id as string, (c.customer_name as string) || "—"])));
      }
      setAuthorized(true);
      setChecking(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (group !== "all" && groupOf(r.field_name) !== group) return false;
      if (!q) return true;
      const customer = r.client_id ? names.get(r.client_id) || "" : "";
      return [r.changed_by_email, r.field_name, r.old_value, r.new_value, customer].some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [rows, group, search, names]);

  if (checking) return <PkcLoader />;
  if (!authorized) return null;

  return (
    <main className={styles.page}>
      <StaffHeader current="accounting" roles={roles} />

      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <Link href="/accounting" className={styles.back}>
              ← Accounting
            </Link>
            <h1>Audit log</h1>
            <p>Every payment decision, installation and account change, with who did it and when. Entries cannot be edited from the app.</p>
          </div>
        </section>

        <div className={styles.tabs} role="tablist">
          {(
            [
              ["payments", "Payment decisions"],
              ["installs", "Installations"],
              ["status", "Status changes"],
              ["all", "Everything"],
            ] as [Group, string][]
          ).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={group === key} className={group === key ? styles.tabOn : styles.tab} onClick={() => setGroup(key)}>
              {label}
            </button>
          ))}
        </div>

        <div className={styles.controls}>
          <label className={styles.field}>
            Search
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Person, customer or detail" />
          </label>
        </div>

        {error && <div className={styles.notice}>{error}</div>}

        <div className={styles.panel}>
          {visible.length === 0 ? (
            <div className={styles.empty}>Nothing to show here yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>What</th>
                  <th>Customer</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id}>
                    <td>{r.changed_at ? new Date(r.changed_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "—"}</td>
                    <td>{r.changed_by_email || "—"}</td>
                    <td className={r.field_name === "payment_rejected" ? styles.bad : undefined}>{LABELS[r.field_name || ""] || r.field_name || "—"}</td>
                    <td>{(r.client_id && names.get(r.client_id)) || "—"}</td>
                    <td style={{ whiteSpace: "normal", maxWidth: 360 }}>
                      {r.old_value ? `${r.old_value} → ` : ""}
                      {r.new_value || ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
