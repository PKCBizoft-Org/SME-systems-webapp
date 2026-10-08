"use client";

import { createClient } from "../../lib/supabaseClient";
import { LiveBadge } from "./LiveBadge";

const supabase = createClient();

// Low ratings (1-2 stars) nobody has marked as reviewed yet.
async function countUnreviewedLow() {
  const { count, error } = await supabase
    .from("ratings")
    .select("id", { count: "exact", head: true })
    .lte("stars", 2)
    .is("reviewed_at", null);
  return error ? null : count || 0;
}

export function LowRatingsBadge() {
  return (
    <LiveBadge
      fetchCount={countUnreviewedLow}
      table="ratings"
      label={(n) => `${n} low rating${n === 1 ? "" : "s"} to review`}
    />
  );
}
