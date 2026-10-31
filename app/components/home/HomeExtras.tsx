"use client";

/* Home page sections added on 2026-10-31. Plain <a> on purpose, same as the rest of the public pages. */

import { useEffect, useRef, useState } from "react";
import type { HomeStats } from "@/app/api/public/home-stats/route";
import { fill, SERVICE_AREAS, type HomeText } from "./homeText";
import styles from "./home-extras.module.css";

type Plan = { price: number; mbps: number };

// Rough guide: people decide the base speed, heavy use bumps it up a step.
function recommend(plans: Plan[], people: number, uses: Set<string>) {
  let step = people <= 2 ? 0 : people <= 4 ? 1 : people <= 6 ? 2 : 3;
  if (uses.has("game") || uses.has("work")) step += 1;
  if (uses.has("stream") && people >= 3) step += 1;
  return plans[Math.min(plans.length - 1, step)];
}

export function PlanPicker({ t, plans, signupUrl }: { t: HomeText; plans: Plan[]; signupUrl: string }) {
  const [people, setPeople] = useState(3);
  const [uses, setUses] = useState<Set<string>>(() => new Set(["browse"]));
  const pick = recommend(plans, people, uses);
  const toggle = (id: string) =>
    setUses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const options: [string, string][] = [
    ["browse", t.useBrowse],
    ["stream", t.useStream],
    ["game", t.useGame],
    ["work", t.useWork],
  ];

  return (
    <div className={styles.picker}>
      <strong className={styles.pickerTitle}>{t.pickerTitle}</strong>
      <label className={styles.pickerLabel}>
        <span>
          {t.pickerPeople} <b>{people >= 8 ? "8+" : people}</b>
        </span>
        <input type="range" min={1} max={8} value={people} onChange={(e) => setPeople(Number(e.target.value))} />
      </label>
      <span className={styles.pickerLabel}>{t.pickerUses}</span>
      <div className={styles.chips}>
        {options.map(([id, label]) => (
          <button key={id} type="button" className={uses.has(id) ? styles.chipOn : styles.chip} onClick={() => toggle(id)} aria-pressed={uses.has(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className={styles.pickResult} aria-live="polite">
        <span>{t.pickerResult}</span>
        <strong>
          {pick.mbps} Mbps <small>₱{pick.price.toLocaleString()} {t.perMonth}</small>
        </strong>
        <a href={signupUrl}>{t.applyShort} →</a>
      </div>
    </div>
  );
}

export function CoverageCheck({ t, phone, facebook }: { t: HomeText; phone: string; facebook: string }) {
  const [area, setArea] = useState("");
  const [checked, setChecked] = useState("");
  const match = checked
    ? SERVICE_AREAS.find((a) => a.toLowerCase().includes(checked.toLowerCase()) || checked.toLowerCase().includes(a.toLowerCase()))
    : undefined;
  const sms = `sms:${phone}?body=${encodeURIComponent(fill(t.coverSms, { area: checked }))}`;

  return (
    <form
      className={styles.cover}
      onSubmit={(e) => {
        e.preventDefault();
        setChecked(area.trim());
      }}
    >
      <strong className={styles.pickerTitle}>{t.coverTitle}</strong>
      <div className={styles.coverRow}>
        <input value={area} onChange={(e) => setArea(e.target.value)} placeholder={t.coverPlaceholder} aria-label={t.coverPlaceholder} maxLength={60} />
        <button type="submit">{t.coverCheck}</button>
      </div>
      {checked ? (
        match ? (
          <p className={styles.coverYes}>{fill(t.coverYes, { area: match })}</p>
        ) : (
          <div className={styles.coverAsk}>
            <p>{t.coverUnknown}</p>
            <div>
              <a href={sms}>{t.coverText}</a>
              <a href={facebook} target="_blank" rel="noopener noreferrer">
                {t.facebook} ↗
              </a>
            </div>
          </div>
        )
      ) : null}
    </form>
  );
}

// A speedometer that sweeps up to 200 Mbps the first time it scrolls into view.
export function SpeedTeaser({ t, appUrl }: { t: HomeText; appUrl: string }) {
  const ref = useRef<HTMLElement | null>(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / 1800);
          setValue(Math.round(200 * (1 - Math.pow(1 - p, 3))));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  // Gauge arc: 240 degrees, value 0-200.
  const r = 88;
  const length = (240 / 360) * 2 * Math.PI * r;
  const shown = (value / 200) * length;
  const angle = -120 + (value / 200) * 240;

  return (
    <section className={styles.speed} ref={ref}>
      <div className={styles.gauge} aria-hidden="true">
        <svg viewBox="0 0 220 200">
          <path d="M 33.8 154 A 88 88 0 1 1 186.2 154" className={styles.gaugeTrack} />
          <path d="M 33.8 154 A 88 88 0 1 1 186.2 154" className={styles.gaugeFill} style={{ strokeDasharray: `${shown} ${length}` }} />
          <line x1="110" y1="110" x2="110" y2="42" className={styles.needle} style={{ transform: `rotate(${angle}deg)` }} />
          <circle cx="110" cy="110" r="6" className={styles.hub} />
        </svg>
        <div className={styles.gaugeValue}>
          <strong>{value}</strong>
          <span>Mbps</span>
        </div>
      </div>
      <div className={styles.speedCopy}>
        <span className={styles.kicker}>{t.speedKicker}</span>
        <h2>{t.speedTitle}</h2>
        <p>{t.speedText}</p>
        <a href={appUrl} className={styles.ghostButton}>
          {t.speedLink} ↓
        </a>
      </div>
    </section>
  );
}

// Real numbers and reviews from the database. Each part stays hidden until there is enough real data,
// so the page never shows a thin "2 homes connected".
const MIN_HOMES = 10;
const MIN_RATINGS = 5;
const MIN_REVIEWS = 3;

export function ProofSection({ t }: { t: HomeText }) {
  const [stats, setStats] = useState<HomeStats | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/public/home-stats")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: HomeStats | null) => {
        if (alive && data) setStats(data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!stats) return null;
  const showNumbers = stats.homes >= MIN_HOMES && stats.ratingCount >= MIN_RATINGS && stats.avgStars !== null;
  const showReviews = stats.reviews.length >= MIN_REVIEWS;
  if (!showNumbers && !showReviews) return null;

  return (
    <section className={styles.proof}>
      <span className={styles.kicker}>{t.proofKicker}</span>
      {showNumbers ? (
        <div className={styles.numbers}>
          <div>
            <strong>{stats.homes}</strong>
            <span>{t.proofHomes}</span>
          </div>
          <div>
            <strong>{stats.avgStars?.toFixed(1)}★</strong>
            <span>
              {t.proofRating} · {stats.ratingCount} {t.proofRatings}
            </span>
          </div>
        </div>
      ) : null}
      {showReviews ? (
        <>
          <h2>{t.proofTitle}</h2>
          <div className={styles.reviews}>
            {stats.reviews.map((review, i) => (
              <figure key={i}>
                <span className={styles.stars}>{"★".repeat(review.stars)}</span>
                <blockquote>{review.comment}</blockquote>
                <figcaption>{t.proofVerified}</figcaption>
              </figure>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

export function HomeFaq({ t }: { t: HomeText }) {
  return (
    <section className={styles.faq} id="faq">
      <span className={styles.kicker}>{t.faqKicker}</span>
      <h2>{t.faqTitle}</h2>
      <div className={styles.faqList}>
        {t.faq.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

// Phones only: an Apply bar that slides up once the hero buttons have scrolled away.
export function MobileApplyBar({ t, href }: { t: HomeText; href: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 0.9);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className={show ? `${styles.bar} ${styles.barOn}` : styles.bar} aria-hidden={!show}>
      <span>{t.barFrom}</span>
      <a href={href} tabIndex={show ? 0 : -1}>
        {t.apply} →
      </a>
    </div>
  );
}
