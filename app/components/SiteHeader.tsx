import Link from "next/link";
import styles from "./site-pages.module.css";

// Header shared by the standalone public pages (404, download).
// Plain <img> on purpose: it is a 40px static logo, and next/image would add
// a loader and layout shift for no gain here.
export function SiteHeader() {
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
        <Link href="/" className={styles.headerLink}>
          Home
        </Link>
        <Link href="/login" className={styles.headerLink}>
          Sign in
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return <footer className={styles.footer}>PKC BIZOFT · Business operations platform</footer>;
}
