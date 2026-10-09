"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "../../../../lib/supabaseClient";
import { formatDate, formatPeso } from "@/lib/format";
import { StaffHeader } from "../../../components/StaffHeader";
import { PkcLoader } from "../../../components/PkcLoader";
import styles from "./receipt.module.css";

type Receipt = {
  receipt_number: string | null;
  payment_id: string | null;
  amount: number | null;
  method: string | null;
  payment_date: string | null;
  customer_name: string | null;
  account_id: string | null;
  plan: string | null;
  reference: string | null;
  // Present for payments that settled a monthly bill.
  kind?: "bill" | "plan" | null;
  bill_id?: string | null;
  period_start?: string | null;
  period_end?: string | null;
};

const supabase = createClient();

export default function ReceiptPage() {
  const router = useRouter();
  const params = useParams<{ paymentId: string }>();

  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
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
      if (!userRoles.includes("admin") && !userRoles.includes("accounting")) {
        router.replace("/clients");
        return;
      }
      setRoles(userRoles);

      const { data, error: rpcError } = await supabase.rpc("get_receipt", { p_payment_uuid: params.paymentId });
      if (cancelled) return;
      if (rpcError) setError(rpcError.message);
      else setReceipt(data as Receipt);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [params.paymentId, router]);

  if (loading) return <PkcLoader />;

  return (
    <main className={styles.page}>
      <style>{`@media print { header { display: none !important; } .noPrint { display: none !important; } body { background: #fff !important; } }`}</style>
      <StaffHeader current="accounting" roles={roles} />

      <div className={styles.shell}>
        <div className={`${styles.bar} noPrint`}>
          <Link href="/accounting/reports" className={styles.back}>
            ← Reports
          </Link>
          <button className={styles.print} onClick={() => window.print()} disabled={!receipt}>
            Print / Save as PDF
          </button>
        </div>

        {error || !receipt ? (
          <p className={styles.error}>{error || "Receipt not found."}</p>
        ) : (
          <article className={styles.receipt}>
            <header className={styles.head}>
              <div>
                <div className={styles.brand}>
                  PKC <strong>BIZOFT</strong>
                </div>
                <small>Official receipt</small>
              </div>
              <div className={styles.number}>
                <small>Receipt no.</small>
                <strong>{receipt.receipt_number || receipt.payment_id || "—"}</strong>
              </div>
            </header>

            <dl className={styles.rows}>
              <div>
                <dt>Received from</dt>
                <dd>{receipt.customer_name || "—"}</dd>
              </div>
              <div>
                <dt>Account ID</dt>
                <dd>{receipt.account_id || "—"}</dd>
              </div>
              <div>
                <dt>For</dt>
                <dd>
                  {receipt.kind === "bill" && receipt.bill_id
                    ? `Internet service bill ${receipt.bill_id}`
                    : receipt.plan
                      ? `Internet plan ${receipt.plan}`
                      : "Internet service"}
                </dd>
              </div>
              {receipt.kind === "bill" && receipt.period_start && receipt.period_end && (
                <div>
                  <dt>Billing period</dt>
                  <dd>
                    {formatDate(receipt.period_start)} – {formatDate(receipt.period_end)}
                  </dd>
                </div>
              )}
              <div>
                <dt>Payment date</dt>
                <dd>{formatDate(receipt.payment_date)}</dd>
              </div>
              <div>
                <dt>Method</dt>
                <dd>{receipt.method || "—"}</dd>
              </div>
              <div>
                <dt>Reference no.</dt>
                <dd>{receipt.reference || "—"}</dd>
              </div>
            </dl>

            <div className={styles.total}>
              <span>Amount received</span>
              <strong>{formatPeso(receipt.amount)}</strong>
            </div>

            <p className={styles.thanks}>Thank you for choosing PKC BIZOFT. This receipt was issued electronically and is valid without a signature.</p>
          </article>
        )}
      </div>
    </main>
  );
}
