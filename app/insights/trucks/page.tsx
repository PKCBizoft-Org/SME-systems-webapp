"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "../../../lib/supabaseClient";
import { StaffHeader } from "../../components/StaffHeader";
import { PkcLoader } from "../../components/PkcLoader";
import { InsightsNav } from "../InsightsNav";
import { useInsightsAccess } from "../useInsightsAccess";
import styles from "../../accounting/reports/reports.module.css";

type Truck = { user_id: string; item_id: string; item: string; unit: string | null; quantity: number; min_quantity: number; low: boolean };
type Tech = { user_id: string; name: string };
type Item = { id: string; name: string; unit: string | null; on_hand: number };

const supabase = createClient();

export default function TrucksPage() {
  const access = useInsightsAccess("inventory");
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [techId, setTechId] = useState("");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("");
  const [minQty, setMinQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("truck_overview");
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    const overview = data as { trucks: Truck[]; technicians: Tech[]; items: Item[] };
    setTrucks((overview.trucks || []).map((t) => ({ ...t, quantity: Number(t.quantity), min_quantity: Number(t.min_quantity) })));
    setTechs(overview.technicians || []);
    setItems((overview.items || []).map((i) => ({ ...i, on_hand: Number(i.on_hand) })));
  }, []);

  useEffect(() => {
    // Loading data once access is confirmed is a genuine external sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (access.authorized) void load();
  }, [access.authorized, load]);

  const effectiveTech = techId || techs[0]?.user_id || "";
  const mine = useMemo(() => trucks.filter((t) => t.user_id === effectiveTech), [trucks, effectiveTech]);
  const selectedItem = items.find((i) => i.id === itemId);

  async function loadTruck() {
    setBusy(true);
    setError("");
    setNotice("");
    const { data, error: rpcError } = await supabase.rpc("load_truck_stock", {
      p_user: effectiveTech,
      p_item: itemId,
      p_qty: Number(qty),
      p_min: minQty === "" ? null : Number(minQty),
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setNotice(`Loaded. ${techs.find((t) => t.user_id === effectiveTech)?.name} now carries ${Number(data)} of it.`);
    setQty("");
    await load();
  }

  async function unload(truck: Truck) {
    const text = window.prompt(`How many ${truck.item} to take back? (up to ${truck.quantity})`, String(truck.quantity));
    if (text === null) return;
    const amount = Number(text);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a number above 0.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    const { error: rpcError } = await supabase.rpc("unload_truck_stock", { p_user: truck.user_id, p_item: truck.item_id, p_qty: amount });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setNotice(`${amount} ${truck.item} returned to the central stock.`);
    await load();
  }

  if (access.checking) return <PkcLoader label="Opening truck stock" steps={["Verifying your role", "Loading trucks"]} />;
  if (!access.authorized) return null;

  const lowCount = trucks.filter((t) => t.low).length;

  return (
    <main className={styles.page}>
      <StaffHeader current="insights" roles={access.roles} />
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <h1>Truck stock</h1>
            <p>
              What each technician carries. Loading a truck takes the items out of the central stock and records it; technicians use the
              stock on jobs in the app and are warned when an item runs low.
            </p>
          </div>
        </section>

        <InsightsNav current="trucks" permissions={access.permissions} />

        <div className={styles.cards}>
          <div className={styles.card}>
            <small>Technicians</small>
            <strong>{techs.length}</strong>
          </div>
          <div className={styles.card}>
            <small>Items on trucks</small>
            <strong>{trucks.length}</strong>
          </div>
          <div className={styles.card}>
            <small>Running low</small>
            <strong className={lowCount > 0 ? styles.bad : styles.good}>{lowCount}</strong>
          </div>
        </div>

        {error && (
          <div className={styles.notice} role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className={styles.notice} role="status" style={{ borderColor: "rgba(52,211,153,0.5)" }}>
            {notice}
          </div>
        )}

        <div className={styles.split}>
          <div className={styles.panel}>
            <h2>Load a truck</h2>
            <div style={{ padding: 16, display: "grid", gap: 12 }}>
              <label className={styles.field}>
                Technician
                <select value={effectiveTech} onChange={(e) => setTechId(e.target.value)}>
                  {techs.map((t) => (
                    <option key={t.user_id} value={t.user_id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                Item
                <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
                  <option value="">Choose an item</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.on_hand} in stock)
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.controls} style={{ marginBottom: 0 }}>
                <label className={styles.field}>
                  Quantity{selectedItem?.unit ? ` (${selectedItem.unit})` : ""}
                  <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} style={{ minWidth: 110 }} />
                </label>
                <label className={styles.field}>
                  Warn when at or below
                  <input type="number" min={0} value={minQty} onChange={(e) => setMinQty(e.target.value)} placeholder="2" style={{ minWidth: 110 }} />
                </label>
                <button className={styles.btnPrimary} onClick={() => void loadTruck()} disabled={busy || !effectiveTech || !itemId || !(Number(qty) > 0)}>
                  {busy ? "Saving…" : "Load truck"}
                </button>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <h2>On this truck</h2>
            {mine.length === 0 ? (
              <div className={styles.empty}>Nothing loaded for this technician yet.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className={styles.right}>Quantity</th>
                    <th className={styles.right}>Warn at</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {mine.map((t) => (
                    <tr key={t.item_id}>
                      <td>
                        {t.item}
                        {t.low ? <span className={styles.flag} style={{ marginLeft: 8 }}>low</span> : null}
                      </td>
                      <td className={`${styles.right} ${t.low ? styles.bad : ""}`}>
                        {t.quantity}
                        {t.unit ? ` ${t.unit}` : ""}
                      </td>
                      <td className={styles.right}>{t.min_quantity}</td>
                      <td className={styles.right}>
                        <button className={styles.btn} onClick={() => void unload(t)} disabled={busy}>
                          Take back
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <p className={styles.muted} style={{ marginTop: 12 }}>
          Only inventory staff and admins can load or unload a truck. Every change is kept in the stock history.
        </p>
      </div>
    </main>
  );
}
