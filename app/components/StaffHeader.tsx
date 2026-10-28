"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import styles from "./staff-chrome.module.css";
import { createClient } from "../../lib/supabaseClient";
import { LowRatingsBadge } from "./LowRatingsBadge";
import { PendingPaymentsBadge } from "./PendingPaymentsBadge";
import { PendingWithdrawalsBadge } from "./PendingWithdrawalsBadge";
import { StaffGuard } from "./StaffGuard";
import { GlobalSearch } from "./GlobalSearch";
import { YesNoDialog } from "./YesNoDialog";

const supabase = createClient();

export type StaffSection = "clients" | "inventory" | "accounting" | "ratings" | "insights" | "users" | "account";

type GroupKey = "customers" | "field" | "inventory" | "billing" | "reports" | "admin";

type Item = {
  label: string;
  href: string;
  /** Hidden unless my_permissions() includes it. The pages check again on their own. */
  permission?: string;
  adminOnly?: boolean;
  badge?: "payments" | "ratings" | "withdrawals";
};

// Every staff page sits in exactly one group. The top row shows the groups, the
// second row shows the pages of the group you are in, so you always know where
// you are and where the neighbouring pages are. URLs are unchanged.
const GROUPS: { key: GroupKey; label: string; roles: string[]; badge?: Item["badge"]; items: Item[] }[] = [
  {
    key: "customers",
    label: "Customers",
    roles: ["admin", "technician", "inventory", "accounting"],
    badge: "ratings",
    items: [
      { label: "All clients", href: "/clients" },
      { label: "Ratings", href: "/ratings", permission: "ratings", badge: "ratings" },
    ],
  },
  {
    key: "field",
    label: "Field work",
    roles: ["admin", "accounting", "inventory"],
    items: [
      { label: "Mission control", href: "/insights/map", permission: "dispatch" },
      { label: "Dispatch", href: "/insights/dispatch", permission: "dispatch" },
      { label: "Tickets", href: "/insights/tickets", permission: "tickets" },
      { label: "Outages", href: "/insights/outages", permission: "dispatch" },
      { label: "Truck stock", href: "/insights/trucks", permission: "inventory" },
    ],
  },
  {
    key: "inventory",
    label: "Inventory",
    roles: ["admin", "inventory"],
    items: [{ label: "Inventory", href: "/inventory" }],
  },
  {
    key: "billing",
    label: "Billing",
    roles: ["admin", "accounting"],
    badge: "payments",
    items: [
      { label: "Overview", href: "/accounting" },
      { label: "Verify payments", href: "/accounting/verification", badge: "payments" },
      { label: "Collections", href: "/accounting/collections" },
      { label: "Referral payouts", href: "/accounting/referrals", badge: "withdrawals" },
      { label: "Plans & prices", href: "/accounting/plans" },
      { label: "Reports", href: "/accounting/reports" },
      { label: "Billing audit", href: "/accounting/audit", adminOnly: true },
    ],
  },
  {
    key: "reports",
    label: "Insights",
    roles: ["admin", "accounting"],
    items: [
      { label: "Revenue analytics", href: "/insights/analytics", permission: "analytics" },
      { label: "Expansion planner", href: "/insights/expansion", adminOnly: true },
      { label: "App errors", href: "/insights/errors", permission: "audit" },
      { label: "Audit log", href: "/insights/audit", permission: "audit" },
    ],
  },
  {
    key: "admin",
    label: "Admin",
    roles: ["admin"],
    items: [
      { label: "Users", href: "/users" },
      { label: "Permissions", href: "/insights/permissions", permission: "users" },
    ],
  },
];

// Used only when the address matches no item (e.g. /account).
const FALLBACK: Partial<Record<StaffSection, GroupKey>> = {
  clients: "customers",
  ratings: "customers",
  inventory: "inventory",
  accounting: "billing",
  insights: "reports",
  users: "admin",
};

const PERMS_KEY = "pkc-staff-perms";
let perms: string[] | null | undefined;
let permsRequested = false;
const listeners = new Set<() => void>();

// One request per tab, remembered for the session so the menu does not flicker between pages.
function subscribePerms(onChange: () => void) {
  listeners.add(onChange);
  if (!permsRequested) {
    permsRequested = true;
    void Promise.resolve(supabase.rpc("my_permissions")).then(({ data }) => {
      if (!Array.isArray(data)) return;
      perms = data as string[];
      try {
        sessionStorage.setItem(PERMS_KEY, JSON.stringify(perms));
      } catch {}
      listeners.forEach((listener) => listener());
    });
  }
  return () => {
    listeners.delete(onChange);
  };
}

