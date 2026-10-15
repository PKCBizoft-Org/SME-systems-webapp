"use client";

/* Plain <a> on purpose, same as the other public pages. */
 
import { useState, useSyncExternalStore } from "react";

const KEY = "pkc_cookie_notice_v1";

// The site only uses essential cookies (sign-in session), so this is an
// information notice with one button, not an opt-in wall.
function seen() {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

const subscribe = () => () => {};

export function CookieNotice() {
  // Server render and first paint say "seen" so nothing flashes; the browser snapshot then decides.
  const alreadySeen = useSyncExternalStore(subscribe, seen, () => true);
  const [dismissed, setDismissed] = useState(false);
  const show = !alreadySeen && !dismissed;

  if (!show) return null;

  function accept() {
    try {
      localStorage.setItem(KEY, new Date().toISOString());
    } catch {
      // Private mode: the notice just shows again next visit.
    }
    setDismissed(true);
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie notice"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 9999,
        maxWidth: 560,
        margin: "0 auto",
        padding: "14px 16px",
        border: "1px solid rgba(76,232,255,.35)",
        borderRadius: 12,
        background: "rgba(3,12,18,.96)",
        color: "#eaf8ff",
        fontSize: 13,
        lineHeight: 1.55,
        boxShadow: "0 10px 40px rgba(0,0,0,.5)",
      }}
    >
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        aria-hidden="true"
        style={{ float: "left", margin: "2px 12px 4px 0" }}
      >
        <path
          d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-4-4 4 4 0 0 1-4-4 2 2 0 0 1-2-2z"
          fill="#c98a4b"
          stroke="#4ce8ff"
          strokeWidth="1"
        />
        <circle cx="8" cy="10" r="1.4" fill="#5a3410" />
        <circle cx="12" cy="15" r="1.4" fill="#5a3410" />
        <circle cx="16" cy="13" r="1.2" fill="#5a3410" />
        <circle cx="8.5" cy="15.5" r="1" fill="#5a3410" />
      </svg>
      We use only essential cookies to keep you signed in and your account safe. No ads, no tracking. Read our{" "}
      <a href="/cookies" style={{ color: "#4ce8ff" }}>Cookie Notice</a>,{" "}
      <a href="/privacy" style={{ color: "#4ce8ff" }}>Privacy Policy</a> and{" "}
      <a href="/terms" style={{ color: "#4ce8ff" }}>Terms</a>.
      <div style={{ marginTop: 10, textAlign: "right" }}>
        <button
          onClick={accept}
          style={{
            minHeight: 38,
            padding: "0 18px",
            border: "1px solid #0e72ad",
            borderRadius: 8,
            background: "#092237",
            color: "#5ebeff",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
