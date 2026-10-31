"use client";

/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */

import { useCallback, useState } from "react";
import { ProfileDialog, type ProfileDetails } from "../components/ProfileDialog";
import { SiteNav } from "../components/SiteNav";
import styles from "./who-we-are.module.css";

const founder = {
  name: "Paul Kent Cairel",
  initials: "PK",
  role: "Founder",
  tag: "Founder and group creator",
  description:
    "The founder and group creator of PKC BIZOFT. Started the company and leads its direction, its team and the customers it serves.",
};

// Public profiles shown on each person's card (and the same ones search engines see in layout.tsx).
const coFounder = {
  name: "Prince AJ Y. Cuyos",
  initials: "AJ",
  role: "Co-founder",
  tag: "Co-founder",
  description:
    "Co-founder of PKC BIZOFT. Built the company's technology: this website, the customer app for Android, and the staff system behind billing, repairs and inventory.",
  links: [
    { label: "Portfolio", href: "https://prince-aj-cuyos.princeajycuyos28.workers.dev/" },
    { label: "Facebook", href: "https://www.facebook.com/Underrated.Prince.AJ" },
    { label: "Instagram", href: "https://www.instagram.com/prinx_cys" },
    { label: "GitHub", href: "https://github.com/PRiNXCYS" },
  ],
};
const pkcFacebook = { label: "PKC on Facebook", href: "https://www.facebook.com/PKCGrpofCmpny" };

// What the company does, in plain words (the same facts as the home page).
const whatWeDo = [
  {
    title: "Business systems",
    text: "Billing and online payments, accounting with approvals, inventory, field technician jobs and insights, for small and medium businesses.",
  },
  {
    title: "One app for customers",
    text: "Customers apply, pay bills with GCash, bank transfer or cash, report problems and chat with their technician from their phone.",
  },
  {
    title: "Built in-house",
    text: "We design, build and run the systems ourselves, from the website to the Android app.",
  },
];

function Monogram({ initials }: { initials: string }) {
  return (
    <div className={styles.monogram} aria-hidden="true">
      {initials}
    </div>
  );
}

