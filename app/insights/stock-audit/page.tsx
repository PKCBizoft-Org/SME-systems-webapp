"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "../../../lib/supabaseClient";
import { StaffHeader } from "../../components/StaffHeader";
import { BarcodeScanner, findByCode } from "../../inventory/BarcodeScanner";
import { useInsightsAccess } from "../useInsightsAccess";
import styles from "../../accounting/reports/reports.module.css";

type AuditStatus = "counting" | "review" | "approved" | "cancelled";
type Summary = {
  id: string;
  period: string;
  status: AuditStatus;
  started_at: string;
  approved_at: string | null;
  lines: number;
  counted: number;
  matched: number;
  value_diff: number | null;
};
type Line = {
  id: string;
  item: string;
  unit: string | null;
  sku: string | null;
  barcode: string | null;
  unit_cost: number;
  location: string;
  truck: boolean;
  counted_qty: number | null;
  counted_by: string | null;
  counted_by_me: boolean;
  recount_qty: number | null;
  recounted_by: string | null;
  system_qty: number | null;
  final_qty: number | null;
  variance: number | null;
  needs_recount: boolean;
  reason: string | null;
  note: string | null;
};
type Detail = {
  audit: { id: string; period: string; status: AuditStatus; started_by: string | null; approved_by: string | null };
  lines: Line[];
  in_field: { item: string; unit: string | null; qty: number }[];
};

const REASONS: { value: string; label: string }[] = [
  { value: "damaged", label: "Damaged" },
  { value: "lost", label: "Lost / missing" },
  { value: "found", label: "Found extra" },
  { value: "wrong_entry", label: "Wrong entry earlier" },
  { value: "other", label: "Other" },
];
const STATUS_LABEL: Record<AuditStatus, string> = {
  counting: "Counting",
  review: "Review",
  approved: "Approved",
  cancelled: "Cancelled",
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));
const peso = (n: number) => `${n < 0 ? "−" : ""}₱${Math.abs(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthName = (period: string) => new Date(`${period}T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });

const supabase = createClient();

