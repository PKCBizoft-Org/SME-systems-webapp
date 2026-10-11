import Link from "next/link";
import styles from "../accounting/reports/reports.module.css";

const TABS: { key: string; label: string; href: string; permission: string }[] = [
  { key: "analytics", label: "Revenue analytics", href: "/insights/analytics", permission: "analytics" },
  { key: "tickets", label: "Tickets", href: "/insights/tickets", permission: "tickets" },
  { key: "dispatch", label: "Dispatch", href: "/insights/dispatch", permission: "dispatch" },
  { key: "outages", label: "Outages", href: "/insights/outages", permission: "dispatch" },
  { key: "trucks", label: "Truck stock", href: "/insights/trucks", permission: "inventory" },
  { key: "errors", label: "App errors", href: "/insights/errors", permission: "audit" },
  { key: "audit", label: "Audit log", href: "/insights/audit", permission: "audit" },
  { key: "permissions", label: "Permissions", href: "/insights/permissions", permission: "users" },
];

/** Tabs across the top of every insights page; only shows the ones the person may open. */
export function InsightsNav({ current, permissions }: { current: string; permissions: string[] }) {
  return (
    <div className={styles.tabs} role="tablist" aria-label="Insights">
      {TABS.filter((tab) => permissions.includes(tab.permission)).map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          role="tab"
          aria-selected={tab.key === current}
          className={tab.key === current ? styles.tabOn : styles.tab}
          style={{ textDecoration: "none" }}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
