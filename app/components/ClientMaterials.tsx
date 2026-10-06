"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import styles from "./client-materials.module.css";

type Row = {
  id: string;
  movement_type: "installation_use" | "return" | "stock_in" | "stock_out" | "adjustment";
  quantity_change: number;
  reference: string | null;
  notes: string | null;
  created_by_email: string | null;
  created_at: string;
  inventory_items: { name: string; unit: string; unit_cost: number | null } | null;
};

const LABEL: Record<Row["movement_type"], string> = {
  installation_use: "Used",
  return: "Returned",
  stock_in: "Received",
  stock_out: "Removed",
  adjustment: "Adjusted",
};

// Materials issued to one customer's installation, read from the inventory
// ledger. Renders nothing until the inventory migration has been applied.
export function ClientMaterials({ clientId }: { clientId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from("inventory_movements")
      .select(
        "id, movement_type, quantity_change, reference, notes, created_by_email, created_at, inventory_items(name, unit, unit_cost)",
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        // Missing table (migration not run) or no access: hide the panel.
        setRows(error ? null : ((data || []) as unknown as Row[]));
      });
    return () => {
      active = false;
    };
  }, [clientId, supabase]);

  if (rows === null) return null;

  // Net quantity per item and the cost of what is still on site.
  const totals = new Map<string, { qty: number; unit: string; cost: number }>();
  for (const row of rows) {
    const item = row.inventory_items;
    if (!item) continue;
    // Used is stored negative; flip it so "installed" reads as a positive amount.
    const installed = -Number(row.quantity_change);
    const entry = totals.get(item.name) ?? { qty: 0, unit: item.unit, cost: 0 };
    entry.qty += installed;
    entry.cost += installed * Number(item.unit_cost || 0);
    totals.set(item.name, entry);
  }
  const summary = [...totals.entries()].filter(([, v]) => v.qty !== 0);
  const totalCost = summary.reduce((sum, [, v]) => sum + v.cost, 0);

  return (
    <section id="materials-section" className={styles.panel}>
      <div className={styles.head}>
        <div>
          <span className={styles.index}>06</span>
          <h2>Materials used</h2>
          <p>Inventory issued to this installation</p>
        </div>
        <Link href="/inventory" className={styles.link}>
          Log materials ↗
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className={styles.empty}>No materials have been logged for this customer yet.</p>
      ) : (
        <>
          <div className={styles.summary}>
            {summary.map(([name, v]) => (
              <div key={name} className={styles.chip}>
                <strong>{v.qty.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                <span>
                  {v.unit} · {name}
                </span>
              </div>
            ))}
            {totalCost > 0 && (
              <div className={`${styles.chip} ${styles.cost}`}>
                <strong>
                  {totalCost.toLocaleString(undefined, { style: "currency", currency: "PHP", maximumFractionDigits: 0 })}
                </strong>
                <span>material cost</span>
              </div>
            )}
          </div>

          <ul className={styles.list}>
            {rows.map((row) => (
              <li key={row.id}>
                <span className={styles.tag}>{LABEL[row.movement_type]}</span>
                <span className={styles.what}>
                  {Math.abs(Number(row.quantity_change)).toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
                  {row.inventory_items?.unit} · {row.inventory_items?.name || "Unknown item"}
                  {row.reference ? ` · ${row.reference}` : ""}
                  {row.notes ? ` — ${row.notes}` : ""}
                </span>
                <time className={styles.when}>
                  {new Date(row.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  {row.created_by_email ? ` · ${row.created_by_email}` : ""}
                </time>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
