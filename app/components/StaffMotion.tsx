"use client";

import { useEffect } from "react";

// Entrance and hover motion for the signed-in staff pages.
//
// Each page names the elements it wants animated (cards, panels, rows). They
// rise into view one after another as they enter the screen, and cards lift
// slightly under the pointer (the CSS is in globals.css under [data-fx]).
//
// It works through a data attribute rather than a class, because React
// rewrites className on re-render and would wipe the effect. A MutationObserver
// picks up elements that appear after data loads. Reduced-motion users get
// the plain page: nothing is hidden and nothing animates.
export function StaffMotion({ targets, lift = [] }: { targets: string[]; lift?: string[] }) {
  const selector = targets.join(",");
  const liftSelector = lift.join(",");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const seen = new WeakSet<Element>();
    let raf = 0;

    const reveal = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          reveal.unobserve(entry.target);
          entry.target.setAttribute("data-fx", "in");
        }
      },
      { threshold: 0, rootMargin: "0px 0px -6% 0px" },
    );

    const scan = () => {
      raf = 0;
      // Stagger siblings that arrive together, restarting every few items so
      // a long list never waits seconds for its last row.
      let index = 0;
      document.querySelectorAll(selector).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        (el as HTMLElement).style.setProperty("--fx-i", String(index % 8));
        index += 1;
        el.setAttribute("data-fx", "pre");
        if (liftSelector && el.matches(liftSelector)) el.setAttribute("data-fx-lift", "");
        reveal.observe(el);
      });
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(scan);
    };

    scan();
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      mutations.disconnect();
      reveal.disconnect();
      document.querySelectorAll("[data-fx]").forEach((el) => {
        el.removeAttribute("data-fx");
        el.removeAttribute("data-fx-lift");
      });
    };
  }, [selector, liftSelector]);

  return null;
}
