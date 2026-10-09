"use client";

import { createClient } from "../../lib/supabaseClient";
import { LiveBadge } from "./LiveBadge";

export { BADGES_CHANGED_EVENT, notifyBadgesChanged } from "./LiveBadge";

const supabase = createClient();

// Customer payments still waiting to be verified. (Statuses are stored as
// "Pending", "Verified" and "Rejected"; the old lowercase filter matched none of
// them, so finished payments were being counted too.)
async function countPending() {
  const { count, error } = await supabase
    .from("payment_submissions")
    .select("id", { count: "exact", head: true })
    .eq("status", "Pending");
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
