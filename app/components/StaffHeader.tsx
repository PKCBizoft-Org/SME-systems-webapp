import Link from "next/link";
import styles from "./staff-chrome.module.css";
import { LowRatingsBadge } from "./LowRatingsBadge";
import { PendingPaymentsBadge } from "./PendingPaymentsBadge";
import { StaffGuard } from "./StaffGuard";

export type StaffSection = "clients" | "inventory" | "accounting" | "ratings" | "users" | "account";

const SECTIONS: { key: StaffSection; label: string; href: string; roles: string[] }[] = [
  { key: "clients", label: "Clients", href: "/clients", roles: ["admin", "technician", "inventory", "accounting"] },
  { key: "inventory", label: "Inventory", href: "/inventory", roles: ["admin", "inventory"] },
  { key: "accounting", label: "Accounting", href: "/accounting", roles: ["admin", "accounting"] },
  { key: "ratings", label: "Ratings", href: "/ratings", roles: ["admin", "accounting"] },
  { key: "users", label: "Users", href: "/users", roles: ["admin"] },
];

// One header for every signed-in staff page, so the brand, navigation and
// session indicator look and behave the same everywhere. A section only shows
// up for roles that are allowed to open it.
export function StaffHeader({ current, roles }: { current: StaffSection; roles: string[] }) {
  const visible = SECTIONS.filter((section) => section.roles.some((role) => roles.includes(role)));

  return (
    <>
      <StaffGuard />
      {/* soft ambient light behind every staff page */}
      <div className={styles.aurora} aria-hidden="true" />
      <header className={styles.bar}>
      <Link href="/" className={styles.brand} aria-label="PKC BIZOFT home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pkc-logo.webp" alt="" width={34} height={34} />
        <span>
          PKC <strong>BIZOFT</strong>
        </span>
      </Link>

      <nav className={styles.nav} aria-label="Primary">
        {visible.map((section) => (
          <Link
            key={section.key}
            href={section.href}
            className={`${styles.link} ${section.key === current ? styles.active : ""}`}
            aria-current={section.key === current ? "page" : undefined}
          >
            {section.label}
            {section.key === "accounting" ? <PendingPaymentsBadge /> : null}
            {section.key === "ratings" ? <LowRatingsBadge /> : null}
          </Link>
        ))}
      </nav>

      <Link href="/account" className={styles.session} title="My account and password">
        <i aria-hidden="true" />
        Secure session · Account
      </Link>
      </header>
    </>
  );
}
