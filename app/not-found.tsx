import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "./components/SiteHeader";
import shared from "./components/site-pages.module.css";
import styles from "./not-found.module.css";

export const metadata: Metadata = {
  title: "Page not found",
  description: "The page you were looking for does not exist.",
};

// Shown for any URL that doesn't match a route (typed wrong, old link, or a
// redirect to something that was removed).
export default function NotFound() {
  return (
    <div className={shared.page}>
      <SiteHeader />

      <main className={shared.main}>
        <div className={styles.layout}>
          <section>
            <p className={shared.kicker}>Error 404 · Signal lost</p>
            <h1 className={shared.title}>
              This page drifted <em>off the network.</em>
            </h1>
            <p className={shared.lead}>
              The address you opened doesn&apos;t exist, or it was moved. Check the link for typos,
              or head back to somewhere that does.
            </p>

            <div className={shared.actions}>
              <Link href="/" className={shared.primary}>
                Back to home
              </Link>
              <Link href="/login" className={shared.secondary}>
                Sign in
              </Link>
            </div>

            <nav className={styles.quickLinks} aria-label="Helpful links">
              <span className={styles.quickLabel}>Try instead</span>
              <Link href="/who-we-are" className={styles.quickLink}>
                Who we are
              </Link>
              <Link href="/download" className={styles.quickLink}>
                Get the app
              </Link>
              <Link href="/login/SignUp" className={styles.quickLink}>
                Create an account
              </Link>
            </nav>
          </section>

          <div className={styles.radar} aria-hidden="true">
            <span className={styles.ring} />
            <span className={styles.ring} />
            <span className={styles.ring} />
            <span className={styles.sweep} />
            <span className={styles.code}>404</span>
            <span className={styles.lost}>No route</span>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
