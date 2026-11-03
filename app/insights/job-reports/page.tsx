"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "../../../lib/supabaseClient";
import { formatDate } from "@/lib/format";
import { signatureImage } from "@/lib/signatureImage";
import { StaffHeader } from "../../components/StaffHeader";
import { useInsightsAccess } from "../useInsightsAccess";
import styles from "../../accounting/reports/reports.module.css";

type Job = {
  id: string;
  client_id: string;
  job_type: string | null;
  status: string;
  technician: string | null;
  problem_description: string;
  resolution: string | null;
  repair_date: string;
  arrived_at: string | null;
  completed_at: string | null;
  customer_signed_at: string | null;
};
type Photo = { id: string; repair_id: string; photo_type: "before" | "after" | "signature"; storage_path: string; created_at: string; url?: string };
type Kind = Photo["photo_type"];

const supabase = createClient();
const BUCKET = "client-media";
const KINDS: [Kind, string][] = [
  ["before", "Before"],
  ["after", "After"],
  ["signature", "Signature"],
];
const isDone = (status: string) => /(complete|resolved|done|fixed)/i.test(status || "");

// Every customer job with its technician report: before and after photos and the
// customer's signature, so the admin can check the work without opening each customer.
export default function JobReportsPage() {
  const access = useInsightsAccess("dispatch");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [days, setDays] = useState(60);
  const [zoom, setZoom] = useState<{ url: string; title: string } | null>(null);

  useEffect(() => {
    if (!access.authorized) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
      const { data: jobRows, error: jobError } = await supabase
        .from("repair_records")
        .select("id, client_id, job_type, status, technician, problem_description, resolution, repair_date, arrived_at, completed_at, customer_signed_at")
        .gte("repair_date", since)
        .order("repair_date", { ascending: false })
        .limit(300);
      if (cancelled) return;
      if (jobError) {
        setError(jobError.message);
        setLoading(false);
        return;
      }
      const list = (jobRows || []) as Job[];
      const ids = list.map((j) => j.id);
      const clientIds = [...new Set(list.map((j) => j.client_id))];
      const [photoRes, clientRes] = await Promise.all([
        ids.length
          ? supabase.from("repair_photos").select("id, repair_id, photo_type, storage_path, created_at").in("repair_id", ids).order("created_at")
          : Promise.resolve({ data: [], error: null }),
        clientIds.length ? supabase.from("clients").select("id, customer_name").in("id", clientIds) : Promise.resolve({ data: [], error: null }),
      ]);
      const rows = (photoRes.data || []) as Photo[];
      const signed = await Promise.all(
        rows.map(async (photo) => {
          const { data } = await supabase.storage.from(BUCKET).createSignedUrl(photo.storage_path, 60 * 60);
          return { ...photo, url: photo.photo_type === "signature" ? await signatureImage(data?.signedUrl) : data?.signedUrl };
        }),
      );
      if (cancelled) return;
      setJobs(list);
      setPhotos(signed);
      setNames(new Map(((clientRes.data || []) as { id: string; customer_name: string | null }[]).map((c) => [c.id, c.customer_name || "Customer"])));
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [access.authorized, days]);

  const all = useMemo(() => {
    return jobs.map((job) => {
        const mine = photos.filter((p) => p.repair_id === job.id);
        const byKind = Object.fromEntries(KINDS.map(([k]) => [k, mine.filter((p) => p.photo_type === k)])) as Record<Kind, Photo[]>;
        const missing = isDone(job.status) ? KINDS.filter(([k]) => byKind[k].length === 0).map(([, label]) => label) : [];
        return { job, byKind, missing };
      });
  }, [jobs, photos]);
  const rows = onlyMissing ? all.filter((r) => r.missing.length > 0) : all;

  const finished = jobs.filter((j) => isDone(j.status)).length;
  const incomplete = all.filter((r) => r.missing.length > 0).length;

  if (access.checking || !access.authorized) return null;

  return (
    <main className={styles.page}>
      <StaffHeader current="insights" roles={access.roles} />
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <h1>Job reports</h1>
            <p>Each customer job with the technician&apos;s before and after photos and the customer&apos;s signature. Click a picture to enlarge it.</p>
          </div>
        </section>

        <div className={styles.controls}>
          <label className={styles.field}>
            Period
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
              <option value={180}>Last 6 months</option>
              <option value={366}>Last year</option>
            </select>
          </label>
          <button className={onlyMissing ? styles.tabOn : styles.tab} onClick={() => setOnlyMissing((v) => !v)}>
            {onlyMissing ? "Showing jobs with missing proof" : "Show only jobs with missing proof"}
          </button>
        </div>

        <div className={styles.cards}>
          <div className={styles.card}>
            <small>Jobs in period</small>
            <strong>{jobs.length}</strong>
          </div>
          <div className={styles.card}>
            <small>Finished</small>
            <strong className={styles.good}>{finished}</strong>
          </div>
          <div className={styles.card}>
            <small>Finished but missing proof</small>
            <strong className={incomplete > 0 ? styles.bad : styles.good}>{loading ? "—" : incomplete}</strong>
          </div>
        </div>

        {error && <div className={styles.notice}>{error}</div>}

        {loading ? (
          <div className={styles.panel}>
            <div className={styles.empty}>Loading job reports…</div>
          </div>
        ) : rows.length === 0 ? (
          <div className={styles.panel}>
            <div className={styles.empty}>{onlyMissing ? "Every finished job has its photos and signature." : "No jobs in this period."}</div>
          </div>
        ) : (
          rows.map(({ job, byKind, missing }) => (
            <div key={job.id} className={styles.panel} style={{ marginBottom: 14 }}>
              <h2>
                <a href={`/clients/${job.client_id}`} className={styles.link}>
                  {names.get(job.client_id) || "Customer"}
                </a>{" "}
                <span className={styles.muted} style={{ fontWeight: 400, fontSize: 13 }}>
                  · {job.job_type === "installation" ? "Installation" : "Repair"} · {job.technician || "No technician"} · {job.status} ·{" "}
                  {formatDate(job.repair_date)}
                </span>
              </h2>
              <p className={styles.muted} style={{ margin: "4px 0 10px" }}>
                {job.problem_description}
                {job.resolution ? ` — Done: ${job.resolution}` : ""}
              </p>
              {missing.length > 0 && <span className={styles.flag}>Missing: {missing.join(", ")}</span>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 10 }}>
                {KINDS.map(([kind, label]) => (
                  <div key={kind}>
                    <small className={styles.muted} style={{ textTransform: "uppercase", letterSpacing: ".12em", fontSize: 12 }}>
                      {label}
                    </small>
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      {byKind[kind].length === 0 ? (
                        <span className={styles.muted} style={{ fontSize: 12 }}>
                          {isDone(job.status) ? "None" : "Not yet"}
                        </span>
                      ) : (
                        byKind[kind].map((p) =>
                          p.url ? (
                            <button
                              key={p.id}
                              onClick={() => setZoom({ url: p.url!, title: `${names.get(job.client_id) || "Customer"} — ${label}` })}
                              style={{ padding: 0, border: "1px solid rgba(120,220,235,.18)", borderRadius: 8, overflow: "hidden", background: "#071116", cursor: "zoom-in", width: 120, height: 90 }}
                              aria-label={`Open ${label}`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={p.url} alt={label} style={{ width: "100%", height: "100%", objectFit: kind === "signature" ? "contain" : "cover" }} />
                            </button>
                          ) : (
                            <span key={p.id} className={styles.muted} style={{ fontSize: 12 }}>
                              Could not load
                            </span>
                          ),
                        )
                      )}
                    </div>
                    {kind === "signature" && byKind.signature.length > 0 && (
                      <small className={styles.muted} style={{ display: "block", marginTop: 4, fontSize: 11 }}>
                        {job.customer_signed_at ? `In the customer's app, ${formatDate(job.customer_signed_at)}` : "On the technician's phone"}
                      </small>
                    )}
                  </div>
                ))}
              </div>
              {(job.arrived_at || job.completed_at) && (
                <small className={styles.muted} style={{ display: "block", marginTop: 10, fontSize: 11 }}>
                  {job.arrived_at ? `Arrived ${new Date(job.arrived_at).toLocaleString()}` : ""}
                  {job.arrived_at && job.completed_at ? " · " : ""}
                  {job.completed_at ? `Finished ${new Date(job.completed_at).toLocaleString()}` : ""}
                </small>
              )}
            </div>
          ))
        )}
      </div>

      {zoom && (
        <div
          role="dialog"
          aria-label={zoom.title}
          onClick={() => setZoom(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", display: "grid", placeItems: "center", zIndex: 50, padding: 16, cursor: "zoom-out" }}
        >
          <figure style={{ margin: 0, maxWidth: "min(1000px, 100%)", textAlign: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={zoom.url} alt={zoom.title} style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 10, background: "#071116" }} />
            <figcaption style={{ color: "#cfe9ee", marginTop: 8, fontSize: 13 }}>{zoom.title} · click anywhere to close</figcaption>
          </figure>
        </div>
      )}
    </main>
  );
}
