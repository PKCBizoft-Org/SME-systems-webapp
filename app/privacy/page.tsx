 
import type { Metadata } from "next";
import { LegalLayout, CONTACT_EMAIL } from "../components/LegalLayout";
import styles from "../components/legal.module.css";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalLayout kicker="Legal" title="Privacy Policy" current="/privacy">
      <p className={styles.lead}>
        PKC BIZOFT respects your privacy and follows the Data Privacy Act of 2012 (Republic Act No. 10173) and its rules. This policy
        explains what personal information we collect, why, who sees it, and what rights you have. We are the personal information
        controller. You can reach us, including our data protection contact, at {CONTACT_EMAIL}.
      </p>

      <section className={styles.sec}>
        <h2>1. What we collect</h2>
        <table>
          <tbody>
            <tr><th>Information</th><th>Why we need it</th></tr>
            <tr><td>Name, email, mobile number, password (stored hashed, never readable)</td><td>To create and secure your account and contact you.</td></tr>
            <tr><td>Address (region, province, city, barangay, purok) and location pin</td><td>To check coverage, install, repair and bill you, and to send the nearest technician.</td></tr>
            <tr><td>Plan, bills, payments, GCash number or bank name, reference numbers, payment proof images</td><td>To bill you and confirm payments.</td></tr>
            <tr><td>Installation and repair records: photos, checklists, modem serial number, signatures, ratings and chat messages</td><td>To do and prove the work, and to improve service.</td></tr>
            <tr><td>Referral details (codes, who referred whom, reward and withdrawal records)</td><td>To run the referral program.</td></tr>
            <tr><td>Phone push notification token, app version, crash and error reports</td><td>To send notices and fix bugs.</td></tr>
            <tr><td>IP address and device type, handled by our hosting and database providers when you use the site or app</td><td>To deliver the service and keep it safe.</td></tr>
            <tr><td>Sign-in attempts and audit records</td><td>To stop abuse and protect accounts.</td></tr>
            <tr><td>Technicians only: live location while the Jobs screen is open</td><td>To dispatch the nearest technician and show arrival.</td></tr>
          </tbody>
        </table>
        <p>We do not ask for government ID numbers, and we do not sell your personal information.</p>
      </section>

      <section className={styles.sec}>
        <h2>2. Why we may use it</h2>
        <ul>
          <li>To provide the service you asked for, and to bill and collect for it (contract).</li>
          <li>To follow the law, such as tax, accounting and record-keeping rules.</li>
          <li>For our legitimate interests: security, fraud prevention, fixing problems and improving service.</li>
          <li>With your consent, where we ask for it, for example your location pin, camera or photos, and push notifications. You can withdraw consent in your phone settings or by writing to us.</li>
        </ul>
      </section>

      <section className={styles.sec}>
        <h2>3. Who handles your data</h2>
        <p>Only our staff who need it for their job (admins, Accounting, technicians for their own jobs) can see it. We use these service providers to run the system:</p>
        <ul>
          <li><b>Supabase</b> &ndash; database, sign-in and file storage.</li>
          <li><b>Vercel</b> &ndash; hosting for the website and its server functions.</li>
          <li><b>Google (Gmail, Firebase)</b> &ndash; sending our emails with verification codes, and phone push notifications.</li>
          <li><b>Semaphore</b> &ndash; SMS alerts, where used.</li>
          <li><b>OpenStreetMap Nominatim and Google Maps</b> &ndash; finding and showing addresses and routes.</li>
          <li><b>GCash and your bank</b> &ndash; when you pay. We do not receive your GCash PIN or bank password.</li>
        </ul>
        <p>
          Some providers store data outside the Philippines. We use them only to run the service, and we expect them to protect the
          data. We may also share information when the law, a court or a government agency requires it.
        </p>
      </section>

      <section className={styles.sec}>
        <h2>4. How long we keep it</h2>
        <p>
          We keep your information while your account is active and afterwards only as long as needed for billing, tax and accounting
          records, disputes and legal requirements. Then we delete it or make it anonymous. Login-attempt and error records are kept
          for a shorter time.
        </p>
      </section>

      <section className={styles.sec}>
        <h2>5. How we protect it</h2>
        <ul>
          <li>Passwords are hashed. Connections use HTTPS.</li>
          <li>Access is limited by role. Staff accounts need a password, an emailed code and a second password.</li>
          <li>Payment approval, reminders and account changes are recorded in an audit log.</li>
          <li>An account locks for 15 minutes after 5 wrong passwords within 15 minutes.</li>
        </ul>
        <p>
          No system is perfectly secure. If a breach seriously affects you, we will tell you and the National Privacy Commission as the
          law requires.
        </p>
      </section>

      <section className={styles.sec}>
        <h2>6. Your rights</h2>
        <p>Under the Data Privacy Act you may:</p>
        <ul>
          <li>be informed about how your data is used;</li>
          <li>access a copy of your data;</li>
          <li>correct wrong or outdated data;</li>
          <li>object to processing, or ask us to suspend, block, remove or destroy your data in the cases the law allows;</li>
          <li>ask for your data in a portable form;</li>
          <li>claim compensation for damage caused by unlawful use of your data;</li>
          <li>complain to the National Privacy Commission (privacy.gov.ph).</li>
        </ul>
        <p>
          To use a right, email {CONTACT_EMAIL} from the address on your account. We may need to confirm it is you. Some records (for
          example bills and payments) must be kept by law, so we may not be able to delete them at once.
        </p>
      </section>

      <section className={styles.sec}>
        <h2>7. Children</h2>
        <p>The service is for adults. We do not knowingly collect information from children. If you think a child gave us data, tell us and we will remove it.</p>
      </section>

      <section className={styles.sec}>
        <h2>8. Cookies and similar storage</h2>
        <p>
          See our{" "}
          <a href="/cookies" className={styles.link}>
            Cookie Notice
          </a>
          .
        </p>
      </section>

      <section className={styles.sec}>
        <h2>9. Changes</h2>
        <p>We may update this policy. The date at the top shows the latest version, and we will tell you in the app about important changes.</p>
      </section>
    </LegalLayout>
  );
}
