"use client";

import Image from "next/image";
import { useEffect, useState, type ReactElement } from "react";
import styles from "./phone-demo.module.css";

// A sample customer view based on the real Expo app. Billing opens from the
// Home shortcut, while the bottom navigation mirrors the four customer tabs.
// The 11:47 PM story plays first, then the tour shows each screen once and stops.
type TabId = "home" | "requests" | "referrals" | "profile";
type View = TabId | "billing";

const TOUR: View[] = ["home", "billing", "requests", "referrals", "profile"];
const AUTO_TOUR_MS = 4200;
type IconName = "home" | "requests" | "referrals" | "profile" | "bell" | "billing" | "speed" | "check";

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "requests", label: "Requests", icon: "requests" },
  { id: "referrals", label: "Referrals", icon: "referrals" },
  { id: "profile", label: "Profile", icon: "profile" },
];

const METHODS = ["GCash", "Bank Transfer", "Cash"] as const;

function AppIcon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactElement> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    requests: <><path d="M14.5 6.5 17.5 9.5M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" /><path d="M12 5h-7v14h7" /></>,
    referrals: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5.5a3 3 0 0 1 0 5.8M18 14a5 5 0 0 1 3 4.5V20" /></>,
    profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    billing: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h4" /></>,
    speed: <><path d="M4 18a9 9 0 1 1 16 0" /><path d="m12 13 4-4M5 18h14" /><circle cx="12" cy="13" r="1" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
  };

  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function ScreenHeading({ eyebrow, title }: { eyebrow: string; title: string }): ReactElement {
  return (
    <div className={styles.screenHeading}>
      <small>{eyebrow}</small>
      <strong>{title}</strong>
    </div>
  );
}

function HomeScreen({ onOpenBilling, onOpenRequests, onPlay }: { onOpenBilling: () => void; onOpenRequests: () => void; onPlay: () => void }) {
  return (
    <>
      <div className={styles.homeHeader}>
        <Image src="/pkc-logo.webp" alt="" width={34} height={34} />
        <div className={styles.homeBrand}>
          <small>PKC BIZOFT</small>
          <strong>Customer Portal</strong>
        </div>
        <button className={styles.bell} type="button" aria-label="Notifications"><AppIcon name="bell" size={17} /><i /></button>
      </div>

      <button type="button" className={styles.storyButton} onClick={onPlay} aria-label="Play the 30 second story">
        <span className={styles.storyPlay} aria-hidden="true">▶</span>
        <span className={styles.storyText}>
          <em>WATCH THE STORY</em>
          <strong>Movie night. Then it freezes…</strong>
          <small>30 seconds · tap to play</small>
        </span>
      </button>

      <div className={styles.welcomeCard}>
        <div className={styles.welcomeTop}>
          <div>
            <span className={styles.label}>WELCOME BACK</span>
            <strong className={styles.welcomeName}>Sample Customer</strong>
            <small className={styles.muted}>sample@email.com</small>
          </div>
          <span className={styles.pillGood}><i /> Active</span>
        </div>
        <div className={styles.divider} />
        <div className={styles.planRow}>
          <span className={styles.label}>PLAN</span>
          <strong>Home Fiber 100 Mbps</strong>
        </div>
      </div>

      <div className={styles.quickActions}>
        <button type="button" className={styles.quickTile} onClick={onOpenBilling}>
          <span className={styles.quickIcon}><AppIcon name="billing" size={19} /></span><strong>Plan &amp; Bills</strong>
        </button>
        <button type="button" className={styles.quickTile} onClick={onOpenRequests}>
          <span className={styles.quickIcon}><AppIcon name="requests" size={19} /></span><strong>Report issue</strong>
        </button>
        <button type="button" className={styles.quickTile}>
          <span className={styles.quickIcon}><AppIcon name="speed" size={19} /></span><strong>Speed test</strong>
        </button>
      </div>

      <div className={styles.sectionTitle}>MY ACCOUNT AT A GLANCE</div>
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.label}>NEXT BILL</span>
          <strong>₱ 1,000.00</strong>
          <small className={styles.muted}>Due Nov 01, 2026</small>
        </div>
        <div className={styles.statCard}>
          <span className={styles.label}>CONNECTION</span>
          <strong className={styles.statGood}>Online</strong>
          <small className={styles.muted}>Service is active</small>
        </div>
      </div>
      <div className={styles.sectionTitle}>LATEST ACTIVITY</div>
      <div className={styles.activityRow}>
        <span className={styles.activityIcon}><AppIcon name="check" size={17} /></span>
        <div><strong>Repair visit</strong><small className={styles.muted}>Completed · Oct 12</small></div>
        <span className={styles.pillGood}>Done</span>
      </div>
    </>
  );
}

