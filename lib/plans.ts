/** One-time installation fee, in pesos, the only amount collected when a new customer applies. */
export const INSTALL_FEE = 750;

// Plans are stored by price code (G1_P750); people know them by speed.
const SPEED_BY_PRICE: Record<number, number> = { 750: 50, 1000: 80, 1500: 120, 2000: 200 };

/** What to show people: "50 Mbps" for G1_P750, otherwise the stored name unchanged. */
export function planLabel(planName: string | null | undefined): string {
  const match = /P(\d+)/i.exec(planName || "");
  const speed = match ? SPEED_BY_PRICE[Number(match[1])] : undefined;
  return speed ? `${speed} Mbps` : (planName ?? "");
}
