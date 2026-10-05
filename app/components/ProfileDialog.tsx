"use client";

import { ReactNode, useEffect, useRef } from "react";
import styles from "./profile-dialog.module.css";

export type ProfileDetails = {
  tag: string;
  name: string;
  role: string;
  description: string;
  details: { label: string; value: string }[];
};

// Modal "ID card" for a person on the Who We Are page. It only shows what the
// page already knows about them.
export function ProfileDialog({
  profile,
  avatar,
  onClose,
}: {
  profile: ProfileDetails | null;
  avatar: ReactNode;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const open = profile !== null;

  useEffect(() => {
    if (!open) return;

    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      // Keep keyboard focus inside the dialog while it is open.
      if (event.key === "Tab") {
        event.preventDefault();
        closeRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [open, onClose]);

  if (!profile) return null;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-dialog-name"
        onClick={(event) => event.stopPropagation()}
      >
        <button ref={closeRef} type="button" className={styles.close} onClick={onClose} aria-label="Close profile">
          ×
        </button>

        <div className={styles.visual} aria-hidden="true">
          <span className={styles.grid} />
          <span className={styles.orbit} />
          <span className={`${styles.orbit} ${styles.orbitTwo}`} />
          <div className={styles.avatar}>{avatar}</div>
          <span className={styles.scan} />
        </div>

        <div className={styles.body}>
          <span className={styles.tag}>{profile.tag}</span>
          <h2 id="profile-dialog-name" className={styles.name}>
            {profile.name}
          </h2>
          <p className={styles.role}>{profile.role}</p>
          <p className={styles.description}>{profile.description}</p>

          <dl className={styles.details}>
            {profile.details.map((item) => (
              <div key={item.label} className={styles.detail}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