export default function WhoWeArePage() {
  const [profileKey, setProfileKey] = useState<"founder" | "cofounder" | null>(null);
  const [cardFlipped, setCardFlipped] = useState(false);
  const closeProfile = useCallback(() => setProfileKey(null), []);

  // Only shows what this page already says about each person.
  let profile: ProfileDetails | null = null;
  if (profileKey === "founder") {
    profile = {
      tag: founder.tag,
      name: founder.name,
      role: founder.role,
      description: founder.description,
      details: [
        { label: "Role", value: "Founder" },
        { label: "Company", value: "PKC BIZOFT" },
        { label: "Website", value: "bizoftph.com" },
      ],
      links: [pkcFacebook],
    };
  } else if (profileKey === "cofounder") {
    profile = {
      tag: coFounder.tag,
      name: coFounder.name,
      role: coFounder.role,
      description: coFounder.description,
      details: [
        { label: "Role", value: "Co-founder" },
        { label: "Builds", value: "Web + app" },
        { label: "Profile", value: "Public" },
      ],
      links: coFounder.links,
    };
  }

  const people = [
    { key: "founder" as const, ...founder },
    { key: "cofounder" as const, ...coFounder },
  ];

  return (
    <main className={styles.page}>
      <SiteNav current="/who-we-are" />

      <section className={styles.hero}>
        <div className={styles.wrap}>
          <div className={styles.heroGrid}>
            <div>
              <p className={styles.muted}>About PKC BIZOFT</p>
              <h1>The people behind PKC BIZOFT.</h1>
              <p className={styles.lead}>
                PKC BIZOFT (bizoftph.com, also known as Bizoft PH) provides business systems solutions: billing, accounting, inventory and
                field-service systems for small and medium businesses. It was founded by Paul Kent Cairel with co-founder Prince AJ Y. Cuyos.
              </p>
              <dl className={styles.glance}>
                <div>
                  <dt>Founder</dt>
                  <dd>Paul Kent Cairel</dd>
                </div>
                <div>
                  <dt>Co-founder</dt>
                  <dd>Prince AJ Y. Cuyos</dd>
                </div>
                <div>
                  <dt>Website</dt>
                  <dd>bizoftph.com</dd>
                </div>
              </dl>
              <div className={styles.actions}>
                <a className={styles.btn} href="/#contact">
                  Talk to us
                </a>
                <a className={styles.link} href="#people">
                  Meet the founders
                </a>
              </div>
            </div>

            {/* A holographic company card: tilts toward the pointer, flips on click or tap. */}
            <div className={styles.cardWrap}>
              <button
                type="button"
                className={cardFlipped ? `${styles.card} ${styles.flipped}` : styles.card}
                aria-label={cardFlipped ? "Show the front of the PKC BIZOFT card" : "Flip the PKC BIZOFT card"}
                onClick={() => setCardFlipped((v) => !v)}
                onPointerMove={(event) => {
                  if (event.pointerType === "touch") return;
                  const box = event.currentTarget.getBoundingClientRect();
                  const x = (event.clientX - box.left) / box.width;
                  const y = (event.clientY - box.top) / box.height;
                  const card = event.currentTarget.style;
                  card.setProperty("--rx", `${(0.5 - y) * 16}deg`);
                  card.setProperty("--ry", `${(x - 0.5) * 20}deg`);
                  card.setProperty("--mx", `${x * 100}%`);
                  card.setProperty("--my", `${y * 100}%`);
                }}
                onPointerLeave={(event) => {
                  const card = event.currentTarget.style;
                  card.setProperty("--rx", "0deg");
                  card.setProperty("--ry", "0deg");
                }}
              >
                <span className={styles.inner}>
                  <span className={`${styles.face} ${styles.front}`}>
                    <span className={styles.cardTop}>
                      <img src="/pkc-logo.webp" alt="PKC BIZOFT logo" width={46} height={46} />
                      <span className={styles.cardBrand}>
                        PKC BIZOFT
                        <small>Business systems solutions</small>
                      </span>
                      <i className={styles.chip} />
                    </span>
                    <span className={styles.cardPeople}>
                      <span>
                        <small>Founder</small>
                        <strong>Paul Kent Cairel</strong>
                      </span>
                      <span>
                        <small>Co-founder</small>
                        <strong>Prince AJ Y. Cuyos</strong>
                      </span>
                    </span>
                    <span className={styles.cardBottom}>
                      <span>bizoftph.com</span>
                      <span>Tap to flip</span>
                    </span>
                    <span className={styles.shine} />
                  </span>
                  <span className={`${styles.face} ${styles.back}`}>
                    <span className={styles.stripe} />
                    <strong className={styles.backTitle}>Business systems</strong>
                    <span className={styles.backList}>
                      <span>Billing and online payments</span>
                      <span>Accounting and approvals</span>
                      <span>Inventory and stock audit</span>
                      <span>Field technician jobs</span>
                      <span>Customer mobile app</span>
                    </span>
                    <span className={styles.cardBottom}>
                      <span>bizoftph.com</span>
                      <span>Tap to flip</span>
                    </span>
                    <span className={styles.shine} />
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section} id="people">
        <div className={styles.wrap}>
          <h2>The founders.</h2>
          <ul className={styles.people}>
            {people.map((person) => (
              <li key={person.key}>
                <button type="button" onClick={() => setProfileKey(person.key)} aria-haspopup="dialog" aria-label={`Open the profile of ${person.name}`}>
                  <Monogram initials={person.initials} />
                  <span className={styles.personText}>
                    <strong>{person.name}</strong>
                    <small>{person.role}</small>
                    <span>{person.description}</span>
                  </span>
                  <span className={styles.more}>View profile</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.wrap}>
          <h2>What we do.</h2>
          <div className={styles.trio}>
            {whatWeDo.map((item) => (
              <div key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.cta}`}>
        <div className={styles.wrap}>
          <h2>Tell us what your business needs.</h2>
          <p className={styles.lead}>Call, text or message us and we will get back to you.</p>
          <div className={styles.actions}>
            <a className={styles.btn} href="/#contact">
              Talk to us
            </a>
            <a className={styles.link} href="/#systems">
              See the systems
            </a>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={`${styles.wrap} ${styles.footInner}`}>
          <div>
            <strong>PKC BIZOFT</strong>
            <span>Business systems solutions, Philippines</span>
          </div>
          <nav aria-label="Footer">
            <a href="/">Home</a>
            <a href="/#systems">Systems</a>
            <a href="/#contact">Contact</a>
            <a href="/login">Log in</a>
            <a href="/terms">Terms</a>
            <a href="/privacy">Privacy</a>
            <a href="/cookies">Cookies</a>
          </nav>
          <span className={styles.copy}>© 2026 PKC BIZOFT (Bizoft PH)</span>
        </div>
      </footer>

      <ProfileDialog profile={profile} avatar={<Monogram initials={profileKey === "cofounder" ? coFounder.initials : founder.initials} />} onClose={closeProfile} />
    </main>
  );
}
