"use client";

import { createClient } from "../../lib/supabaseClient";
import { LiveBadge } from "./LiveBadge";

export { BADGES_CHANGED_EVENT, notifyBadgesChanged } from "./LiveBadge";

const supabase = createClient();

// Customer payments still waiting to be verified.
async function countPending() {
  const { count, error } = await supabase
    .from("payment_submissions")
    .select("id", { count: "exact", head: true })
    .not("status", "in", "(verified,rejected)");
  return error ? null : count || 0;
}

export function PendingPaymentsBadge() {
  return (
    <LiveBadge
      fetchCount={countPending}
      table="payment_submissions"
      label={(n) => `${n} payment${n === 1 ? "" : "s"} waiting for verification`}
    />
  );
}
