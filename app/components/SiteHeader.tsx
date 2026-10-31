import styles from "./site-pages.module.css";
import { SiteNav, NAV_LINKS } from "./SiteNav";

export { NAV_LINKS };

// Header shared by the standalone public pages (404, download). One navbar, in SiteNav.
export function SiteHeader({ current }: { current?: string }) {
  return <SiteNav current={current} />;
}

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "12px 32px" }}>
        <span>PKC BIZOFT, business systems solutions</span>
        <span style={{ display: "flex", flexWrap: "wrap", gap: "8px 22px" }}>
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
          <a href="/cookies">Cookies</a>
          <a href="/guide">Guide</a>
        </span>
      </div>
    </footer>
  );
}
