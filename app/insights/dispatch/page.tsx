"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "../../../lib/supabaseClient";
import { StaffHeader } from "../../components/StaffHeader";
import { PkcLoader } from "../../components/PkcLoader";
import { useInsightsAccess } from "../useInsightsAccess";
import styles from "../../accounting/reports/reports.module.css";

type Job = {
  id: string;
  customer_name: string | null;
  account_id: string | null;
  area: string | null;
  job_type: string | null;
  problem: string | null;
  status: string | null;
  created_at: string;
  technician_user_id: string | null;
  technician_name: string | null;
  accepted_at: string | null;
  arrived_at: string | null;
  latitude: number | null;
  longitude: number | null;
};

type Tech = {
  user_id: string;
  name: string;
  phone: string | null;
  active_jobs: number;
  latitude: number | null;
  longitude: number | null;
  location_at: string | null;
};

type View = "unassigned" | "active" | "all";

const supabase = createClient();
const MAX_ACTIVE = 3;
const REFRESH_MS = 30_000;

function km(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function ago(iso: string | null, now: number) {
  if (!iso) return "—";
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

export default function DispatchPage() {
  const access = useInsightsAccess("dispatch");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [view, setView] = useState<View>("unassigned");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const { data, error: rpcError } = await supabase.rpc("dispatch_board");
    if (rpcError) setError(rpcError.message);
    else {
      setError("");
      const board = data as { jobs: Job[]; technicians: Tech[] };
      setJobs(board.jobs || []);
      setTechs(board.technicians || []);
      setNow(Date.now());
    }
    if (!quiet) setLoading(false);
  }, []);

  useEffect(() => {
    if (!access.authorized) return undefined;
    // Loading data once access is confirmed is a genuine external sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = setInterval(() => void load(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [access.authorized, load]);

  async function assign(job: Job, technicianId: string) {
    setBusyId(job.id);
    setError("");
    setNotice("");
    const { error: rpcError } = await supabase.rpc("dispatch_assign", {
      p_repair_id: job.id,
      p_technician: technicianId || null,
    });
    setBusyId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    const name = techs.find((t) => t.user_id === technicianId)?.name;
    setNotice(technicianId ? `${job.customer_name || "Job"} was given to ${name || "the technician"}.` : `${job.customer_name || "Job"} is unassigned again.`);
    await load(true);
  }

  const nearest = useCallback(
    (job: Job) => {
      if (job.latitude == null || job.longitude == null) return null;
      const here = { latitude: job.latitude, longitude: job.longitude };
      let best: { tech: Tech; distance: number } | null = null;
      for (const tech of techs) {
        if (tech.latitude == null || tech.longitude == null || tech.active_jobs >= MAX_ACTIVE) continue;
        const distance = km(here, { latitude: tech.latitude, longitude: tech.longitude });
        if (!best || distance < best.distance) best = { tech, distance };
      }
      return best;
    },
    [techs],
  );

  const visible = useMemo(() => {
    if (view === "unassigned") return jobs.filter((j) => !j.technician_user_id);
    if (view === "active") return jobs.filter((j) => !!j.technician_user_id);
    return jobs;
  }, [jobs, view]);

  if (access.checking) return <PkcLoader label="Opening dispatch" steps={["Verifying your role", "Loading jobs"]} />;
  if (!access.authorized) return null;

  const unassigned = jobs.filter((j) => !j.technician_user_id).length;

  return (
    <main className={styles.page}>
      <StaffHeader current="insights" roles={access.roles} />
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <h1>Dispatch board</h1>
            <p>
              Every open job and every technician in one place. Pick a technician to assign or reassign a job; they and the customer are
              told right away. The board refreshes by itself every 30 seconds.
            </p>
          </div>
          <button className={styles.btn} onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
        </section>


        <div className={styles.cards}>
          <div className={styles.card}>
            <small>Waiting for a technician</small>
            <strong className={unassigned > 0 ? styles.bad : styles.good}>{unassigned}</strong>
          </div>
          <div className={styles.card}>
            <small>In progress</small>
            <strong>{jobs.length - unassigned}</strong>
          </div>
          <div className={styles.card}>
            <small>Technicians</small>
            <strong>{techs.length}</strong>
            <span className={styles.muted}>{techs.filter((t) => t.active_jobs < MAX_ACTIVE).length} can take another job</span>
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

        <div className={styles.tabs} role="tablist">
          {(
            [
              ["unassigned", `Waiting (${unassigned})`],
              ["active", `Assigned (${jobs.length - unassigned})`],
              ["all", `All (${jobs.length})`],
            ] as [View, string][]
          ).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={view === key} className={view === key ? styles.tabOn : styles.tab} onClick={() => setView(key)}>
              {label}
            </button>
          ))}
        </div>

        <div className={styles.stack}>
          <div className={styles.panel}>
            <h2>Jobs</h2>
            {visible.length === 0 ? (
              <div className={styles.empty}>{loading ? "Loading…" : "No jobs here."}</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Waiting</th>
                    <th>Customer</th>
                    <th>Problem</th>
                    <th>Status</th>
                    <th>Technician</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((job) => {
                    const close = !job.technician_user_id ? nearest(job) : null;
                    return (
                      <tr key={job.id}>
                        <td>{ago(job.created_at, now)}</td>
                        <td>
                          {job.customer_name || "—"}
                          <br />
                          <span className={styles.muted}>
                            {job.area || "No area"}
                            {job.latitude != null && job.longitude != null ? (
                              <>
                                {" · "}
                                <a
                                  href={`https://www.google.com/maps?q=${job.latitude},${job.longitude}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ color: "#4ce8ff" }}
                                >
                                  map
                                </a>
                              </>
                            ) : null}
                          </span>
                        </td>
                        <td className={styles.wrap}>
                          {job.job_type === "installation" ? <strong>Installation · </strong> : null}
                          {job.problem || "—"}
                        </td>
                        <td>
                          {job.status || "—"}
                          {job.arrived_at ? (
                            <>
                              <br />
                              <span className={styles.good}>arrived {ago(job.arrived_at, now)}</span>
                            </>
                          ) : null}
                        </td>
                        <td>
                          <select
                            aria-label={`Technician for ${job.customer_name || "this job"}`}
                            value={job.technician_user_id || ""}
                            disabled={busyId === job.id}
                            onChange={(e) => void assign(job, e.target.value)}
                            style={{
                              padding: "7px 9px",
                              borderRadius: 8,
                              border: "1px solid rgba(76,232,255,0.25)",
                              background: "rgba(3,12,17,0.8)",
                              color: "#eaf7ff",
                              font: "inherit",
                              fontSize: 13,
                            }}
                          >
                            <option value="">Unassigned</option>
                            {techs.map((tech) => (
                              <option
                                key={tech.user_id}
                                value={tech.user_id}
                                disabled={tech.active_jobs >= MAX_ACTIVE && tech.user_id !== job.technician_user_id}
                              >
                                {tech.name} ({tech.active_jobs}/{MAX_ACTIVE})
                              </option>
                            ))}
                          </select>
                          {close ? (
                            <div className={styles.muted} style={{ marginTop: 4 }}>
                              Closest free: {close.tech.name}, {close.distance.toFixed(1)} km
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className={styles.panel}>
            <h2>Technicians</h2>
            {techs.length === 0 ? (
              <div className={styles.empty}>No technicians yet.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className={styles.right}>Active jobs</th>
                    <th>Last seen</th>
                    <th>Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {techs.map((tech) => (
                    <tr key={tech.user_id}>
                      <td>{tech.name}</td>
                      <td className={`${styles.right} ${tech.active_jobs >= MAX_ACTIVE ? styles.bad : ""}`}>
                        {tech.active_jobs} / {MAX_ACTIVE}
                      </td>
                      <td>
                        {tech.latitude != null && tech.longitude != null ? (
                          <a
                            href={`https://www.google.com/maps?q=${tech.latitude},${tech.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "#4ce8ff" }}
                          >
                            {ago(tech.location_at, now)}
                          </a>
                        ) : (
                          <span className={styles.muted}>no position yet</span>
                        )}
                      </td>
                      <td>{tech.phone || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <p className={styles.muted}>
          A technician can hold at most {MAX_ACTIVE} unfinished jobs. Distances are straight-line and use the technician&apos;s last shared
          position, so they are a guide, not a route.
        </p>
      </div>
    </main>
  );
}
