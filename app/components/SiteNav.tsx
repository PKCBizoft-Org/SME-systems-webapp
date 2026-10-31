"use client";

import { useEffect, useState } from "react";
/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */
import styles from "./site-nav.module.css";

// The public navbar for every public page except home (home has its own with the language switch).
// Plain <a> on purpose, same as the other public pages. Same links, same order as the home page.
export const NAV_LINKS = [
  { href: "/#systems", label: "Systems" },
  { href: "/who-we-are", label: "Who we are" },
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
    <header className={styles.header}>
      <nav className={styles.nav} aria-label="Primary navigation">
        <a className={styles.brand} href="/" aria-label="PKC BIZOFT home">
          <img src="/pkc-logo.webp" alt="" width={32} height={32} />
          <span>PKC BIZOFT</span>
        </a>

        <div className={styles.links}>
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className={l.href === current ? styles.on : undefined} aria-current={l.href === current ? "page" : undefined}>
              {l.label}
            </a>
          ))}
        </div>

        <div className={styles.right}>
          <a className={styles.text} href="/download">
            Get the app
          </a>
          <a className={styles.text} href="/login">
            Log in
          </a>
          <a className={styles.cta} href="/#contact">
            Talk to us
          </a>
        </div>

        <button
          type="button"
          className={styles.burger}
          onClick={() => setOpen((v) => !v)}
          aria-label="Menu"
          aria-expanded={open}
          aria-controls="site-menu"
        >
          <span />
          <span />
        </button>
      </nav>

      {open ? (
        <div className={styles.menu} id="site-menu">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
          <a href="/download">Get the app</a>
          <a href="/login">Log in</a>
          <a className={styles.cta} href="/#contact" onClick={() => setOpen(false)}>
            Talk to us
          </a>
        </div>
      ) : null}
    </header>
  );
}
