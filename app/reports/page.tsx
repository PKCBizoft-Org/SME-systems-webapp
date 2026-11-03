"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabaseClient";
import { StaffHeader } from "../components/StaffHeader";
import { PkcLoader } from "../components/PkcLoader";
import styles from "../accounting/reports/reports.module.css";

type Report = { title: string; href: string; text: string; roles: string[] };

const MONEY = ["admin", "accounting"];
const FIELD = ["admin", "accounting", "inventory"];
const STOCK = ["admin", "inventory"];

// Every report in one place, grouped by what it answers. Each page still checks access itself.
const GROUPS: { title: string; reports: Report[] }[] = [
  {
    title: "Money",
    reports: [
      { title: "Daily collection", href: "/accounting/reports", text: "What was collected on a day, by method. Printable.", roles: MONEY },
      { title: "Collections", href: "/accounting/collections", text: "This month vs last, the last 30 days, and who is most overdue.", roles: MONEY },
      { title: "Cash, expenses and profit", href: "/accounting/money", text: "Cash PKC should have, what was spent, profit per month and the 12-month trend.", roles: MONEY },
      { title: "Revenue analytics", href: "/insights/analytics", text: "Billed vs collected per month, and revenue by plan.", roles: MONEY },
      { title: "Overdue, statements and exports", href: "/accounting/reports", text: "Unpaid bills, a customer's statement, and CSV downloads of payments, bills and expenses.", roles: MONEY },
      { title: "Referral payouts", href: "/accounting/referrals", text: "Referral rewards waiting to be paid.", roles: MONEY },
    ],
  },
  {
    title: "Technicians and jobs",
    reports: [
      { title: "Technician performance", href: "/insights/technicians", text: "Jobs done, time to arrive, time on site, ratings, missing proof.", roles: FIELD },
      { title: "Job reports", href: "/insights/job-reports", text: "Before and after photos and the customer's signature for every job.", roles: FIELD },
      { title: "Customer ratings", href: "/ratings", text: "Stars and comments, overall and per technician.", roles: FIELD },
      { title: "Tickets", href: "/insights/tickets", text: "Customer problem reports and the replies.", roles: FIELD },
    ],
  },
  {
    title: "Stock",
    reports: [
      { title: "Job materials", href: "/insights/job-materials", text: "Materials taken, used and returned per job, including from trucks.", roles: STOCK },
      { title: "Stock audit", href: "/insights/stock-audit", text: "Blind counts of the shelves and what did not match.", roles: STOCK },
      { title: "Truck stock", href: "/insights/trucks", text: "What each technician carries.", roles: FIELD },
    ],
  },
  {
    title: "Records",
    reports: [
      { title: "Audit log", href: "/insights/audit", text: "Who changed what, across the system.", roles: ["admin"] },
      { title: "Billing audit", href: "/accounting/audit", text: "Changes to bills and payments.", roles: ["admin"] },
    ],
  },
];

const supabase = createClient();

export default function ReportsHome() {
  const router = useRouter();
  const [roles, setRoles] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) return router.replace("/login");
      const { data: memberships } = await supabase.from("tenant_users").select("role").eq("user_id", data.session.user.id);
      if (cancelled) return;
      const mine = (memberships || []).map((m) => m.role).filter((r): r is string => Boolean(r));
      if (!mine.some((r) => r !== "technician")) return router.replace("/clients");
      setRoles(mine);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!roles) return <PkcLoader />;

  return (
    <main className={styles.page}>
      <StaffHeader current="insights" roles={roles} />
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <h1>Reports</h1>
            <p>Every report in one place. Pick what you want to know.</p>
          </div>
        </section>
        {GROUPS.map((group) => {
          const visible = group.reports.filter((r) => r.roles.some((role) => roles.includes(role)));
          if (!visible.length) return null;
          return (
            <div key={group.title} className={styles.panel} style={{ marginBottom: 14 }}>
              <h2>{group.title}</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
                {visible.map((r) => (
                  <Link key={r.title} href={r.href} className={styles.card} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                    <strong style={{ fontSize: 16 }}>{r.title}</strong>
                    <small style={{ display: "block", marginTop: 6, lineHeight: 1.5 }}>{r.text}</small>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
