"use client";

import { createClient } from "../../lib/supabaseClient";
import { LiveBadge } from "./LiveBadge";

const supabase = createClient();

// Referral payouts Accounting still has to send (waiting, or already started).
async function countOpen() {
  const { count, error } = await supabase
    .from("referral_withdrawals")
    .select("id", { count: "exact", head: true })
    .in("status", ["Pending", "Processing"]);
  return error ? null : count || 0;
}

export function PendingWithdrawalsBadge() {
  return (
    <LiveBadge
      fetchCount={countOpen}
      table="referral_withdrawals"
      label={(n) => `${n} referral payout${n === 1 ? "" : "s"} to send`}
    />
  );
}
