"use client";

import { useState } from "react";
import styles from "./story-video.module.css";

// ---------------------------------------------------------------------------
// Paste the YouTube link of the PKC BIZOFT story video here, for example:
//   https://www.youtube.com/watch?v=XXXXXXXXXXX
//   https://youtu.be/XXXXXXXXXXX
// Leave it empty and the section shows a "coming soon" state instead.
// ---------------------------------------------------------------------------
const STORY_VIDEO_URL = "https://www.youtube.com/watch?v=mXvmSaE0JXA";

function getVideoId(url: string): string | null {
  const match = url
    .trim()
    .match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
  return match ? match[1] : null;
}

const VIDEO_ID = getVideoId(STORY_VIDEO_URL);

export function StoryVideo() {
  const [playing, setPlaying] = useState(false);
  // maxresdefault does not exist for every video; fall back to hqdefault.
  const [thumb, setThumb] = useState<"maxresdefault" | "hqdefault">("maxresdefault");

  return (
    <section className={styles.section} id="story" aria-labelledby="story-title">
      <div className={styles.head}>
        <span className={styles.kicker}>Our story</span>
        <h3 id="story-title" className={styles.title}>
          How PKC BIZOFT <em>began.</em>
        </h3>
        <p className={styles.lead}>
          Watch the story behind the team and the network we are building together.
        </p>
      </div>

      <div className={styles.frame}>
        <span className={`${styles.corner} ${styles.tl}`} />
        <span className={`${styles.corner} ${styles.tr}`} />
        <span className={`${styles.corner} ${styles.bl}`} />
        <span className={`${styles.corner} ${styles.br}`} />

        {VIDEO_ID && playing ? (
          <iframe
            className={styles.player}
            src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1&rel=0&modestbranding=1`}
            title="PKC BIZOFT story video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : VIDEO_ID ? (
          <button
            type="button"
            className={styles.thumb}
            onClick={() => setPlaying(true)}
            aria-label="Play the PKC BIZOFT story video"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://i.ytimg.com/vi/${VIDEO_ID}/${thumb}.jpg`}
              alt=""
              className={styles.thumbImage}
              onError={() => setThumb("hqdefault")}
              // YouTube serves a 120px grey placeholder for a missing maxres image
              // without an error, so treat a tiny image the same way.
              onLoad={(event) => {
                if (event.currentTarget.naturalWidth <= 120) setThumb("hqdefault");
              }}
            />
            <span className={styles.shade} />
            <span className={styles.play}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2Z" />
              </svg>
            </span>
            <span className={styles.caption}>Play our story</span>
          </button>
        ) : (
          <div className={styles.soon}>
            <span className={styles.play} aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2Z" />
              </svg>
            </span>
            <strong>Our story video is coming soon</strong>
            <small>Check back shortly.</small>
          </div>
        )}
      </div>

      {VIDEO_ID && (
        <a
          className={styles.external}
          href={`https://www.youtube.com/watch?v=${VIDEO_ID}`}
          target="_blank"
          rel="noreferrer"
        >
          Watch on YouTube ↗
        </a>
      )}
    </section>
  );
}