function RequestsScreen() {
  return (
    <>
      <ScreenHeading eyebrow="CUSTOMER PORTAL" title="Requests & Support" />
      <p className={styles.screenIntro}>Follow your service requests and get help with your connection.</p>
      <div className={styles.requestCard}>
        <div className={styles.requestIcon}><AppIcon name="requests" size={17} /></div>
        <div className={styles.requestDetails}><strong>Repair / Issue</strong><small className={styles.muted}>Slow connection</small></div>
        <span className={styles.pillWarn}>Processing</span>
      </div>
      <div className={styles.requestCard}>
        <div className={styles.requestIcon}><AppIcon name="billing" size={17} /></div>
        <div className={styles.requestDetails}><strong>Plan change</strong><small className={styles.muted}>Submitted Oct 10</small></div>
        <span className={styles.pillInfo}>Under review</span>
      </div>
      <button className={styles.primaryButton} type="button">＋ New request</button>
      <div className={styles.helperCard}>
        <span className={styles.label}>NEED A HAND?</span>
        <strong>We’re here to help</strong>
        <small className={styles.muted}>Send a report and track updates here.</small>
      </div>
    </>
  );
}

function BillingScreen({ onBack }: { onBack: () => void }) {
  const [method, setMethod] = useState<(typeof METHODS)[number]>("GCash");
  const [note, setNote] = useState("");

  return (
    <>
      <button type="button" className={styles.backButton} onClick={onBack}>‹ <span>Back to Home</span></button>
      <ScreenHeading eyebrow="CUSTOMER PORTAL" title="Plan & Bills" />
      <div className={styles.balanceCard}>
        <span className={styles.label}>BALANCE TO PAY</span>
        <strong className={styles.amount}>₱ 1,000.00</strong>
        <small className={styles.muted}>Due Nov 01, 2026</small>
        <button type="button" className={styles.primaryButton} onClick={() => setNote("Sample payment flow · choose a method below.")}>Pay bill</button>
      </div>
      <div className={styles.label}>PAYMENT METHOD</div>
      <div className={styles.chips} role="radiogroup" aria-label="Payment method">
        {METHODS.map((item) => (
          <button key={item} type="button" role="radio" aria-checked={method === item}
            className={method === item ? styles.chipOn : styles.chipOff}
            onClick={() => { setMethod(item); setNote(""); }}>{item}</button>
        ))}
      </div>
      <button className={styles.ghostButton} type="button">⇧ Upload receipt</button>
      <p className={styles.note} aria-live="polite">{note || "Payments are checked by accounting before they are posted."}</p>
    </>
  );
}

function ReferralsScreen() {
  const [shared, setShared] = useState(false);
  return (
    <>
      <ScreenHeading eyebrow="CUSTOMER PORTAL" title="Refer & Earn" />
      <p className={styles.screenIntro}>Invite friends and earn rewards when they become customers.</p>
      <div className={styles.codeCard}>
        <span className={styles.label}>YOUR REFERRAL CODE</span>
        <strong className={styles.code}>SAMPLE-CODE</strong>
        <button className={styles.primaryButton} type="button" onClick={() => setShared(true)}>{shared ? "✓ Ready to share" : "Share my code"}</button>
      </div>
      <div className={styles.statsGrid}>
        <div className={styles.statCard}><span className={styles.label}>REFERRALS</span><strong>3 people</strong><small className={styles.muted}>1 reward confirmed</small></div>
        <div className={styles.statCard}><span className={styles.label}>REWARD BALANCE</span><strong className={styles.statGood}>₱ 250.00</strong><small className={styles.muted}>₱5 transfer fee</small></div>
      </div>
      <div className={styles.sectionTitle}>HOW IT WORKS</div>
      <div className={styles.helperCard}><strong>Share your code</strong><small className={styles.muted}>Your friend enters it when signing up. Your reward is added after installation and payment confirmation.</small></div>
    </>
  );
}

