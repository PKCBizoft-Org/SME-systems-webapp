"use client";

import { useEffect, useState } from "react";
/* eslint-disable @next/next/no-html-link-for-pages */
import styles from "./site-nav.module.css";

// The public navbar, styled like the home page one. Used by every public page except home
// (which keeps its own copy because it adds the live clock). Plain <a> on purpose, same as the
// other public pages. Same links, same order as the home page.
export const NAV_LINKS = [
  { href: "/#plans", label: "Plans" },
  { href: "/#systems", label: "How It Works" },
  { href: "/who-we-are", label: "Who We Are" },
  { href: "/#contact", label: "Contact" },
];

export function SiteNav({ current }: { current?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <nav className={styles.nav} aria-label="Primary navigation">
      <a className={styles.brand} href="/" aria-label="PKC BIZOFT home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.logo} src="/pkc-logo.webp" alt="" width={34} height={34} />
        <span>
          <strong>PKC</strong>
          <small>BIZOFT</small>
        </span>
      </a>

      <div className={styles.links}>
        {NAV_LINKS.map((l) => (
          <a key={l.href} href={l.href} className={l.href === current ? styles.on : undefined}>
            {l.label}
          </a>
        ))}
      </div>

      <div className={styles.right}>
        <a className={styles.app} href="/download">
          GET THE APP <em>ANDROID</em>
        </a>
        <a className={styles.enter} href="/login">
          LOG IN <span>↗</span>
        </a>
        <button
          type="button"
          className={`${styles.burger} ${open ? styles.burgerOpen : ""}`}
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle navigation"
          aria-expanded={open}
        >
          <span />
          <span />
        </button>
      </div>

      <div className={`${styles.menu} ${open ? styles.menuOpen : ""}`}>
        {NAV_LINKS.map((l, i) => (
          <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
            {l.label.toUpperCase()} <b>0{i + 1}</b>
          </a>
        ))}
        <a href="/download" onClick={() => setOpen(false)}>
          GET THE APP <b>↓</b>
        </a>
        <a href="/login" onClick={() => setOpen(false)}>
          LOG IN <b>↗</b>
        </a>
      </div>
    </nav>
  );
}
