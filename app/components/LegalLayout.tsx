/* Plain <a> on purpose, same as the other public pages. */
/* eslint-disable @next/next/no-html-link-for-pages */
import type { ReactNode } from "react";
import styles from "./legal.module.css";
import { NAV_LINKS } from "./SiteHeader";

export const LEGAL_UPDATED = "October 15, 2026";
export const CONTACT_EMAIL = "pkc.netlink.biz@gmail.com";

const LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/cookies", label: "Cookies" },
  { href: "/guide", label: "How to use the app" },
];

export function LegalLayout({
  kicker,
  title,
  current,
  children,
}: {
  kicker: string;
  title: string;
  current: string;
  children: ReactNode;
}) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <nav className={styles.nav}>
          <a href="/" className={styles.home}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pkc-logo.webp" alt="" width={28} height={28} style={{ borderRadius: 8 }} />
            PKC <b>BIZOFT</b>
          </a>
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
          <a href="/download">Get the app</a>
          <a href="/login" className={styles.on}>
            Enter system ↗
          </a>
        </nav>
        <nav className={styles.nav} aria-label="Legal pages">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className={l.href === current ? styles.on : undefined}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className={styles.kicker}>{kicker}</div>
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.updated}>Last updated {LEGAL_UPDATED}</div>
        {children}
        <div className={styles.foot}>
          Questions? Write to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className={styles.link}>
            {CONTACT_EMAIL}
          </a>
          .
        </div>
      </div>
    </main>
  );
}
