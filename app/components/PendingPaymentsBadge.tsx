"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabaseClient";

const supabase = createClient();
const REFRESH_MS = 60_000;

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

    return () => {
      cancelled = true;
      window.clearInterval(timer);
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
