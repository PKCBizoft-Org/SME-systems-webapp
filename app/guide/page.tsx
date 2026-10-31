 
import type { Metadata } from "next";
import { LegalLayout } from "../components/LegalLayout";
import styles from "../components/legal.module.css";

export const metadata: Metadata = { title: "How to use PKC BIZOFT" };

type Step = [string, string];

const CUSTOMER: Step[] = [
  ["Create your account", "Open the app or the website, choose Sign up, fill in your name, email, mobile number and address, then enter the 6-digit code we email you. Read and accept the Terms and Privacy Policy."],
  ["Apply for a plan", "On Home, tap Apply for a Plan, pick a speed (50, 80, 120 or 200 Mbps) and pay the one-time installation fee. Your plan is billed after installation, due on the last day of the month. Send the GCash or bank reference number and a photo of your proof."],
  ["Wait for approval", "Accounting checks your payment. You will get a notice, and the progress card on Home shows each step: payment checked, technician assigned, technician arrived, started working, completed."],
  ["Installation day", "A technician comes to your address. If you are not home, you can sign off in the app afterwards. Billing starts after sign-off."],
  ["Pay your bills", "Open Plan & Bills. Your bill shows its dates: pay by the last day of the month, grace until the 4th, disconnection on the 5th. Tap Pay, choose GCash or bank, upload your proof. Accounting confirms it."],
  ["Request a repair", "Go to Requests, choose the problem, add a photo if you can, and send. A technician is assigned and you can chat with them from the request."],
  ["Refer and earn", "Open Referrals, share your code. You earn when your friend is installed and has paid."],
  ["Stay informed", "The inbox and push notifications tell you about bills, reminders from Accounting, outages and job updates. Profile has your details, password and sign out."],
];

const TECHNICIAN: Step[] = [
  ["Dashboard", "Shows your open jobs, your performance and your stock at a glance."],
  ["Jobs", "Open jobs nearest to you come first. Tap one to see the customer, the address pin and the route. You can hold up to 3 active jobs. Accept a job, go solo or ask to team up."],
  ["Arrive and work", "Tap I have arrived when you reach the house. That starts the job. Fill in the checklist, scan the modem serial, take photos and get the customer signature."],
  ["Finish", "Mark completed (you must have arrived first). A job you cannot finish can be handed back. No signal? Your notes are saved and sent when you are online."],
  ["Materials", "Take items from the store and use them on a job. Your truck stock shows what you carry."],
  ["Profile", "Your details, rating and password. Live location is shared only while the Jobs screen is open."],
];

const ACCOUNTING: Step[] = [
  ["Check payments", "On the Accounting page, the top card lists payments waiting. Open your GCash or bank history, confirm the money arrived, then verify or reject (with a reason)."],
  ["Customers and bills", "Open a customer to see their bills, payments, billing day and service status. You can add an Installation Fee or Adjustment bill and send a reminder."],
  ["Grace and disconnection", "The Grace and disconnection panel lists who is late, grouped by stage, with a Remind button."],
  ["Collections and reports", "Collections shows money in by day and month. Reports and Insights show revenue and tickets."],
  ["Referral payouts", "Under More, approve or reject referral withdrawals."],
];

const ADMIN: Step[] = [
  ["Users", "Invite staff, set roles (admin, accounting, technician, inventory), and approve or disable accounts."],
  ["Clients", "Search every customer, assign jobs and review installation and repair evidence."],
  ["Insights", "Analytics, tickets, dispatch board, outages, truck stock, errors, audit log and role permissions."],
  ["Staff security", "Staff sign in with a password, an emailed code and a second password. Only the owner can reset a forgotten second password."],
];

function Steps({ title, steps }: { title: string; steps: Step[] }) {
  return (
    <section className={styles.sec}>
      <h2>{title}</h2>
      {steps.map(([head, body], i) => (
        <div className={styles.card} key={head}>
          <b>
            {i + 1}. {head}
          </b>
          <div style={{ marginTop: 4, color: "rgba(203,230,237,.78)", lineHeight: 1.6, fontSize: 14 }}>{body}</div>
        </div>
      ))}
    </section>
  );
}

export default function GuidePage() {
  return (
    <LegalLayout kicker="Tutorial" title="How to use PKC BIZOFT" current="/guide">
      <p className={styles.lead}>
        A short walk-through for each kind of user. In the mobile app the same tour opens the first time you sign in, and you can
        open it again from Profile &rarr; App tour.
      </p>
      <Steps title="Customers (mobile app)" steps={CUSTOMER} />
      <Steps title="Technicians (mobile app)" steps={TECHNICIAN} />
      <Steps title="Accounting (website)" steps={ACCOUNTING} />
      <Steps title="Admins (website)" steps={ADMIN} />
      <div className={styles.box}>
        Stuck? The Help center in the app has quick fixes (Wi-Fi, slow speed, billing), or write to us from the contact address below.
      </div>
    </LegalLayout>
  );
}
