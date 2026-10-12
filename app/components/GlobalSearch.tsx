"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { formatPeso } from "@/lib/format";
import styles from "./global-search.module.css";

type Hit = { key: string; group: string; title: string; detail: string; href: string };

// PostgREST filters use commas and brackets as separators, so keep them out of the text.
const clean = (text: string) => text.replace(/[,()%*\\"']/g, " ").trim();

// One search box for every staff page: customers, payments and jobs.
export function GlobalSearch({ roles }: { roles: string[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [text, setText] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const accountingOnly =
    roles.includes("accounting") && !["admin", "technician", "inventory"].some((role) => roles.includes(role));
  const seesMoney = roles.includes("admin") || roles.includes("accounting");
  const seesJobs = !accountingOnly;

  useEffect(() => {
    const q = clean(text);
    if (q.length < 2) return undefined;
    let active = true;
    const timer = setTimeout(async () => {
      setBusy(true);
      const like = `%${q}%`;
      const [clients, receipts, submissions, jobs] = await Promise.all([
        supabase
          .from("clients")
          .select("id, customer_name, account_id, mobile_number, plan_name")
          .or(`customer_name.ilike.${like},account_id.ilike.${like},mobile_number.ilike.${like},email.ilike.${like}`)
          .limit(6),
        seesMoney
          ? supabase.from("payments").select("id, client_id, receipt_number, amount_paid").ilike("receipt_number", like).limit(4)
          : Promise.resolve({ data: [] as { id: string; client_id: string | null; receipt_number: string | null; amount_paid: number | null }[] }),
        seesMoney
          ? supabase
              .from("payment_submissions")
              .select("id, client_id, reference_number, amount_claimed, status")
              .ilike("reference_number", like)
              .limit(4)
          : Promise.resolve({ data: [] as { id: string; client_id: string | null; reference_number: string | null; amount_claimed: number | null; status: string | null }[] }),
        seesJobs
          ? supabase
              .from("repair_records")
              .select("id, client_id, problem_description, status, technician")
              .or(`problem_description.ilike.${like},technician.ilike.${like}`)
              .limit(4)
          : Promise.resolve({ data: [] as { id: string; client_id: string | null; problem_description: string | null; status: string | null; technician: string | null }[] }),
      ]);
      if (!active) return;

      // Names for the payments and jobs that only carry a customer id.
      const ids = new Set<string>();
      for (const row of [...(receipts.data || []), ...(submissions.data || []), ...(jobs.data || [])]) {
        if (row.client_id) ids.add(row.client_id);
      }
      const names = new Map<string, string>();
      if (ids.size) {
        const { data } = await supabase.from("clients").select("id, customer_name").in("id", [...ids]);
        for (const row of data || []) names.set(row.id, row.customer_name || "Customer");
      }
      if (!active) return;

      const customerHref = (id: string) => (accountingOnly ? `/accounting/${id}` : `/clients/${id}`);
      const next: Hit[] = [];
      for (const c of clients.data || []) {
        next.push({
          key: `c-${c.id}`,
          group: "Customers",
          title: c.customer_name || "Unnamed customer",
          detail: [c.account_id, c.mobile_number, c.plan_name].filter(Boolean).join(" · "),
          href: customerHref(c.id),
        });
      }
      for (const p of receipts.data || []) {
        next.push({
          key: `r-${p.id}`,
          group: "Payments",
          title: `Receipt ${p.receipt_number}`,
          detail: `${names.get(p.client_id || "") || "Customer"} · ${formatPeso(Number(p.amount_paid || 0))}`,
          href: `/accounting/receipt/${p.id}`,
        });
      }
      for (const s of submissions.data || []) {
        next.push({
          key: `s-${s.id}`,
          group: "Payments",
          title: `Ref ${s.reference_number}`,
          detail: `${names.get(s.client_id || "") || "Customer"} · ${formatPeso(Number(s.amount_claimed || 0))} · ${s.status || ""}`,
          href: "/accounting/verification",
        });
      }
      for (const j of jobs.data || []) {
        next.push({
          key: `j-${j.id}`,
          group: "Jobs",
          title: j.problem_description || "Job",
          detail: `${names.get(j.client_id || "") || "Customer"} · ${j.status || ""}${j.technician ? ` · ${j.technician}` : ""}`,
          href: j.client_id ? `/clients/${j.client_id}` : "/clients",
        });
      }
      setHits(next);
      setBusy(false);
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [text, supabase, seesMoney, seesJobs, accountingOnly]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const shown = clean(text).length >= 2 ? hits : [];
  const groups = ["Customers", "Payments", "Jobs"].filter((g) => shown.some((h) => h.group === g));

  return (
    <div className={styles.wrap} ref={box}>
      <input
        className={styles.input}
        type="search"
        value={text}
        placeholder={seesMoney ? "Search customer, receipt, reference…" : "Search customer or job…"}
        aria-label="Search"
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && clean(text).length >= 2 && (
        <div className={styles.panel} role="listbox">
          {busy && shown.length === 0 ? <p className={styles.note}>Searching…</p> : null}
          {!busy && shown.length === 0 ? <p className={styles.note}>Nothing found.</p> : null}
          {groups.map((group) => (
            <div key={group}>
              <div className={styles.group}>{group}</div>
              {shown
                .filter((h) => h.group === group)
                .map((hit) => (
                  <Link key={hit.key} href={hit.href} className={styles.hit} onClick={() => setOpen(false)}>
                    <strong>{hit.title}</strong>
                    <span>{hit.detail}</span>
                  </Link>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
