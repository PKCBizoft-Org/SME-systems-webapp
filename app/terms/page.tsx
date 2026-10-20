 
import type { Metadata } from "next";
import { LegalLayout, CONTACT_EMAIL } from "../components/LegalLayout";
import styles from "../components/legal.module.css";

export const metadata: Metadata = { title: "Terms and Conditions" };

export default function TermsPage() {
  return (
    <LegalLayout kicker="LEGAL" title="Terms and Conditions" current="/terms">
      <p className={styles.lead}>
        These terms are the agreement between you and PKC BIZOFT (&ldquo;PKC&rdquo;, &ldquo;we&rdquo;) for the PKC BIZOFT website,
        the PKC BIZOFT mobile app and the home internet service we provide. By creating an account or using the service you
        agree to them. If you do not agree, please do not create an account.
      </p>

      <section className={styles.sec}>
        <h2>1. Your account</h2>
        <ul>
          <li>You must give true and complete details (name, email, mobile number, installation address) and keep them up to date.</li>
          <li>You must be at least 18, or have a parent or guardian who accepts these terms for you.</li>
          <li>You are responsible for your password and for what happens under your account. Tell us at once if you think someone else has access.</li>
          <li>One household account per service address. Accounts cannot be sold or transferred without our written approval.</li>
        </ul>
      </section>

      <section className={styles.sec}>
        <h2>2. The service and installation</h2>
        <ul>
          <li>Applying for a plan does not guarantee service. We approve applications based on coverage and availability at your address.</li>
          <li>Our technicians visit the address you gave. You agree to allow safe access and to be present, or to sign off in the app if you are not home.</li>
          <li>The one-time installation fee (shown when you apply) is paid at that time. The plan is billed after installation and is due on the last day of each month. Equipment we install (such as the modem) stays our property unless we tell you otherwise in writing.</li>
          <li>Speeds shown (for example 50, 80, 120 or 200 Mbps) are maximum plan speeds. Actual speed varies with your device, Wi-Fi, weather, network load and other things outside our control.</li>
          <li>We may pause the service for maintenance, repairs or outages. We will try to post notices in the app.</li>
        </ul>
      </section>

      <section className={styles.sec}>
        <h2>3. Bills, payment and disconnection</h2>
        <ul>
          <li>One monthly bill is issued for each calendar month. Your bill shows on the 15th of the month if you were installed on the 1st to the 14th, and on the 25th if you were installed on the 15th or later. The month you are installed in is billed too, in full, due on its last day.</li>
          <li><b>Due date:</b> the last day of the month.</li>
          <li><b>Grace period:</b> until the 4th of the next month. Your service stays on.</li>
          <li><b>Disconnection:</b> on the 5th of the next month, an account with an unpaid bill can be disconnected.</li>
          <li><b>Termination:</b> if the bill is still unpaid 30 days after disconnection, the account is terminated automatically and the remaining balance stays payable.</li>
          <li>Payments are made by GCash, bank transfer or cash and are counted only after our Accounting team has checked and confirmed them. Send a true reference number and proof of payment. Sending false proof is a breach of these terms.</li>
          <li>Prices can change. We will tell you in the app before a new price applies to your next bill.</li>
          <li>Accounting may add one-time charges (such as an installation fee or an adjustment). They show on your bills.</li>
        </ul>
      </section>

      <section className={styles.sec}>
        <h2>4. Referrals</h2>
        <p>
          If you invite a friend with your referral code, you may earn a reward (currently PHP 250 per qualifying referral, after
          your friend&rsquo;s installation and first payment are confirmed). Withdrawals carry a
          PHP 5 fee. We may change or end the referral program, and we may refuse or cancel rewards we reasonably believe came from
          false, duplicate or self-referred accounts.
        </p>
      </section>

      <section className={styles.sec}>
        <h2>5. Acceptable use</h2>
        <ul>
          <li>Do not use the service for anything illegal, including fraud, harassment, or sharing prohibited content.</li>
          <li>Do not resell or share the connection outside your household without our approval.</li>
          <li>Do not interfere with the network, our equipment, or other customers&rsquo; service, and do not attempt to break into, scan or overload our website, app or servers.</li>
          <li>Do not use another person&rsquo;s identity, or upload photos or signatures you have no right to share.</li>
        </ul>
        <p>We may suspend or end an account that breaks these rules.</p>
      </section>

      <section className={styles.sec}>
        <h2>6. Repairs, photos and signatures</h2>
        <p>
          When you request a repair, our technicians may take photos of the equipment and site, record your location pin and ask for
          your signature to show the job was done. These records protect both of us. See the{" "}
          <a href="/privacy" className={styles.link}>
            Privacy Policy
          </a>{" "}
          for how we handle them.
        </p>
      </section>

      <section className={styles.sec}>
        <h2>7. Our responsibility</h2>
        <p>
          We work to keep the service and the app running, but we do not promise they will be uninterrupted or error-free. To the
          extent the law allows, we are not liable for indirect or consequential losses (such as lost income or lost data) caused by
          outages, delays or things outside our reasonable control. Nothing in these terms removes rights you have under Philippine
          law, including consumer protection law, and nothing limits liability that cannot lawfully be limited.
        </p>
      </section>

      <section className={styles.sec}>
        <h2>8. Ending the service</h2>
        <p>
          You can ask to end the service at any time by contacting us. Bills issued and amounts already due remain payable, and you
          must return our equipment in good condition. We may end the service for unpaid bills, breaking these terms, or if we can
          no longer serve your address.
        </p>
      </section>

      <section className={styles.sec}>
        <h2>9. Changes to these terms</h2>
        <p>
          We may update these terms. When we do, we change the date at the top and, for important changes, tell you in the app. If you
          keep using the service after the change, you accept the new terms.
        </p>
      </section>

      <section className={styles.sec}>
        <h2>10. Governing law and complaints</h2>
        <p>
          These terms follow the laws of the Republic of the Philippines. Please tell us about a problem first at {CONTACT_EMAIL} so we
          can try to fix it. Courts of the Philippines have jurisdiction over any dispute we cannot settle.
        </p>
      </section>

      <div className={styles.box}>
        Related:{" "}
        <a href="/privacy" className={styles.link}>
          Privacy Policy
        </a>{" "}
        ·{" "}
        <a href="/cookies" className={styles.link}>
          Cookie Notice
        </a>
      </div>
    </LegalLayout>
  );
}
