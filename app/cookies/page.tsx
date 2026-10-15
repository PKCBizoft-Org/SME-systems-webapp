import type { Metadata } from "next";
import { LegalLayout } from "../components/LegalLayout";
import styles from "../components/legal.module.css";

export const metadata: Metadata = { title: "Cookie Notice" };

export default function CookiesPage() {
  return (
    <LegalLayout kicker="LEGAL" title="Cookie Notice" current="/cookies">
      <p className={styles.lead}>
        Cookies and browser storage are small pieces of data a website keeps on your device. PKC BIZOFT uses only what the site needs
        to work. We do not use advertising or tracking cookies, and we do not sell data to advertisers.
      </p>

      <section className={styles.sec}>
        <h2>What we use</h2>
        <table>
          <tbody>
            <tr><th>Name / kind</th><th>What it does</th><th>How long</th></tr>
            <tr><td>Sign-in session (Supabase)</td><td>Keeps you signed in and keeps your account secure.</td><td>Until you sign out or the session expires.</td></tr>
            <tr><td>Cookie notice choice</td><td>Remembers that you have seen this notice so we do not show it on every visit.</td><td>Until you clear your browser data.</td></tr>
            <tr><td>Display settings</td><td>Remembers that the site should run in its lighter mode on slower devices.</td><td>Until you clear your browser data.</td></tr>
          </tbody>
        </table>
        <p>These are strictly necessary for the site to work, so they are used without asking. They are not used to follow you around the web.</p>
        <p>
          Some safety checks are kept in our own database instead of your browser, for example the count of wrong passwords (5 wrong
          tries in 15 minutes lock the account for 15 minutes) and the emailed-code step for staff. See the{" "}
          <a href="/privacy" className={styles.link}>Privacy Policy</a> for those.
        </p>
      </section>

      <section className={styles.sec}>
        <h2>Third parties</h2>
        <p>
          Our hosting and database providers (Vercel and Supabase) may handle technical data such as your IP address to deliver the
          site and keep it safe. Maps and address search come from OpenStreetMap and Google Maps only when you use those features.
        </p>
      </section>

      <section className={styles.sec}>
        <h2>Your choices</h2>
        <p>
          You can clear cookies and site data in your browser settings at any time. Blocking the essential ones will stop sign-in from
          working. If we ever add optional cookies (for example analytics), we will ask for your permission first and update this notice.
        </p>
        <p>The mobile app does not use browser cookies. It keeps your sign-in and settings in the app&rsquo;s private storage on your phone.</p>
      </section>
    </LegalLayout>
  );
}
