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
