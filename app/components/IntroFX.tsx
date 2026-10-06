"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./intro-fx.module.css";

// Extra life for the full-screen intros (home and who-we-are). Each piece is
// independent, so an intro can use whichever it wants. They all sit inside the
// intro's own markup; none of them change the intro's timing.
//
// Reduced-motion users get the static text and none of the moving pieces.

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Radar sweep and expanding pings behind the logo. Place it inside the logo wrapper. */
export function IntroSonar() {
  return (
    <span className={styles.sonar} aria-hidden="true">
      <i className={styles.sweep} />
      <i className={styles.ping} />
      <i className={`${styles.ping} ${styles.pingTwo}`} />
      <i className={`${styles.ping} ${styles.pingThree}`} />
    </span>
  );
}

/** Small labelled satellites circling the logo. Place it inside the logo wrapper. */
export function IntroOrbit({ labels, inset = "-22%" }: { labels: string[]; inset?: string }) {
  return (
    <span className={styles.orbit} style={{ inset }} aria-hidden="true">
      {labels.slice(0, 4).map((label, index) => (
        <span key={label} className={styles.sat} style={{ ["--a" as string]: `${index * 90}deg` }}>
          <span className={styles.satBody}>
            <i />
            <b>{label}</b>
          </span>
        </span>
      ))}
    </span>
  );
}

/** Falling hex characters on a canvas, faded out toward the middle so text stays readable. */
export function IntroRain() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || prefersReducedMotion()) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const glyphs = "0123456789ABCDEF<>/";
    const size = coarse ? 16 : 18;
    let width = 0;
    let height = 0;
    let drops: number[] = [];
    let speeds: number[] = [];
    let raf = 0;
    let last = 0;

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width;
      canvas.height = height;
      const columns = Math.ceil(width / size);
      drops = Array.from({ length: columns }, () => Math.random() * -40);
      speeds = Array.from({ length: columns }, () => 0.35 + Math.random() * 0.75);
      ctx.font = `${size - 4}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    };

    const frame = (time: number) => {
      raf = requestAnimationFrame(frame);
      if (time - last < 45) return; // ~22fps: ambient, not a video
      last = time;

      // Erase a little of the previous frame so each stream leaves a fading trail.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";

      for (let i = 0; i < drops.length; i++) {
        if (drops[i] > 0) {
          const x = i * size;
          const y = drops[i] * size;
          ctx.fillStyle = "rgba(180, 250, 255, 0.85)";
          ctx.fillText(glyphs[Math.floor(Math.random() * glyphs.length)], x, y);
          ctx.fillStyle = "rgba(60, 200, 235, 0.4)";
          ctx.fillText(glyphs[Math.floor(Math.random() * glyphs.length)], x, y - size);
        }
        drops[i] += speeds[i];
        if (drops[i] * size > height && Math.random() > 0.975) {
          drops[i] = Math.random() * -12;
          speeds[i] = 0.35 + Math.random() * 0.75;
        }
      }
    };

    resize();
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className={styles.rain} aria-hidden="true" />;
}

const KEEP = /\s|[.,'-]/;

/** Text that decodes from random characters into the real words. */
export function Scramble({ text, delay = 0, duration = 900 }: { text: string; delay?: number; duration?: number }) {
  // Deterministic first render (identical on server and client, so hydration
  // matches). The real words appear as the scramble resolves.
  const [shown, setShown] = useState(() =>
    text
      .split("")
      .map((char) => (KEEP.test(char) ? char : "·"))
      .join(""),
  );

  useEffect(() => {
    if (prefersReducedMotion()) {
      const id = window.setTimeout(() => setShown(text), 0);
      return () => window.clearTimeout(id);
    }

    const glyphs = "01<>/\[]#$%&*+=";
    const letters = text.split("");
    let interval = 0;
    const start = window.setTimeout(() => {
      const began = performance.now();
      interval = window.setInterval(() => {
        const progress = Math.min(1, (performance.now() - began) / duration);
        setShown(
          letters
            .map((char, i) =>
              KEEP.test(char) || i / letters.length < progress
                ? char
                : glyphs[Math.floor(Math.random() * glyphs.length)],
            )
            .join(""),
        );
        if (progress >= 1) window.clearInterval(interval);
      }, 38);
    }, delay);

    return () => {
      window.clearTimeout(start);
      window.clearInterval(interval);
    };
  }, [text, delay, duration]);

  return (
    <>
      <span className={styles.srOnly}>{text}</span>
      <span aria-hidden="true">{shown}</span>
    </>
  );
}

/** A percentage that really counts up to 100 over the length of the intro. */
export function IntroCounter({ duration = 3900 }: { duration?: number }) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      const id = window.setTimeout(() => setValue(100), 0);
      return () => window.clearTimeout(id);
    }
    let raf = 0;
    const began = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / duration);
      setValue(Math.round(100 * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration]);

  return <>{value}%</>;
}

/** A terminal-style boot log. A line appears once the intro reaches its phase. */
export function IntroLog({ lines, phase }: { lines: { at: number; text: string }[]; phase: number }) {
  return (
    <div className={styles.log} aria-hidden="true">
      {lines
        .filter((line) => phase >= line.at)
        .map((line) => (
          <p key={line.text}>
            <b>[ OK ]</b> {line.text}
          </p>
        ))}
      <span className={styles.caret} />
    </div>
  );
}

/** A bright shockwave that fires when the intro starts to leave. */
export function IntroFlash({ active }: { active: boolean }) {
  return <span className={`${styles.flash} ${active ? styles.flashOn : ""}`} aria-hidden="true" />;
}
