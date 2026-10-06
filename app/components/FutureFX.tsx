"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// The logged-in area is data-heavy, so it only gets the progress bar.
// No cursor glow, no particles, no reveal animations.
const CALM_ROUTES = ["/clients", "/accounting", "/users", "/set-password"];

// Pages that get scroll-reveal. The home and who-we-are pages already have
// their own reveal logic, so they are deliberately not listed.
const REVEAL_SELECTORS: Record<string, string> = {
  "/download": "[data-reveal]",
};

const CYAN = "76, 232, 255";

type Particle = { x: number; y: number; vx: number; vy: number; r: number };

function startConstellation(canvas: HTMLCanvasElement, pointer: { x: number; y: number }) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let width = 0;
  let height = 0;
  let particles: Particle[] = [];
  let raf = 0;
  let last = 0;

  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Fewer particles on phones and small screens to protect battery.
    const count = Math.min(Math.round((width * height) / (coarse ? 28000 : 19000)), coarse ? 28 : 70);
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.28,
      vy: (Math.random() - 0.5) * 0.28,
      r: 0.8 + Math.random() * 1.4,
    }));
  };

  const LINK = 130;
  const REACH = 170;

  const frame = (time: number) => {
    raf = requestAnimationFrame(frame);
    if (time - last < 32) return; // ~30fps is plenty for ambient motion
    last = time;

    ctx.clearRect(0, 0, width, height);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;

      // Gentle pull toward the pointer.
      const dx = pointer.x - p.x;
      const dy = pointer.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < REACH && dist > 1) {
        p.x += (dx / dist) * 0.35;
        p.y += (dy / dist) * 0.35;
      }
    }

    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < LINK) {
          ctx.strokeStyle = `rgba(${CYAN}, ${(1 - d / LINK) * 0.2})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      const pd = Math.hypot(a.x - pointer.x, a.y - pointer.y);
      if (pd < REACH) {
        ctx.strokeStyle = `rgba(${CYAN}, ${(1 - pd / REACH) * 0.45})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(pointer.x, pointer.y);
        ctx.stroke();
      }

      ctx.fillStyle = `rgba(${CYAN}, 0.7)`;
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const start = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  // Don't burn CPU while the tab is in the background.
  const onVisibility = () => (document.hidden ? stop() : start());

  resize();
  start();
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    stop();
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

export function FutureFX() {
  const pathname = usePathname();
  const calm = CALM_ROUTES.some((route) => pathname.startsWith(route));

  const progressRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointer = useRef({ x: -9999, y: -9999 });

  // Scroll progress + cursor glow (the quiet effects, on every page).
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const progress = progressRef.current;
    const glow = glowRef.current;
    // No cursor glow inside the logged-in area.
    const fine = !calm && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    let raf = 0;
    let gx = window.innerWidth / 2;
    let gy = window.innerHeight / 3;

    const onScroll = () => {
      if (!progress) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = `scaleX(${max > 0 ? Math.min(window.scrollY / max, 1) : 0})`;
    };

    // The glow only animates while it is still catching up with the pointer,
    // then the frame loop stops so an idle page costs nothing.
    const loop = () => {
      raf = 0;
      if (!glow || !fine) return;
      const dx = pointer.current.x - gx;
      const dy = pointer.current.y - gy;
      gx += dx * 0.14;
      gy += dy * 0.14;
      glow.style.transform = `translate3d(${gx - 280}px, ${gy - 280}px, 0)`;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) raf = requestAnimationFrame(loop);
    };

    const onMove = (event: PointerEvent) => {
      pointer.current.x = event.clientX;
      pointer.current.y = event.clientY;
      glow?.classList.add("fxOn");
      if (!raf) raf = requestAnimationFrame(loop);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    if (fine) window.addEventListener("pointermove", onMove, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("pointermove", onMove);
    };
  }, [pathname, calm]);

  // Constellation particles (not on dashboards).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || calm) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    canvas.classList.add("fxOn");
    const stop = startConstellation(canvas, pointer.current);
    return () => {
      stop();
      canvas.classList.remove("fxOn");
    };
  }, [calm, pathname]);

  // Scroll reveal on pages that opt in.
  useEffect(() => {
    const selector = REVEAL_SELECTORS[pathname];
    if (!selector || calm) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Only hide what is below the fold; anything already on screen stays put,
    // so there is no flash of content disappearing on load.
    const targets = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(
      (el) => el.getBoundingClientRect().top > window.innerHeight * 0.92,
    );

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("fxIn");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" },
    );

    targets.forEach((el, index) => {
      el.style.setProperty("--fx-delay", `${(index % 3) * 90}ms`);
      el.classList.add("fxReveal");
      observer.observe(el);
    });

    return () => {
      observer.disconnect();
      targets.forEach((el) => {
        el.classList.remove("fxReveal", "fxIn");
        el.style.removeProperty("--fx-delay");
      });
    };
  }, [pathname, calm]);

  return (
    <>
      <div ref={progressRef} className="fxProgress" aria-hidden="true" />
      <div ref={glowRef} className="fxGlow" aria-hidden="true" />
      <canvas ref={canvasRef} className="fxCanvas" aria-hidden="true" />
    </>
  );
}
