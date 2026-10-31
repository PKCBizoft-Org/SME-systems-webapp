"use client";

import { useState, useSyncExternalStore } from "react";

// Set when someone turns lite mode off by hand; the head script in layout.tsx and LagWatch
// both respect it, so the full effects stay on for that browser from then on.
export const LITE_OFF_KEY = "pkc_lite_off";

function liteOn() {
  return document.documentElement.classList.contains("lite");
}

const subscribe = () => () => {};

// A small corner button that only shows while lite mode is on, so people who were switched
// to it (weak phone, data saver or a slow first load) can get the full animations back.
export function LiteToggle() {
  const isLite = useSyncExternalStore(subscribe, liteOn, () => false);
  const [hidden, setHidden] = useState(false);

  if (!isLite || hidden) return null;

  function turnOff() {
    document.documentElement.classList.remove("lite");
    try {
      localStorage.setItem(LITE_OFF_KEY, "1");
      localStorage.removeItem("pkc_lite_v2");
    } catch {
      // Private mode: it is off for this visit only.
    }
    setHidden(true);
  }

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: 12,
        bottom: 12,
        zIndex: 9998,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 8px 8px 14px",
        border: "1px solid rgba(76,232,255,.35)",
        borderRadius: 999,
        background: "rgba(3,12,18,.96)",
        color: "#cfefff",
        fontSize: 12,
        boxShadow: "0 8px 30px rgba(0,0,0,.45)",
      }}
    >
      Lite mode is on (fewer effects)
      <button
        type="button"
        onClick={turnOff}
        style={{
          padding: "6px 12px",
          border: 0,
          borderRadius: 999,
          background: "#c9fbff",
          color: "#02080c",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".08em",
          cursor: "pointer",
        }}
      >
        TURN OFF
      </button>
      <button
        type="button"
        onClick={() => setHidden(true)}
        aria-label="Hide"
        style={{ border: 0, background: "none", color: "#8fb7c4", fontSize: 16, cursor: "pointer", padding: "0 6px" }}
      >
        ×
      </button>
    </div>
  );
}
