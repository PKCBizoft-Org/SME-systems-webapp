"use client";

/* Home page sections: plan picker, coverage check, live proof and FAQ. Plain <a> on purpose, same as the rest of the public pages. */

import { useEffect, useState } from "react";
import type { HomeStats } from "@/app/api/public/home-stats/route";
import { fill, PARTIAL_TOWNS, SERVICE_AREAS, type HomeText } from "./homeText";
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

// "golden valley" -> "Golden Valley"
const titleCase = (text: string) => text.replace(/\b\w/g, (c) => c.toUpperCase());

// What someone typed -> the covered place it names ("Pindasan, Mabini, Davao de Oro"), "partial" for a town
// we only partly cover, or null when we cannot tell (then they are asked to text).
function findCoverage(typed: string): string | "partial" | null {
  const text = ` ${typed.toLowerCase().replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim()} `;
  if (text.trim().length < 3) return null;
  for (const area of SERVICE_AREAS) {
    const name = area.names.find((n) => text.includes(` ${n} `));
    if (!name) continue;
    const town = area.place.split(",")[0].toLowerCase();
    return name === town ? area.place : `${titleCase(name)}, ${area.place}`;
  }
  return PARTIAL_TOWNS.some((town) => text.includes(` ${town} `)) ? "partial" : null;
}

export function CoverageCheck({ t, phone, facebook }: { t: HomeText; phone: string; facebook: string }) {
  const [area, setArea] = useState("");
  const [checked, setChecked] = useState("");
  const match = checked ? findCoverage(checked) : null;
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
      <p className={styles.coverNow}>{t.coverNow}</p>
      <div className={styles.coverRow}>
        <input value={area} onChange={(e) => setArea(e.target.value)} placeholder={t.coverPlaceholder} aria-label={t.coverPlaceholder} maxLength={60} />
        <button type="submit">{t.coverCheck}</button>
      </div>
      {checked ? (
        match && match !== "partial" ? (
          <p className={styles.coverYes}>{fill(t.coverYes, { area: match })}</p>
        ) : (
          <div className={styles.coverAsk}>
            <p>{match === "partial" ? t.coverPartial : t.coverUnknown}</p>
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
