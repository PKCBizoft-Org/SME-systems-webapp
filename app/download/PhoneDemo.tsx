"use client";

import { useEffect, useState, type ReactElement } from "react";
import styles from "./phone-demo.module.css";

// An interactive illustration of the customer side of the mobile app. The tabs
// match the real app (Home, Requests, Payment, Referrals, Profile). All names,
// amounts and codes on these screens are SAMPLE data, not real information.

type TabId = "home" | "requests" | "payment" | "referrals" | "profile";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "⌂" },
  { id: "requests", label: "Requests", icon: "◈" },
  { id: "payment", label: "Payment", icon: "₱" },
  { id: "referrals", label: "Referrals", icon: "✦" },
  { id: "profile", label: "Profile", icon: "☺" },
];

const METHODS = ["GCash", "Bank Transfer", "Cash"] as const;
const AUTO_TOUR_MS = 4200;

function HomeScreen() {
  return (
    <>
      <div className={styles.greeting}>
        <small>WELCOME BACK</small>
        <strong>Sample Customer</strong>
      </div>
      <div className={styles.card}>
        <div className={styles.cardRow}>
          <span className={styles.label}>ACCOUNT</span>
          <span className={styles.pillGood}>ACTIVE</span>
        </div>
        <strong className={styles.big}>Sample Plan</strong>
        <small className={styles.muted}>Installation complete</small>
      </div>
      <div className={styles.grid2}>
        <div className={styles.mini}>
          <span className={styles.label}>NEXT BILL</span>
          <strong>₱ 1,000</strong>
        </div>
        <div className={styles.mini}>
          <span className={styles.label}>REFERRALS</span>
          <strong>₱ 250</strong>
        </div>
      </div>
      <div className={styles.listRow}>
        <i /> Latest repair visit <b>Completed</b>
      </div>
    </>
  );
}

function RequestsScreen() {
  const items = [
    { name: "Plan change", state: "Pending", tone: styles.pillWarn },
    { name: "Repair visit", state: "Completed", tone: styles.pillGood },
    { name: "Help request", state: "Processing", tone: styles.pillInfo },
  ];
  return (
    <>
      <div className={styles.heading}>Your requests</div>
      {items.map((item) => (
        <div key={item.name} className={styles.requestRow}>
          <div>
            <strong>{item.name}</strong>
            <small className={styles.muted}>Sample request</small>
          </div>
          <span className={item.tone}>{item.state}</span>
        </div>
      ))}
      <div className={styles.ghostButton}>＋ New request</div>
    </>
  );
}

function PaymentScreen() {
  const [method, setMethod] = useState<(typeof METHODS)[number]>("GCash");
  const [note, setNote] = useState("");

  return (
    <>
      <div className={styles.card}>
        <span className={styles.label}>BALANCE TO PAY</span>
        <strong className={styles.amount}>₱ 1,000.00</strong>
        <button
          type="button"
          className={styles.cta}
          onClick={() => setNote("This opens the GCash app so you can scan the QR and pay.")}
        >
          Pay with GCash
        </button>
      </div>
      <div className={styles.label}>PAYMENT METHOD</div>
      <div className={styles.chips} role="radiogroup" aria-label="Payment method">
        {METHODS.map((item) => (
          <button
            key={item}
            type="button"
            role="radio"
            aria-checked={method === item}
            className={method === item ? styles.chipOn : styles.chipOff}
            onClick={() => {
              setMethod(item);
              setNote("");
            }}
          >
            {item}
          </button>
        ))}
      </div>
      <div className={styles.ghostButton}>⇪ Upload receipt</div>
      <p className={styles.note} aria-live="polite">
        {note || "Payments are verified by accounting before they are posted."}
      </p>
    </>
  );
}

function ReferralsScreen() {
  const [shared, setShared] = useState(false);

  return (
    <>
      <div className={styles.heading}>Refer &amp; Earn</div>
      <div className={styles.card}>
        <span className={styles.label}>YOUR REFERRAL CODE</span>
        <strong className={styles.code}>SAMPLE-CODE</strong>
        <button type="button" className={styles.cta} onClick={() => setShared(true)}>
          {shared ? "✓ Ready to share" : "Share my code"}
        </button>
      </div>
      <div className={styles.grid2}>
        <div className={styles.mini}>
          <span className={styles.label}>PER PERSON</span>
          <strong>₱ 250</strong>
        </div>
        <div className={styles.mini}>
          <span className={styles.label}>WITHDRAW FEE</span>
          <strong>₱ 5</strong>
        </div>
      </div>
      <p className={styles.note}>The reward is added once your referral is installed and their payment is confirmed.</p>
    </>
  );
}

function ProfileScreen() {
  return (
    <>
      <div className={styles.profileHead}>
        <span className={styles.avatar}>S</span>
        <div>
          <strong>Sample Customer</strong>
          <small className={styles.muted}>sample@email.com</small>
        </div>
      </div>
      <div className={styles.listRow}>
        <i /> Service address <b>On file</b>
      </div>
      <div className={styles.listRow}>
        <i /> Contact number <b>On file</b>
      </div>
      <div className={styles.listRow}>
        <i /> Site photos <b>Saved</b>
      </div>
      <div className={styles.ghostButton}>Sign out</div>
    </>
  );
}

const SCREENS: Record<TabId, () => ReactElement> = {
  home: HomeScreen,
  requests: RequestsScreen,
  payment: PaymentScreen,
  referrals: ReferralsScreen,
  profile: ProfileScreen,
};

export function PhoneDemo() {
  const [active, setActive] = useState<TabId>("home");
  const [touring, setTouring] = useState(true);
  const [paused, setPaused] = useState(false);

  // Gentle auto-tour through the screens until the visitor takes over.
  useEffect(() => {
    if (!touring || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setTimeout(() => {
      setActive((current) => TABS[(TABS.findIndex((tab) => tab.id === current) + 1) % TABS.length].id);
    }, AUTO_TOUR_MS);
    return () => window.clearTimeout(timer);
  }, [active, touring, paused]);

  const Screen = SCREENS[active];

  return (
    <div
      className={styles.stage}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className={styles.glow} aria-hidden="true" />
      <span className={styles.orbit} aria-hidden="true" />

      <div className={styles.phone}>
        <div className={styles.screen}>
          <span className={styles.notch} aria-hidden="true" />
          <div className={styles.appBar}>
            <div>
              PKC <span>BIZOFT</span>
            </div>
            <i className={styles.dot} aria-hidden="true" />
          </div>

          <div
            key={active}
            className={styles.content}
            role="tabpanel"
            id={`demo-panel-${active}`}
            aria-labelledby={`demo-tab-${active}`}
          >
            <Screen />
          </div>

          <div className={styles.tabBar} role="tablist" aria-label="App sections">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                id={`demo-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={active === tab.id}
                aria-controls={`demo-panel-${tab.id}`}
                className={active === tab.id ? styles.tabOn : styles.tab}
                onClick={() => {
                  setActive(tab.id);
                  setTouring(false);
                }}
              >
                <span aria-hidden="true">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className={styles.caption}>
        Tap around. Sample screens, not real data.
      </p>
    </div>
  );
}