function ProfileScreen() {
  return (
    <>
      <ScreenHeading eyebrow="CUSTOMER PORTAL" title="My Profile" />
      <div className={styles.profileCard}>
        <span className={styles.avatar}>S</span>
        <div><strong>Sample Customer</strong><small className={styles.muted}>sample@email.com</small></div>
      </div>
      <div className={styles.sectionTitle}>ACCOUNT DETAILS</div>
      <div className={styles.infoRow}><span>Phone number</span><strong>On file</strong></div>
      <div className={styles.infoRow}><span>Service address</span><strong>Sample address</strong></div>
      <div className={styles.infoRow}><span>Account status</span><strong className={styles.statGood}>Active</strong></div>
      <div className={styles.sectionTitle}>APP SETTINGS</div>
      <div className={styles.infoRow}><span>Notifications</span><strong>On <b>›</b></strong></div>
      <div className={styles.infoRow}><span>Help center</span><strong>Open <b>›</b></strong></div>
      <button className={styles.ghostButton} type="button">Sign out</button>
    </>
  );
}

const SCREENS: Record<Exclude<TabId, "home">, () => ReactElement> = {
  requests: RequestsScreen,
  referrals: ReferralsScreen,
  profile: ProfileScreen,
};

export function PhoneDemo() {
  const [view, setView] = useState<View>("home");
  const [playing, setPlaying] = useState(true);
  const [touring, setTouring] = useState(false);
  const [paused, setPaused] = useState(false);
  const active: TabId = view === "billing" ? "home" : view;
  const billingOpen = view === "billing";
  const Screen = view === "home" || view === "billing" ? null : SCREENS[view];

  // One pass through the screens after the story; it stops on the last one
  // instead of starting over, and any tap hands control to the visitor.
  useEffect(() => {
    if (!touring || paused || playing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const next = TOUR.indexOf(view) + 1;
    if (next <= 0 || next >= TOUR.length) return;
    const timer = window.setTimeout(() => setView(TOUR[next]), AUTO_TOUR_MS);
    return () => window.clearTimeout(timer);
  }, [view, touring, paused, playing]);

  function go(next: View) {
    setTouring(false);
    setView(next);
  }

  function endStory() {
    setPlaying(false);
    setView("home");
    setTouring(true);
  }

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
          <div className={styles.statusBar}><span>9:41</span><span>● ▮ ▰</span></div>
          <div key={view} className={styles.content} role="tabpanel" id={`demo-panel-${active}`} aria-labelledby={`demo-tab-${active}`}>
            {billingOpen ? (
              <BillingScreen onBack={() => go("home")} />
            ) : (
              Screen ? <Screen /> : (
                <HomeScreen
                  onOpenBilling={() => go("billing")}
                  onOpenRequests={() => go("requests")}
                  onPlay={() => {
                    setTouring(false);
                    setPlaying(true);
                  }}
                />
              )
            )}
          </div>
          {playing ? (
            <div className={styles.storyLayer}>
              <video
                className={styles.storyVideo}
                src="/media/pkc-buffering-vertical.mp4"
                poster="/media/pkc-buffering-vertical.jpg"
                autoPlay
                muted
                playsInline
                controls
                onEnded={endStory}
                onError={endStory}
              />
              <button type="button" className={styles.storyClose} onClick={endStory} aria-label="Close the story">
                ✕
              </button>
            </div>
          ) : null}
          <div className={styles.tabBar} role="tablist" aria-label="App sections">
            {TABS.map((tab) => (
              <button key={tab.id} id={`demo-tab-${tab.id}`} type="button" role="tab"
                aria-selected={!billingOpen && active === tab.id} aria-controls={`demo-panel-${active}`}
                className={!billingOpen && active === tab.id ? styles.tabOn : styles.tab}
                onClick={() => go(tab.id)}>
                <span><AppIcon name={tab.icon} size={17} /></span>{tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className={styles.caption}>Tap the glowing ▶ on Home to replay the 30 second story, or tap around. Sample screens, not real data.</p>
    </div>
  );
}
