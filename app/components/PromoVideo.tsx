"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import styles from "./promo-video.module.css";

// Two small files in /public/media: a vertical cut for phones and a wide cut for everything else.
// preload="none" means nothing downloads until someone taps play, which keeps weak phones and
// data plans happy. The poster is a still frame.
const SOURCES = {
  vertical: { src: "/media/pkc-promo-vertical.mp4", poster: "/media/pkc-promo-vertical.jpg" },
  landscape: { src: "/media/pkc-promo-landscape.mp4", poster: "/media/pkc-promo-landscape.jpg" },
};

const QUERY = "(max-width: 760px), (orientation: portrait)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function PromoVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);
  // The server and first paint use the wide cut; phones switch to the vertical one right after.
  const portrait = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
  const source = portrait ? SOURCES.vertical : SOURCES.landscape;

  function play() {
    const video = videoRef.current;
    if (!video) return;
    setStarted(true);
    // If the browser blocks play(), the native controls are already on, so the viewer can press play.
    video.play().catch(() => {});
  }

  return (
    <section className={styles.section} id="promo" aria-labelledby="promo-title">
      <div className={styles.head}>
        <span className={styles.kicker}>A short story</span>
        <h3 id="promo-title" className={styles.title}>
          11:47 PM. <em>Which would you tap?</em>
        </h3>
        <p className={styles.lead}>
          Thesis due at midnight. The Wi-Fi dies. Watch what Prinx does, in 25 seconds.
        </p>
      </div>

      <div className={`${styles.frame} ${portrait ? styles.portrait : styles.wide}`}>
        {failed ? (
          <div className={styles.fallback}>
            The video could not load.{" "}
            <a href={source.src} target="_blank" rel="noreferrer">
              Open it directly
            </a>
            .
          </div>
        ) : (
          <video
            key={source.src}
            ref={videoRef}
            className={styles.video}
            src={source.src}
            poster={source.poster}
            preload="none"
            playsInline
            controls={started}
            loop
            onError={() => setFailed(true)}
          />
        )}
        {!started && !failed ? (
          <button type="button" className={styles.playButton} onClick={play} aria-label="Play the 25 second story">
            <span className={styles.playIcon} aria-hidden="true" />
            <span className={styles.playLabel}>Play</span>
          </button>
        ) : null}
      </div>

      <p className={styles.note}>An illustrated, fictional story. Prinx and the group chat are made up.</p>
      <div className={styles.actions}>
        <a href="/download" className={styles.cta}>
          Get the app
        </a>
      </div>
    </section>
  );
}
