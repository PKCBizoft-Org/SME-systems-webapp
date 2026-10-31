"use client";

import { useEffect } from "react";
import { LITE_OFF_KEY } from "./LiteToggle";

const KEY = "pkc_lite_v2";

// Watches how smoothly the page draws during its first seconds (the intro is the heaviest part).
// If it averages under about 24 frames per second, the lighter mode is switched on and remembered,
// so visits in the next 7 days start light straight away (the head script in layout.tsx reads the same key).
// After that it checks again, so one slow first load never switches the effects off for good.
export function LagWatch() {
  useEffect(() => {
    const root = document.documentElement;
    if (root.classList.contains("lite")) return;
    try {
      // Turned off by hand with the lite mode button: never switch it back on.
      if (localStorage.getItem(LITE_OFF_KEY)) return;
    } catch {
      // Private mode: keep watching.
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let last = 0;
    let frames = 0;
    let total = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      if (last && !document.hidden) {
        const gap = now - last;
        // Ignore the first half second (loading) and gaps from switching tabs.
        if (now - startedAt > 500 && gap < 500) {
          frames += 1;
          total += gap;
        }
      }
      last = now;

      if (now - startedAt >= 4500) {
        if (frames >= 20 && total / frames > 42) {
          root.classList.add("lite");
          try {
            localStorage.setItem(KEY, String(Date.now()));
          } catch {
            // Private mode: it just checks again next visit.
          }
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return null;
}
