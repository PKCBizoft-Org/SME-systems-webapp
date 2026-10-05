import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "../components/SiteHeader";
import shared from "../components/site-pages.module.css";
import styles from "./download.module.css";
import { PhoneDemo } from "./PhoneDemo";

export const metadata: Metadata = {
  title: "Get the app",
  description: "Download the PKC BIZOFT Android app.",
};

const REPO = "pkcbizoft26gh/pkc-bizoft-mobile";
// The file name must match the release asset; the same link the website used
// to start the download directly.
const APK_URL = `https://github.com/${REPO}/releases/latest/download/app-release.apk`;
const RELEASES_URL = `https://github.com/${REPO}/releases`;

type ReleaseInfo = {
  version: string;
  size: string | null;
};

// Reads what the download button will fetch, so the page always matches the
// newest release. This deliberately avoids the GitHub REST API, whose
// anonymous rate limit is shared per server IP and runs out quickly. The
// public "latest release" redirect gives the version, and the response
// headers of the file itself give the size. If either fails the page still
// works: the details are simply omitted, and the download button does not
// depend on them.
async function getReleaseInfo(): Promise<ReleaseInfo | null> {
  try {
    const latest = await fetch(RELEASES_URL + "/latest", {
      redirect: "manual",
      next: { revalidate: 1800 },
    });
    const location = latest.headers.get("location") ?? "";
    const tag = decodeURIComponent(location.split("/releases/tag/")[1] ?? "").trim();
    if (!tag) return null;

    let size: string | null = null;
    try {
      const file = await fetch(APK_URL, { method: "HEAD", next: { revalidate: 1800 } });
      const bytes = Number(file.headers.get("content-length"));
      if (file.ok && Number.isFinite(bytes) && bytes > 0) {
        size = `${Math.round(bytes / 1024 / 1024)} MB`;
      }
    } catch {
      // Size is optional.
    }

    return { version: tag, size };
  } catch {
    return null;
  }
}

const STEPS = [
  {
    title: "Download the file",
    text: "Tap Download APK. Your browser saves app-release.apk to your phone.",
  },
  {
    title: "Allow the install",
    text: "If Android asks, allow your browser to install unknown apps. This is normal for apps installed outside the Play Store.",
  },
  {
    title: "Open it and tap Install",
    text: "Open the downloaded file and confirm. Then sign in with your PKC BIZOFT account.",
  },
];

const FEATURES = [
  { icon: "₱", title: "Pay your bill", text: "Pay with GCash, bank transfer or cash and upload your receipt for verification." },
  { icon: "◈", title: "Track requests", text: "Request a plan change or help, and follow its status from start to finish." },
  { icon: "✦", title: "Refer and earn", text: "Share your referral code and earn rewards when your referrals become customers." },
  { icon: "⚙", title: "For technicians too", text: "Technicians get their own dashboard with jobs and customer details." },
];

// These are the same rules shown inside the app's Refer & Earn screen.
const REFERRAL_STEPS = [
  "Open **Refer & Earn** in the app to find your personal referral code, then share it.",
  "Your friend installs the app and enters your code when they sign up.",
  "Once they are a **first-time customer, installed, and accounting confirms their qualifying payment**, the reward is added to your balance.",
];

const REFERRAL_TERMS = [
  {
    value: "₱250",
    title: "For every person you refer",
    text: "The reward is added once your referral is installed and their payment is confirmed. Signing up alone does not count.",
  },
  {
    value: "0.5%",
    title: "Monthly bill discount",
    text: "A separate discount on your own monthly bill for qualifying referrers.",
  },
  {
    value: "₱5",
    title: "Transfer fee",
    text: "Deducted from each withdrawal of your referral balance.",
  },
  {
    value: "∞",
    title: "No limit",
    text: "Being referred yourself doesn't stop you from referring others. Keep earning.",
  },
];

// Renders **bold** segments without needing a markdown library.
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split("**").map((part, index) =>
        index % 2 === 1 ? <strong key={index}>{part}</strong> : part,
      )}
    </>
  );
}

