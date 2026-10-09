"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabaseClient";
import { formatPeso } from "@/lib/format";
import { StaffHeader } from "../../components/StaffHeader";
import { PkcLoader } from "../../components/PkcLoader";
import styles from "../verification/verification.module.css";

type Plan = { id: string; plan_name: string; price: number; speed: string | null; active: boolean; customers: number };

const supabase = createClient();

export default function PlansPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // One form for both: editing an existing plan, or adding a new one.
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [speed, setSpeed] = useState("");
  const [active, setActive] = useState(true);

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token, []);

  const load = useCallback(async () => {
    setLoading(true);
    const access = await token();
    if (!access) {
      router.replace("/login");
      return;
    }
    const response = await fetch("/api/accounting/plans", { headers: { Authorization: `Bearer ${access}` } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setMessage({ kind: "error", text: result?.error || "Unable to load plans." });
    else setPlans(result.plans || []);
    setLoading(false);
  }, [router, token]);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) return router.replace("/login");
      const { data: memberships } = await supabase.from("tenant_users").select("role").eq("user_id", data.session.user.id);
      const mine = (memberships || []).map((m) => m.role).filter((r): r is string => Boolean(r));
      if (cancelled) return;
      if (!mine.includes("admin")) return router.replace("/accounting");
      setRoles(mine);
      setChecking(false);
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    // Loading data once access is confirmed is a genuine external sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!checking) void load();
  }, [checking, load]);

  function open(plan: Plan | "new") {
    setMessage(null);
    setEditing(plan);
    if (plan === "new") {
      setName("");
      setPrice("");
      setSpeed("");
      setActive(true);
    } else {
      setName(plan.plan_name);
      setPrice(String(plan.price));
      setSpeed(plan.speed || "");
      setActive(plan.active);
    }
  }

  async function save() {
    if (!editing || busy) return;
    const amount = Number(price);
    if (!Number.isFinite(amount) || amount <= 0) return setMessage({ kind: "error", text: "Enter a price above zero." });
    if (editing !== "new" && !active && editing.active && editing.customers > 0) {
      const ok = window.confirm(
        `${editing.customers} customer(s) are on ${editing.plan_name}. Turning it off stops new bills for them until you move them to another plan. Continue?`,
      );
      if (!ok) return;
    }
    if (editing !== "new" && amount !== editing.price && editing.customers > 0) {
      const ok = window.confirm(
        `${editing.plan_name} costs ${formatPeso(editing.price)} today. The new price ${formatPeso(amount)} applies to NEW bills and new applications for its ${editing.customers} customer(s); bills already issued do not change. Continue?`,
      );
      if (!ok) return;
    }
    const access = await token();
    if (!access) return setMessage({ kind: "error", text: "Your session expired. Please sign in again." });

    setBusy(true);
    try {
      const response = await fetch("/api/accounting/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}` },
        body: JSON.stringify({ id: editing === "new" ? undefined : editing.id, planName: name, price: amount, speed, active }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Could not save the plan.");
      setMessage({ kind: "ok", text: editing === "new" ? `Added ${name}.` : `Saved ${name}.` });
      setEditing(null);
      await load();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not save the plan." });
    } finally {
      setBusy(false);
    }
  }

  if (checking || (loading && plans.length === 0)) return <PkcLoader />;

  return (
    <main className={styles.page}>
      <StaffHeader current="accounting" roles={roles} />
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <Link href="/accounting" className={styles.back}>
              ← Accounting
            </Link>
            <h1>Plans and prices</h1>
            <p>
              The internet plans customers can apply for in the app. A new price applies to new bills and new applications;
              bills already issued keep their price. A plan&apos;s name cannot change once it exists.
            </p>
          </div>
          <button className={styles.verify} onClick={() => open("new")}>
            + Add a plan
          </button>
        </section>

        {message && (
          <div className={`${styles.notice} ${message.kind === "ok" ? styles.ok : styles.error}`} role="status">
            {message.text}
          </div>
        )}

        <div className={styles.list}>
          {plans.map((plan) => (
            <article key={plan.id} className={styles.card}>
              <header>
                <div>
                  <strong>{plan.plan_name}</strong>
                  <small>{plan.speed || "No speed set"}</small>
                </div>
                <span className={`${styles.badge} ${plan.active ? styles.verified : styles.rejected}`}>{plan.active ? "On sale" : "Off"}</span>
              </header>
              <dl>
                <div>
                  <dt>Monthly price</dt>
                  <dd>{formatPeso(plan.price)}</dd>
                </div>
                <div>
                  <dt>Customers on it</dt>
                  <dd>{plan.customers}</dd>
                </div>
              </dl>
              <div className={styles.actions}>
                <button className={styles.ghost} onClick={() => open(plan)}>
                  Edit
                </button>
              </div>
            </article>
          ))}
          {plans.length === 0 && <div className={styles.empty}>No plans yet. Add the first one.</div>}
        </div>
      </div>

      {editing && (
        <div className={styles.modalBackdrop} role="presentation" onClick={() => !busy && setEditing(null)}>
          <div className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>{editing === "new" ? "Add a plan" : `Edit ${editing.plan_name}`}</h2>
            <input
              className={styles.noteBox}
              placeholder="Plan name, e.g. G1_P1250"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={editing !== "new"}
              maxLength={40}
            />
            <input
              className={styles.noteBox}
              placeholder="Monthly price in pesos"
              value={price}
              inputMode="decimal"
              onChange={(e) => setPrice(e.target.value)}
            />
            <input
              className={styles.noteBox}
              placeholder="Speed label, e.g. 1250 Mbps (optional)"
              value={speed}
              onChange={(e) => setSpeed(e.target.value)}
              maxLength={40}
            />
            <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "6px 0 10px", color: "#cfe0e8", fontSize: 13 }}>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> On sale in the app
            </label>
            {message?.kind === "error" && <div className={styles.modalError}>{message.text}</div>}
            <div className={styles.modalActions}>
              <button className={styles.ghost} disabled={busy} onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className={styles.verify} disabled={busy} onClick={() => void save()}>
                {busy ? "Saving…" : "Save plan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