// Monthly stock count: blind count -> review (recount mismatches, give reasons)
// -> admin approves, which posts adjustments to the stock ledger.
export default function StockAuditPage() {
  const access = useInsightsAccess("inventory");
  const [audits, setAudits] = useState<Summary[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [location, setLocation] = useState("all");
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadList = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("audit_list");
    if (rpcError) return setError(rpcError.message);
    const list = (data || []) as Summary[];
    setAudits(list);
    setOpenId((current) => current ?? list.find((a) => a.status === "counting" || a.status === "review")?.id ?? null);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const { data, error: rpcError } = await supabase.rpc("audit_detail", { p_audit: id });
    if (rpcError) return setError(rpcError.message);
    const d = data as Detail;
    const n = (v: number | null) => (v == null ? null : Number(v));
    setDetail({
      ...d,
      lines: d.lines.map((l) => ({
        ...l,
        unit_cost: Number(l.unit_cost),
        counted_qty: n(l.counted_qty),
        recount_qty: n(l.recount_qty),
        system_qty: n(l.system_qty),
        final_qty: n(l.final_qty),
        variance: n(l.variance),
      })),
    });
  }, []);

  useEffect(() => {
    // Loading data once access is confirmed is a genuine external sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (access.authorized) void loadList();
  }, [access.authorized, loadList]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (openId) void loadDetail(openId);
    else setDetail(null);
  }, [openId, loadDetail]);

  const status = detail?.audit.status;
  const locations = useMemo(() => [...new Set((detail?.lines || []).map((l) => l.location))], [detail]);
  const lines = (detail?.lines || []).filter((l) => location === "all" || l.location === location);
  const counted = (detail?.lines || []).filter((l) => l.counted_qty != null).length;
  const total = detail?.lines.length || 0;
  const varianceLines = (detail?.lines || []).filter((l) => l.variance != null && l.variance !== 0);
  const valueDiff = varianceLines.reduce((sum, l) => sum + (l.variance || 0) * l.unit_cost, 0);

  async function run<T>(work: () => PromiseLike<{ error: { message: string } | null; data?: T }>, message?: string) {
    setBusy(true);
    setError("");
    setNotice("");
    const { error: rpcError, data } = await work();
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return null;
    }
    if (message) setNotice(message);
    return data ?? true;
  }

  async function start() {
    const id = await run(() => supabase.rpc("audit_start"), "Audit started. Count every line — the system numbers stay hidden until you submit.");
    if (typeof id === "string") {
      setOpenId(id);
      void loadList();
    }
  }

  async function count(line: Line, qty: number) {
    if (!Number.isFinite(qty) || qty < 0) return setError("Enter 0 or more.");
    const ok = await run(() => supabase.rpc("audit_count", { p_line: line.id, p_qty: qty }));
    if (ok && openId) {
      setDrafts((d) => ({ ...d, [line.id]: "" }));
      void loadDetail(openId);
    }
  }

  // Each scan adds one to that item's warehouse line (or recount during review).
  async function onScan(code: string) {
    setScanning(false);
    const all = detail?.lines || [];
    // Shelf lines first; a truck line only when the item is not on a shelf.
    const line = findByCode(all.filter((l) => !l.truck), code) ?? findByCode(all, code);
    if (!line) return setError(`No line has the barcode ${code}.`);
    const current = status === "review" ? line.recount_qty ?? 0 : line.counted_qty ?? 0;
    await count(line, current + 1);
    setNotice(`${line.item}: ${fmt(current + 1)}`);
  }

  async function advance(action: "submit" | "approve" | "cancel") {
    const confirmText = {
      submit: "Submit the count for review? Counting closes and the differences will show.",
      approve: "Approve this audit? Every difference is posted to the stock as an adjustment.",
      cancel: "Cancel this audit? The counts are thrown away.",
    }[action];
    if (!window.confirm(confirmText)) return;
    const ok = await run(
      () => supabase.rpc("audit_advance", { p_audit: openId, p_action: action }),
      action === "approve" ? "Audit approved. Stock adjusted." : action === "submit" ? "Submitted. Recount the lines marked ⚠." : "Audit cancelled.",
    );
    if (ok) {
      if (action === "cancel") setOpenId(null);
      else if (openId) void loadDetail(openId);
      void loadList();
    }
  }

  async function setReason(line: Line, reason: string, note: string) {
    const ok = await run(() => supabase.rpc("audit_set_reason", { p_line: line.id, p_reason: reason || null, p_note: note }));
    if (ok && openId) void loadDetail(openId);
  }

  function exportCsv() {
    if (!detail) return;
    const header = ["Location", "Item", "Unit", "System", "Counted", "Recount", "Difference", "Value", "Reason", "Note", "Counted by", "Recounted by"];
    const rows = detail.lines.map((l) => [
      l.location, l.item, l.unit || "", l.system_qty ?? "", l.counted_qty ?? "", l.recount_qty ?? "", l.variance ?? "",
      l.variance != null ? (l.variance * l.unit_cost).toFixed(2) : "", l.reason || "", l.note || "", l.counted_by || "", l.recounted_by || "",
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock-audit-${detail.audit.period.slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!access.authorized) return null;
  const hasOpen = audits.some((a) => a.status === "counting" || a.status === "review");

  return (
    <main className={styles.page}>
      <StaffHeader current="inventory" roles={access.roles} />
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <h1>Stock audit</h1>
            <p>
              Once a month, count everything on the shelves and on every truck. Counting is blind: the system numbers stay hidden until
              you submit. Lines that don&apos;t match are recounted by another person, and an admin approves the result, which corrects
              the stock.
            </p>
          </div>
          {!hasOpen && (
            <button className={styles.btnPrimary} onClick={() => void start()} disabled={busy}>
              Start this month&apos;s audit
            </button>
          )}
        </section>

        {error && <div className={styles.notice} role="alert">{error}</div>}
        {notice && (
          <div className={styles.notice} role="status" style={{ borderColor: "rgba(52,211,153,0.5)" }}>
            {notice}
          </div>
        )}

        {detail && (
          <>
            <div className={styles.cards}>
              <div className={styles.card}>
                <small>{monthName(detail.audit.period)}</small>
                <strong>{STATUS_LABEL[detail.audit.status]}</strong>
              </div>
              <div className={styles.card}>
                <small>Counted</small>
                <strong className={counted === total ? styles.good : undefined}>
                  {counted} / {total}
                </strong>
              </div>
              {status !== "counting" && (
                <>
                  <div className={styles.card}>
                    <small>Lines that differ</small>
                    <strong className={varianceLines.length ? styles.bad : styles.good}>{varianceLines.length}</strong>
                  </div>
                  <div className={styles.card}>
                    <small>Difference in value</small>
                    <strong className={valueDiff < 0 ? styles.bad : styles.good}>{peso(valueDiff)}</strong>
                  </div>
                </>
              )}
            </div>

            <div className={styles.controls}>
              <label className={styles.field}>
                Location
                <select value={location} onChange={(e) => setLocation(e.target.value)}>
                  <option value="all">All locations and trucks</option>
                  {locations.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </label>
              {(status === "counting" || status === "review") && (
                <button className={styles.btn} onClick={() => setScanning(true)}>📷 Scan to count</button>
              )}
              {status === "counting" && (
                <button className={styles.btnPrimary} onClick={() => void advance("submit")} disabled={busy || counted < total}>
                  Submit for review
                </button>
              )}
              {status === "review" && (
                <button className={styles.btnPrimary} onClick={() => void advance("approve")} disabled={busy}>
                  Approve audit
                </button>
              )}
              {(status === "counting" || status === "review") && (
                <button className={styles.btn} onClick={() => void advance("cancel")} disabled={busy}>Cancel audit</button>
              )}
              <button className={styles.btn} onClick={exportCsv}>⬇ CSV</button>
            </div>

            <div className={styles.panel}>
              <h2>{status === "counting" ? "Count (blind)" : status === "review" ? "Review" : "Result"}</h2>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Where</th>
                      {status !== "counting" && <th className={styles.right}>System</th>}
                      <th className={styles.right}>Counted</th>
                      {status !== "counting" && <th className={styles.right}>Recount</th>}
                      {status !== "counting" && <th className={styles.right}>Difference</th>}
                      {status !== "counting" && <th>Reason</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const editCount = status === "counting";
                      const editRecount = status === "review" && l.needs_recount;
                      const needsReason = status === "review" && l.recount_qty != null && l.variance !== 0;
                      return (
                        <tr key={l.id}>
                          <td>
                            {l.item}
                            <div className={styles.muted}>{[l.sku, l.barcode].filter(Boolean).join(" · ")}</div>
                          </td>
                          <td>{l.location}</td>
                          {status !== "counting" && <td className={styles.right}>{l.system_qty == null ? "—" : fmt(l.system_qty)}</td>}
                          <td className={styles.right}>
                            {editCount ? (
                              <QtyInput
                                value={drafts[l.id] ?? (l.counted_qty == null ? "" : String(l.counted_qty))}
                                onChange={(v) => setDrafts((d) => ({ ...d, [l.id]: v }))}
                                onSave={(v) => void count(l, v)}
                                saved={l.counted_qty}
                                label={`Count for ${l.item}`}
                                done={l.counted_qty != null}
                              />
                            ) : (
                              <>
                                {l.counted_qty == null ? "—" : fmt(l.counted_qty)}
                                {l.counted_by && <div className={styles.muted}>{l.counted_by}</div>}
                              </>
                            )}
                          </td>
                          {status !== "counting" && (
                            <td className={styles.right}>
                              {editRecount ? (
                                <QtyInput
                                  value={drafts[l.id] ?? ""}
                                  onChange={(v) => setDrafts((d) => ({ ...d, [l.id]: v }))}
                                  onSave={(v) => void count(l, v)}
                                  saved={l.recount_qty}
                                  label={`Recount for ${l.item}`}
                                  done={false}
                                />
                              ) : l.recount_qty != null ? (
                                <>
                                  {fmt(l.recount_qty)}
                                  {l.recounted_by && <div className={styles.muted}>{l.recounted_by}</div>}
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                          )}
                          {status !== "counting" && (
                            <td className={styles.right}>
                              {l.variance == null || l.variance === 0 ? (
                                <span className={styles.good}>✓</span>
                              ) : (
                                <span className={styles.flag}>
                                  {l.needs_recount ? "⚠ recount " : ""}
                                  {l.variance > 0 ? "+" : ""}
                                  {fmt(l.variance)} ({peso(l.variance * l.unit_cost)})
                                </span>
                              )}
                            </td>
                          )}
                          {status !== "counting" && (
                            <td>
                              {needsReason ? (
                                <ReasonInput line={l} onSave={(r, n) => void setReason(l, r, n)} />
                              ) : (
                                <span className={styles.muted}>
                                  {REASONS.find((r) => r.value === l.reason)?.label || ""}
                                  {l.note ? ` — ${l.note}` : ""}
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {detail.in_field.length > 0 && (
              <div className={styles.panel} style={{ marginTop: 14 }}>
                <h2>Out in the field (not on any shelf)</h2>
                <p className={styles.muted} style={{ padding: "0 16px" }}>
                  Taken for jobs and not back yet. Don&apos;t count these — see Job materials for who has them.
                </p>
                <table>
                  <tbody>
                    {detail.in_field.map((f) => (
                      <tr key={f.item}>
                        <td>{f.item}</td>
                        <td className={styles.right}>
                          {fmt(Number(f.qty))} {f.unit || ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <div className={styles.panel} style={{ marginTop: 14 }}>
          <h2>Past audits</h2>
          {audits.length === 0 ? (
            <div className={styles.empty}>No audits yet. Start the first one above.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Status</th>
                  <th className={styles.right}>Matched</th>
                  <th className={styles.right}>Difference</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {audits.map((a) => (
                  <tr key={a.id}>
                    <td>{monthName(a.period)}</td>
                    <td>{STATUS_LABEL[a.status]}</td>
                    <td className={styles.right}>
                      {a.status === "counting" ? `${a.counted}/${a.lines} counted` : `${a.matched}/${a.lines} (${a.lines ? Math.round((a.matched / a.lines) * 100) : 0}%)`}
                    </td>
                    <td className={styles.right}>{a.value_diff == null ? "—" : peso(Number(a.value_diff))}</td>
                    <td className={styles.right}>
                      <button className={openId === a.id ? styles.tabOn : styles.btn} onClick={() => setOpenId(a.id)}>Open</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {scanning && <BarcodeScanner title="Scan to count" onDetected={(code) => void onScan(code)} onClose={() => setScanning(false)} />}
      </div>
    </main>
  );
}

function QtyInput({
  value,
  onChange,
  onSave,
  saved,
  label,
  done,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: (v: number) => void;
  saved: number | null;
  label: string;
  done: boolean;
}) {
  // Only save a real change, so tabbing through the list does not re-stamp counts.
  const save = () => value.trim() !== "" && Number(value) !== saved && onSave(Number(value));
  return (
    <span className={styles.field} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <input
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        onBlur={save}
        style={{ minWidth: 0, width: 90, borderColor: done ? "rgba(52,211,153,.6)" : undefined }}
      />
      {done && <span aria-label="saved">✓</span>}
    </span>
  );
}

function ReasonInput({ line, onSave }: { line: Line; onSave: (reason: string, note: string) => void }) {
  const [reason, setReason] = useState(line.reason || "");
  const [note, setNote] = useState(line.note || "");
  return (
    <span className={styles.field} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label={`Reason for ${line.item}`} style={{ minWidth: 0 }}>
        <option value="">Reason…</option>
        {REASONS.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" aria-label={`Note for ${line.item}`} style={{ minWidth: 0, width: 140 }} />
      <button className={styles.btn} onClick={() => onSave(reason, note)} disabled={!reason}>Save</button>
    </span>
  );
}