export default async function DownloadPage() {
  const release = await getReleaseInfo();

  const facts = [
    { label: "Platform", value: "Android 7.0+" },
    ...(release ? [{ label: "Version", value: release.version }] : []),
    ...(release?.size ? [{ label: "Size", value: release.size }] : []),
  ];

  return (
    <div className={shared.page}>
      <SiteHeader />

      <main className={styles.main}>
        {/* ---------- hero ---------- */}
        <section className={`${styles.section} ${styles.hero}`}>
          <div>
            <p className={shared.kicker}>Mobile app · Android</p>
            <h1 className={shared.title}>
              Take PKC BIZOFT <em>with you.</em>
            </h1>
            <p className={shared.lead}>
              Check your account, pay your bill, follow your requests and earn rewards for every
              customer you refer, all from your phone.
            </p>

            <ul className={styles.facts} aria-label="App details">
              {facts.map((fact) => (
                <li key={fact.label} className={styles.fact}>
                  <span className={styles.factLabel}>{fact.label}</span>
                  <span className={styles.factValue}>{fact.value}</span>
                </li>
              ))}
            </ul>

            <div className={shared.actions}>
              {/* Plain link on purpose: this is a file download, not a page
                  navigation, and it only starts when the user clicks. */}
              <a href={APK_URL} download className={shared.primary}>
                Download APK
              </a>
              <a href="#referrals" className={shared.secondary}>
                Refer &amp; earn
              </a>
            </div>

            <p className={styles.note}>
              Android only for now. An iPhone version isn&apos;t available yet. The file is hosted on
              GitHub and is the official PKC BIZOFT build.
            </p>
          </div>

          <PhoneDemo />
        </section>

        {/* ---------- install ---------- */}
        <section className={styles.section} data-reveal id="install">
          <header className={styles.sectionHead}>
            <p className={styles.sectionKicker}>Install</p>
            <h2 className={styles.sectionTitle}>Up and running in three steps</h2>
            <p className={styles.sectionLead}>
              No Play Store needed. It takes about a minute.
            </p>
          </header>
          <ol className={styles.stepGrid}>
            {STEPS.map((step, index) => (
              <li key={step.title} className={styles.step} data-reveal>
                <span className={styles.stepNumber}>{index + 1}</span>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepText}>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------- features ---------- */}
        <section className={styles.section} data-reveal>
          <header className={styles.sectionHead}>
            <p className={styles.sectionKicker}>Inside the app</p>
            <h2 className={styles.sectionTitle}>Everything in one place</h2>
          </header>
          <ul className={styles.featureGrid}>
            {FEATURES.map((feature) => (
              <li key={feature.title} className={styles.feature} data-reveal>
                <span className={styles.featureIcon} aria-hidden="true">
                  {feature.icon}
                </span>
                <h3 className={styles.featureTitle}>{feature.title}</h3>
                <p className={styles.featureText}>{feature.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- referrals ---------- */}
        <section className={styles.section} data-reveal id="referrals">
          <div className={styles.referral}>
            <div className={styles.referralTop}>
              <div>
                <p className={styles.sectionKicker}>Refer &amp; Earn</p>
                <div className={styles.bigReward}>
                  <span className={styles.bigAmount}>₱250</span>
                  <span className={styles.bigLabel}>for every person you refer</span>
                </div>
                <p className={styles.sectionLead}>
                  Share your code with friends and neighbors. When they become PKC BIZOFT customers,
                  you get rewarded.
                </p>
                <ol className={styles.referralSteps}>
                  {REFERRAL_STEPS.map((step, index) => (
                    <li key={step} className={styles.referralStep}>
                      <b>{index + 1}</b>
                      <span>
                        <Rich text={step} />
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className={styles.terms}>
                {REFERRAL_TERMS.map((term) => (
                  <div key={term.title} className={styles.term}>
                    <span className={styles.termValue}>{term.value}</span>
                    <span className={styles.termTitle}>{term.title}</span>
                    <p className={styles.termText}>{term.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <p className={styles.fineprint}>
              Rewards are confirmed by PKC BIZOFT accounting. Your referral code and balance are
              inside the app under Refer &amp; Earn.
            </p>
          </div>
        </section>

        {/* ---------- closing ---------- */}
        <section className={`${styles.section} ${styles.closing}`} data-reveal>
          <h2 className={styles.closingTitle}>Ready when you are.</h2>
          <p className={styles.closingLead}>
            Download the app, sign in, and start earning from your referrals.
          </p>
          <div className={styles.closingActions}>
            <a href={APK_URL} download className={shared.primary}>
              Download APK
            </a>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
