"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabaseClient";

const supabase = createClient();
const REFRESH_MS = 15_000;

// Any page that changes a payment's status calls this so the badge updates
// right away instead of waiting for the next refresh.
export const BADGES_CHANGED_EVENT = "pkc:badges-changed";
export function notifyBadgesChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BADGES_CHANGED_EVENT));
}

// Red count on the Accounting menu: customer payments still waiting to be
// verified. Quietly shows nothing if the count can't be read.
export function PendingPaymentsBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { count: waiting, error } = await supabase
        .from("payment_submissions")
        .select("id", { count: "exact", head: true })
        .not("status", "in", "(verified,rejected)");
      if (!cancelled && !error) setCount(waiting || 0);
    }

    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);

    const refreshNow = () => {
      if (!document.hidden) void load();
    };
    window.addEventListener(BADGES_CHANGED_EVENT, refreshNow);
    window.addEventListener("focus", refreshNow);
    document.addEventListener("visibilitychange", refreshNow);

    // Live updates when the database publishes changes; polling above is the fallback.
    const channel = supabase
      .channel("pending-payments-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_submissions" }, () => void load())
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(BADGES_CHANGED_EVENT, refreshNow);
      window.removeEventListener("focus", refreshNow);
      document.removeEventListener("visibilitychange", refreshNow);
      void supabase.removeChannel(channel);
    };
  }, []);

  if (count <= 0) return null;

  return (
    <span
      aria-label={`${count} payment${count === 1 ? "" : "s"} waiting for verification`}
      title={`${count} payment${count === 1 ? "" : "s"} waiting for verification`}
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
