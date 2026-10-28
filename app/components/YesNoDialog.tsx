import { useEffect } from "react";
import styles from "./yes-no-dialog.module.css";

// A small Yes / No question in the site's own style (the browser's confirm box says OK / Cancel).
// Escape or a click outside counts as No.
export function YesNoDialog({
  open,
  title,
  message,
  onYes,
  onNo,
}: {
  open: boolean;
  title: string;
  message?: string;
  onYes: () => void;
  onNo: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onNo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onNo]);

  if (!open) return null;
  return (
    <div className={styles.backdrop} onMouseDown={onNo}>
      <section
        className={styles.box}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="yes-no-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="yes-no-title">{title}</h2>
        {message ? <p>{message}</p> : null}
        <footer>
          <button type="button" className={styles.no} onClick={onNo} autoFocus>
            No
          </button>
          <button type="button" className={styles.yes} onClick={onYes}>
            Yes
          </button>
        </footer>
      </section>
    </div>
  );
}
