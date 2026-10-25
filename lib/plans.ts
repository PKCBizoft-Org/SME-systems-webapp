import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

/** One-time installation fee, in pesos, the only amount collected when a new customer applies. */
export const INSTALL_FEE = 750;

// Plans are stored by price code (G1_P750); people know them by speed.
const SPEED_BY_PRICE: Record<number, number> = { 750: 50, 1000: 80, 1500: 120, 2000: 200 };

// Speeds from the plans table (plan_catalog), by plan name, e.g. g1_p750 -> "50 Mbps".
// The price map above is only the fallback until it has loaded.
const speedByName = new Map<string, string>();
let catalogLoad: Promise<void> | null = null;

function loadPlanCatalog(): Promise<void> {
  if (!catalogLoad) {
    catalogLoad = (async () => {
      const { data, error } = await createClient().rpc("plan_catalog");
      if (error) {
        catalogLoad = null; // try again next time
        return;
      }
      for (const row of (data ?? []) as { plan_name: string; speed: string | null }[]) {
        if (row.plan_name && row.speed) speedByName.set(row.plan_name.toLowerCase(), row.speed);
      }
    })();
  }
  return catalogLoad;
}

/** Loads the plan list once and re-renders the page when it arrives, so planLabel shows real speeds. */
export function usePlanCatalog() {
  const [, setLoaded] = useState(speedByName.size > 0);
  useEffect(() => {
    let alive = true;
    void loadPlanCatalog().then(() => {
      if (alive) setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);
}

/** What to show people: "50 Mbps" for G1_P750, otherwise the stored name unchanged. */
export function planLabel(planName: string | null | undefined): string {
  const stored = planName ? speedByName.get(planName.toLowerCase()) : undefined;
  if (stored) return stored;
  const match = /P(\d+)/i.exec(planName || "");
  const speed = match ? SPEED_BY_PRICE[Number(match[1])] : undefined;
  return speed ? `${speed} Mbps` : (planName ?? "");
}