function getPerms() {
  if (perms === undefined) {
    try {
      const raw = sessionStorage.getItem(PERMS_KEY);
      perms = raw ? (JSON.parse(raw) as string[]) : null;
    } catch {
      perms = null;
    }
  }
  return perms;
}

function Badge({ kind }: { kind?: Item["badge"] }) {
  if (kind === "payments") return <PendingPaymentsBadge />;
  if (kind === "ratings") return <LowRatingsBadge />;
  if (kind === "withdrawals") return <PendingWithdrawalsBadge />;
  return null;
}

function matches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// One header for every signed-in staff page, so the brand, navigation and
// session indicator look and behave the same everywhere. A group only shows
// up for roles that are allowed to open it.
export function StaffHeader({ current, roles }: { current: StaffSection; roles: string[] }) {
  const pathname = usePathname() || "";
  const perms = useSyncExternalStore(subscribePerms, getPerms, () => null);
  const router = useRouter();
  const [askHome, setAskHome] = useState(false);
  const closeAskHome = useCallback(() => setAskHome(false), []);

  const isAdmin = roles.includes("admin");
  // Accounting only handles money, so Billing is the only group they get.
  const accountingOnly =
    roles.includes("accounting") && !["admin", "technician", "inventory"].some((role) => roles.includes(role));

  const visible = GROUPS.filter((group) =>
    accountingOnly ? group.key === "billing" : group.roles.some((role) => roles.includes(role)),
  )
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (!item.adminOnly || isAdmin) && (!item.permission || isAdmin || (perms?.includes(item.permission) ?? false)),
      ),
    }))
    .filter((group) => group.items.length > 0);

  // The longest matching address wins, so /accounting/plans is "Plans", not "Overview".
  let activeHref = "";
  let activeGroup: GroupKey | undefined;
  for (const group of visible) {
    for (const item of group.items) {
      if (matches(pathname, item.href) && item.href.length > activeHref.length) {
        activeHref = item.href;
        activeGroup = group.key;
      }
    }
  }
  if (!activeGroup && current !== "account") activeGroup = FALLBACK[current];
  const active = visible.find((group) => group.key === activeGroup);

  return (
    <>
      <StaffGuard />
      {/* soft ambient light behind every staff page */}
      <div className={styles.aurora} aria-hidden="true" />
      <header className={styles.bar}>
      {/* Leaving the staff pages means signing in again, so the logo logs out, after asking. */}
      <Link
        href="/"
        className={styles.brand}
        aria-label="Log out and go to the PKC BIZOFT home page"
        title="Log out and go to the home page"
        onClick={(event) => {
          event.preventDefault();
          setAskHome(true);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pkc-logo.webp" alt="" width={34} height={34} />
        <span>
          PKC <strong>BIZOFT</strong>
        </span>
        <span className={styles.homeTag} aria-hidden="true">
          ⏻ Log out
        </span>
      </Link>

      <nav className={styles.nav} aria-label="Primary">
        {visible.map((group) => (
          <Link
            key={group.key}
            href={group.items[0].href}
            className={`${styles.link} ${group.key === activeGroup ? styles.active : ""}`}
            aria-current={group.key === activeGroup ? "true" : undefined}
          >
            {group.label}
            {group.key === activeGroup && group.items.length > 1 ? null : <Badge kind={group.badge} />}
          </Link>
        ))}
      </nav>

      <div className={styles.searchSlot}>
        <GlobalSearch roles={roles} />
      </div>

      <Link
        href="/account"
        className={`${styles.session} ${current === "account" ? styles.sessionOn : ""}`}
        title="My account and password"
      >
        <i aria-hidden="true" />
        Secure session · Account
      </Link>
      </header>

      {active && active.items.length > 1 ? (
        <nav className={styles.subnav} aria-label={active.label}>
          <span className={styles.subnavTitle}>{active.label}</span>
          {active.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.subLink} ${item.href === activeHref ? styles.subActive : ""}`}
              aria-current={item.href === activeHref ? "page" : undefined}
            >
              {item.label}
              <Badge kind={item.badge} />
            </Link>
          ))}
        </nav>
      ) : null}

      <YesNoDialog
        open={askHome}
        title="Log out?"
        message="You will be signed out and taken to the home page. You will need to sign in again to come back."
        onYes={async () => {
          await supabase.auth.signOut();
          router.push("/");
        }}
        onNo={closeAskHome}
      />
    </>
  );
}
