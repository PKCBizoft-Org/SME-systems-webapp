"use client";

import { useEffect } from "react";

// Hover and click effects for the people cards on the Who We Are page.
//
// It is attached with event delegation, so it works on the existing markup
// without changing the cards themselves:
//  - a soft spotlight that follows the cursor
//  - a subtle 3D tilt on the card's visual area (the child, so it never
//    fights the card's own hover transform)
//  - a ripple where you click
//
// Tilt and spotlight are for mouse users only; the ripple works everywhere.
// Everything is skipped for reduced-motion users.

const DEFAULT_CARD = ".coCard, .founderCard, .leadCard";
const DEFAULT_VISUAL = ".coVisual, .founderVisual, .leadVisual";
const MAX_TILT = 7;

function ensureSpot(card: HTMLElement) {
  let spot = card.querySelector<HTMLElement>(":scope > .fxSpot");
  if (!spot) {
    // The spotlight is absolutely positioned inside the card.
    if (getComputedStyle(card).position === "static") card.style.position = "relative";
    spot = document.createElement("span");
    spot.className = "fxSpot";
    spot.setAttribute("aria-hidden", "true");
    card.appendChild(spot);
  }
  return spot;
}

export function CardFX({
  cards = DEFAULT_CARD,
  visuals = DEFAULT_VISUAL,
}: {
  // Which elements get the effects, and which child of each card tilts.
  // Pass visuals="" for spotlight + ripple only (no tilt).
  cards?: string;
  visuals?: string;
}) {
  const CARD = cards;
  const VISUAL = visuals;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    let current: HTMLElement | null = null;

    const release = (card: HTMLElement | null) => {
      if (!card) return;
      card.querySelector<HTMLElement>(":scope > .fxSpot")?.classList.remove("fxSpotOn");
      const visual = VISUAL ? card.querySelector<HTMLElement>(VISUAL) : null;
      if (visual) {
        visual.style.transition = "transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)";
        visual.style.transform = "";
      }
    };

    const onMove = (event: PointerEvent) => {
      const card = (event.target as Element | null)?.closest<HTMLElement>(CARD) ?? null;

      if (card !== current) {
        release(current);
        current = card;
      }
      if (!card) return;

      const rect = card.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      const spot = ensureSpot(card);
      spot.style.setProperty("--mx", `${x}px`);
      spot.style.setProperty("--my", `${y}px`);
      spot.classList.add("fxSpotOn");

      const visual = VISUAL ? card.querySelector<HTMLElement>(VISUAL) : null;
      if (visual) {
        const rx = (0.5 - y / rect.height) * MAX_TILT;
        const ry = (x / rect.width - 0.5) * MAX_TILT;
        visual.style.transition = "transform 0.12s ease-out";
        visual.style.transform = `perspective(800px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(1.02)`;
      }
    };

    const onLeave = () => {
      release(current);
      current = null;
    };

    const onClick = (event: MouseEvent) => {
      const card = (event.target as Element | null)?.closest<HTMLElement>(CARD);
      if (!card) return;

      if (getComputedStyle(card).position === "static") card.style.position = "relative";
      const rect = card.getBoundingClientRect();
      const ripple = document.createElement("span");
      ripple.className = "fxRipple";
      ripple.style.left = `${event.clientX - rect.left}px`;
      ripple.style.top = `${event.clientY - rect.top}px`;
      card.appendChild(ripple);
      ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
    };

    if (fine) {
      document.addEventListener("pointermove", onMove, { passive: true });
      document.addEventListener("pointerleave", onLeave);
    }
    document.addEventListener("click", onClick);

    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("click", onClick);
      release(current);
      document.querySelectorAll(".fxSpot, .fxRipple").forEach((el) => el.remove());
    };
  }, [CARD, VISUAL]);

  return null;
}
