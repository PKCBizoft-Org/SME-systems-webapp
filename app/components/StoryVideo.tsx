"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import styles from "./story-video.module.css";

// Both files live in /public/media, so the site serves them itself and they
// play on any device that can open the page (no local file paths, no third
// party host). The video is H.264 MP4, which every modern browser and phone
// supports. `#t=0.1` makes browsers (iOS Safari included) paint a frame as the
// poster before it is played.
const STORY_VIDEO_SRC = "/media/pkc-story.mp4";
const TEAM_PHOTO_SRC = "/media/pkc-team.jpg";

export function StoryVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);

  function play() {
    const video = videoRef.current;
    if (!video) return;
    setStarted(true);
    // play() returns a promise that rejects if the browser blocks it; the
    // native controls are shown at that point so the viewer can press play.
    video.play().catch(() => {});
  }

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

      <div className={styles.stage}>
        <div className={styles.frame}>
          <span className={`${styles.corner} ${styles.tl}`} />
          <span className={`${styles.corner} ${styles.tr}`} />
          <span className={`${styles.corner} ${styles.bl}`} />
          <span className={`${styles.corner} ${styles.br}`} />

          {failed ? (
            <div className={styles.soon}>
              <strong>The video could not be loaded</strong>
              <a className={styles.external} href={STORY_VIDEO_SRC} target="_blank" rel="noreferrer">
                Open the video directly ↗
              </a>
            </div>
          ) : (
            <video
              ref={videoRef}
              className={styles.player}
              src={`${STORY_VIDEO_SRC}#t=0.1`}
              controls={started}
              playsInline
              preload="metadata"
              onPlay={() => setStarted(true)}
              onError={() => setFailed(true)}
              aria-label="PKC BIZOFT story video"
            />
          )}

          {!started && !failed && (
            <button
              type="button"
              className={styles.thumb}
              onClick={play}
              aria-label="Play the PKC BIZOFT story video"
            >
              <span className={styles.shade} />
              <span className={styles.play}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2Z" />
                </svg>
              </span>
              <span className={styles.caption}>Play our story</span>
            </button>
          )}
        </div>

        <figure className={styles.photo}>
          <div className={styles.photoFrame}>
            <Image
              src={TEAM_PHOTO_SRC}
              alt="The PKC BIZOFT team gathered around a table at a coffee shop, smiling for a group selfie"
              width={2000}
              height={1500}
              sizes="(max-width: 860px) 100vw, 640px"
              className={styles.photoImage}
            />
          </div>
          <figcaption className={styles.photoCaption}>
            <span>The team</span>
            PKC BIZOFT
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
