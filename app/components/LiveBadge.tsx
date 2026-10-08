"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabaseClient";

const supabase = createClient();
const REFRESH_MS = 15_000;

// Any page that changes something a badge counts calls this so every badge
// updates right away instead of waiting for the next refresh.
export const BADGES_CHANGED_EVENT = "pkc:badges-changed";
export function notifyBadgesChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BADGES_CHANGED_EVENT));
}

type Props = {
  /** Returns the number to show, or null when it can't be read. */
  fetchCount: () => Promise<number | null>;
  /** Table whose changes should refresh the count straight away. */
  table: string;
  /** Plural/singular text for screen readers, e.g. "payment waiting for verification". */
  label: (count: number) => string;
};

// Red count bubble beside a menu item. Updates on a timer, when the tab regains
// focus, when a page calls notifyBadgesChanged(), and on live database changes.
// Quietly shows nothing if the count can't be read.
export function LiveBadge({ fetchCount, table, label }: Props) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const next = await fetchCount();
      if (!cancelled && next !== null) setCount(next);
    }

    void load();
    const refreshNow = () => {
      if (!document.hidden) void load();
    };
    const timer = window.setInterval(refreshNow, REFRESH_MS);
    window.addEventListener(BADGES_CHANGED_EVENT, refreshNow);
    window.addEventListener("focus", refreshNow);
    document.addEventListener("visibilitychange", refreshNow);

    const channel = supabase
      .channel(`badge-${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => void load())
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(BADGES_CHANGED_EVENT, refreshNow);
      window.removeEventListener("focus", refreshNow);
      document.removeEventListener("visibilitychange", refreshNow);
      void supabase.removeChannel(channel);
    };
  }, [fetchCount, table]);

  if (count <= 0) return null;

  return (
    <span
      aria-label={label(count)}
      title={label(count)}
      style={{
        marginLeft: 8,
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        borderRadius: 999,
        background: "#ff5c7a",
        color: "#fff",
        fontSize: 11,
        fontWeight: 800,
        lineHeight: "18px",
        textAlign: "center",
        display: "inline-block",
      }}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}
