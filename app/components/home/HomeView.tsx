"use client";

/* The public home page. Plain <a> on purpose, same as the other public pages. */
/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */

import { useEffect, useState } from "react";
import { INSTALL_FEE, SPEED_BY_PRICE } from "@/lib/plans";
import { CoverageCheck, HomeFaq, PlanPicker, ProofSection } from "./HomeExtras";
import { fill, HOME_TEXT, LANG_KEY, LANGS, type Lang } from "./homeText";
import styles from "./home.module.css";

const APP_DOWNLOAD_URL = "/download";
const SIGNUP_URL = "/login/SignUp";
const CONTACT_PHONE = "09537404840";
const CONTACT_PHONE_LABEL = "0953 740 4840";
const FACEBOOK_URL = "https://www.facebook.com/PKCGrpofCmpny";
// Same price list the app uses, so the home page never shows a different price.
const PLANS = Object.entries(SPEED_BY_PRICE).map(([price, mbps]) => ({ price: Number(price), mbps }));

// The FAQ in the format Google and Bing read (always the English answers).
const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: HOME_TEXT.en.faq.map(([q, a]) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

export default function HomeView() {
  const [lang, setLang] = useState<Lang>("en");
  const [menuOpen, setMenuOpen] = useState(false);
  const t = HOME_TEXT[lang];

  // The language picked last time (EN / TL / BIS).
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LANG_KEY);
    } catch {
      // Private mode: English.
    }
    if (saved === "tl" || saved === "bis") {
      const restore = window.setTimeout(() => setLang(saved as Lang), 0);
      return () => window.clearTimeout(restore);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "en" ? "en" : lang === "tl" ? "fil" : "ceb";
  }, [lang]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const chooseLang = (next: Lang) => {
    setLang(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // Private mode: it lasts for this visit.
    }
  };

  const close = () => setMenuOpen(false);
  const langSwitch = (
    <div className={styles.langs} role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button key={l.id} type="button" className={lang === l.id ? styles.langOn : undefined} onClick={() => chooseLang(l.id)} aria-pressed={lang === l.id}>
          {l.label}
        </button>
      ))}
    </div>
  );

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <div className={`${styles.wrap} ${styles.nav}`}>
          <a className={styles.brand} href="#top" aria-label="PKC BIZOFT">
            <img src="/pkc-logo.webp" alt="" width={32} height={32} />
            <span>PKC BIZOFT</span>
          </a>
          <nav className={styles.links} aria-label="Primary">
            <a href="#systems">{t.navSystems}</a>
            <a href="#network">{t.navNetwork}</a>
            <a href="/who-we-are">{t.navWho}</a>
            <a href="#contact">{t.navContact}</a>
          </nav>
          <div className={styles.actions}>
            {langSwitch}
            <a className={styles.textLink} href={APP_DOWNLOAD_URL}>
              {t.getApp}
            </a>
            <a className={styles.textLink} href="/login">
              {t.logIn}
            </a>
            <a className={styles.btn} href="#contact">
              {t.talk}
            </a>
          </div>
          <button
            type="button"
            className={styles.burger}
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={t.menuLabel}
          >
            <span />
            <span />
          </button>
        </div>
        {menuOpen ? (
          <div className={styles.menu} id="mobile-menu">
            <div className={styles.wrap}>
              <a href="#systems" onClick={close}>{t.navSystems}</a>
              <a href="#network" onClick={close}>{t.navNetwork}</a>
              <a href="/who-we-are">{t.navWho}</a>
              <a href="#contact" onClick={close}>{t.navContact}</a>
              <a href={SIGNUP_URL}>{t.menuApply}</a>
              <a href={APP_DOWNLOAD_URL}>{t.getApp}</a>
              <a href="/login">{t.logIn}</a>
              <div className={styles.menuLang}>{langSwitch}</div>
              <a className={styles.btn} href="#contact" onClick={close}>{t.talk}</a>
            </div>
          </div>
        ) : null}
      </header>

      <section className={styles.hero} id="top">
        <div className={styles.wrap}>
          <h1>{t.heroTitle}</h1>
          <p className={styles.lead}>{t.heroText}</p>
          <div className={styles.heroActions}>
            <a className={styles.btn} href="#contact">{t.talk}</a>
            <a className={styles.link} href="#systems">{t.seeSystems}</a>
          </div>
          <p className={styles.heroNote}>
            <i aria-hidden="true" />
            <span>{t.heroNote}</span>{" "}
            <a className={styles.link} href="#network">{t.heroNoteLink}</a>
          </p>
        </div>
      </section>

      <section className={styles.section} id="systems">
        <div className={styles.wrap}>
          <h2>{t.systemsTitle}</h2>
          <ul className={styles.ledger}>
            {t.systems.map(([name, text]) => (
              <li key={name}>
                <h3>{name}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.wrap}>
          <h2>{t.whoTitle}</h2>
          <div className={styles.trio}>
            {t.who.map(([name, text]) => (
              <div key={name}>
                <h3>{name}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section} id="network">
        <div className={styles.wrap}>
          <div className={styles.netIntro}>
            <h2>{t.netTitle}</h2>
            <p className={styles.lead}>{t.netText}</p>
          </div>

          <div className={styles.plans} id="plans">
            <div className={styles.plansHead}>
              <h3>{t.plansTitle}</h3>
              <p>{fill(t.plansText, { fee: INSTALL_FEE.toLocaleString() })}</p>
            </div>
            <ul>
              {PLANS.map((plan) => (
                <li key={plan.price}>
                  <strong>{plan.mbps} Mbps</strong>
                  <span>
                    ₱{plan.price.toLocaleString()} {t.perMonth}
                  </span>
                  <a className={styles.link} href={SIGNUP_URL}>{t.applyShort}</a>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.tools}>
            <PlanPicker t={t} plans={PLANS} signupUrl={SIGNUP_URL} />
            <CoverageCheck t={t} phone={CONTACT_PHONE} facebook={FACEBOOK_URL} />
          </div>

          <div className={styles.existing}>
            <span>{t.existing}</span>
            <a className={styles.btn} href="/login">{t.payLogin}</a>
            <a className={styles.link} href={APP_DOWNLOAD_URL}>{t.appLink}</a>
            <a className={styles.link} href={SIGNUP_URL}>{t.apply}</a>
          </div>

          <ProofSection t={t} />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.wrap}>
          <HomeFaq t={t} />
        </div>
      </section>

      <section className={`${styles.section} ${styles.contact}`} id="contact">
        <div className={styles.wrap}>
          <h2>{t.contactTitle}</h2>
          <p className={styles.lead}>{t.contactText}</p>
          <div className={styles.heroActions}>
            <a className={styles.btn} href={`tel:${CONTACT_PHONE}`}>{t.call} {CONTACT_PHONE_LABEL}</a>
            <a className={styles.link} href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer">{t.facebook} ↗</a>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={`${styles.wrap} ${styles.footInner}`}>
          <div>
            <strong>PKC BIZOFT</strong>
            <span>{t.footerTag}</span>
          </div>
          <nav aria-label="Footer">
            <a href="/who-we-are">{t.navWho}</a>
            <a href="/download">{t.getApp}</a>
            <a href="/login">{t.logIn}</a>
            <a href="/terms">Terms</a>
            <a href="/privacy">Privacy</a>
            <a href="/cookies">Cookies</a>
            <a href="/guide">Guide</a>
          </nav>
          <span className={styles.copy}>© 2026 PKC BIZOFT (Bizoft PH)</span>
        </div>
      </footer>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }} />
    </main>
  );
}
