import Link from "next/link";
import styles from "./site-pages.module.css";

// Header shared by the standalone public pages (404, download).
// Plain <img> on purpose: it is a 40px static logo, and next/image would add
// a loader and layout shift for no gain here.
// Same links, same order as the home page navbar.
export const NAV_LINKS = [
  { href: "/#network", label: "Network" },
  { href: "/#systems", label: "Systems" },
  { href: "/who-we-are", label: "Who We Are" },
  { href: "/#features", label: "Capabilities" },
];

export function SiteHeader({ current }: { current?: string }) {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label="PKC BIZOFT home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pkc-logo.webp" alt="" className={styles.brandLogo} width={40} height={40} />
        <span className={styles.brandText}>
          PKC <span>BIZOFT</span>
        </span>
      </Link>

      <nav className={styles.headerLinks} aria-label="Primary">
        {NAV_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`${styles.headerLink} ${l.href === current ? styles.headerLinkOn : ""} ${styles.hideSmall}`}
          >
            {l.label}
          </Link>
        ))}
        <Link href="/download" className={`${styles.headerLink} ${current === "/download" ? styles.headerLinkOn : ""}`}>
          Get the app
        </Link>
        <Link href="/login" className={styles.enterButton}>
          Enter system ↗
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      PKC BIZOFT · Business operations platform
      <div style={{ marginTop: 8, display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
        <a href="/terms" style={{ color: "inherit" }}>Terms</a>
        <a href="/privacy" style={{ color: "inherit" }}>Privacy</a>
        <a href="/cookies" style={{ color: "inherit" }}>Cookies</a>
        <a href="/guide" style={{ color: "inherit" }}>Guide</a>
      </div>
    </footer>
  );
}
