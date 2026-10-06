"use client";

import { useEffect, useState } from "react";
import styles from "./pkc-loader.module.css";

const DEFAULT_STEPS = [
  "Securing your session",
  "Linking your workspace",
  "Syncing the latest data",
];

// Branded loading screen: the logo inside orbiting rings, a scanning progress
// bar and a status line that steps through what is happening. Used for route
// changes and for the moments where a page is still checking who you are.
//
// `fill` makes it cover the whole viewport (route loading); without it, it
// sits inside whatever container you give it (for example a table area).
export function PkcLoader({
  label = "Loading",
  steps = DEFAULT_STEPS,
  fill = true,
}: {
  label?: string;
  steps?: string[];
  fill?: boolean;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (steps.length < 2) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % steps.length), 1400);
    return () => window.clearInterval(timer);
  }, [steps]);

  return (
    <div className={`${styles.wrap} ${fill ? styles.fill : ""}`} role="status" aria-live="polite" aria-label={label}>
      <div className={styles.glow} aria-hidden="true" />

      <div className={styles.mark} aria-hidden="true">
        <span className={styles.ring} />
        <span className={`${styles.ring} ${styles.ringTwo}`} />
        <span className={styles.orbit}>
          <i />
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pkc-logo.webp" alt="" width={56} height={56} />
      </div>

      <div className={styles.brand}>
        PKC <strong>BIZOFT</strong>
      </div>

      <div className={styles.bar} aria-hidden="true">
        <i />
      </div>

      <p className={styles.status} key={index}>
        {steps[index] ?? label}
        <span aria-hidden="true">…</span>
      </p>
    </div>
  );
}
