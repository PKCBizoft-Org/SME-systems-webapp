"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabaseClient";
import { formatDate } from "@/lib/format";
import { StaffHeader } from "../../components/StaffHeader";
import { PkcLoader } from "../../components/PkcLoader";

type Signal = {
  id: string;
  kind: string;
  severity: string;
  entity_type: string;
  entity_id: string;
  summary: string;
  status: string;
  created_at: string;
};

const supabase = createClient();

const KIND_LABEL: Record<string, string> = {
  duplicate_reference: "Reused reference number",
  duplicate_image: "Duplicate receipt image",
  amount_mismatch: "Amount mismatch",
  ocr_mismatch: "Receipt doesn’t match its image",
};

export default function SignalsPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [staffRoles, setStaffRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("ops_signals")
      .select("id, kind, severity, entity_type, entity_id, summary, status, created_at")
      .eq("status", "open")
      .order("severity", { ascending: true }) // 'alert' sorts before 'warn'
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setSignals((data || []) as Signal[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        router.replace("/login");
        return;
      }
      const { data: memberships } = await supabase
        .from("tenant_users")
        .select("role")
        .eq("user_id", data.session.user.id);
      const roles = (memberships || []).map((m) => m.role);
      if (!roles.includes("admin") && !roles.includes("accounting")) {
        router.replace("/clients");
        return;
      }
      setStaffRoles(roles.filter((r): r is string => Boolean(r)));
      setAuthorized(true);
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    // Loading once access is confirmed is a genuine external sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (authorized) void load();
  }, [authorized, load]);

  if (checking) return <PkcLoader />;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 16px 40px" }}>
      <StaffHeader current="accounting" roles={staffRoles} />
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Fraud &amp; ops signals</h1>
        <Link href="/accounting/verification" style={{ fontSize: 14 }}>
          Payment verification →
        </Link>
      </div>
      <p style={{ color: "#6b7280", fontSize: 14, margin: "6px 0 16px" }}>
        Open flags across payments. They clear automatically once the payment is verified or rejected.
      </p>

      {loading ? (
        <p style={{ color: "#6b7280" }}>Loading…</p>
      ) : error ? (
        <p style={{ color: "#b91c1c" }}>{error}</p>
      ) : signals.length === 0 ? (
        <p style={{ color: "#166534", background: "#dcfce7", border: "1px solid #86efac", borderRadius: 10, padding: 14 }}>
          ✓ Nothing flagged. All clear.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
          {signals.map((s) => {
            const alert = s.severity === "alert";
            return (
              <li
                key={s.id}
                style={{
                  border: `1px solid ${alert ? "#fca5a5" : "#fcd34d"}`,
                  background: alert ? "#fef2f2" : "#fffbeb",
                  borderRadius: 10,
                  padding: "12px 14px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      color: alert ? "#991b1b" : "#92400e",
                      background: alert ? "#fecaca" : "#fde68a",
                      borderRadius: 999,
                      padding: "2px 8px",
                    }}
                  >
                    {alert ? "Urgent" : "Review"}
                  </span>
                  <strong style={{ fontSize: 14 }}>{KIND_LABEL[s.kind] || s.kind}</strong>
                  <span style={{ marginLeft: "auto", color: "#6b7280", fontSize: 12 }}>{formatDate(s.created_at)}</span>
                </div>
                <div style={{ fontSize: 14, color: "#374151" }}>{s.summary}</div>
                {s.entity_type === "payment_submission" && (
                  <Link href="/accounting/verification" style={{ fontSize: 13, display: "inline-block", marginTop: 6 }}>
                    Review this payment →
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
