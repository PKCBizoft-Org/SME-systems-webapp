"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "../../../lib/supabaseClient";
import { StaffHeader } from "../../components/StaffHeader";
import { useInsightsAccess } from "../useInsightsAccess";
import styles from "../../accounting/reports/reports.module.css";

type Job = {
  id: string;
  tenant_id: string;
  title: string;
  job_type: "repair" | "new_installation";
  area: string | null;
  landmark: string | null;
  description: string | null;
  status: "open" | "assigned" | "in_progress" | "done" | "cancelled";
  technician_user_id: string | null;
  resolution: string | null;
  before_photo_path: string | null;
  after_photo_path: string | null;
  created_at: string;
  completed_at: string | null;
};
type Tech = { user_id: string; name: string };

const STATUS_LABEL: Record<Job["status"], string> = {
  open: "Open",
  assigned: "Assigned",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};
const TYPE_LABEL: Record<Job["job_type"], string> = { repair: "Repair", new_installation: "New install" };

const supabase = createClient();

// Backbone (infrastructure) jobs: work on the network itself, with no customer.
// Admins create and assign them here; technicians can also start one in the app.
export default function BackbonePage() {
  const access = useInsightsAccess("dispatch");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [filter, setFilter] = useState<"active" | "done" | "all">("active");
  const [form, setForm] = useState({ title: "", job_type: "repair", area: "", landmark: "", description: "", tech: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [photos, setPhotos] = useState<{ job: Job; before?: string; after?: string } | null>(null);

  const load = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession();
    const uid = session.session?.user.id;
    const [jobsRes, memberRes, overviewRes] = await Promise.all([
      supabase.from("backbone_jobs").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("tenant_users").select("tenant_id, role").eq("user_id", uid || ""),
      supabase.rpc("truck_overview"),
    ]);
    if (jobsRes.error) {
      setError(jobsRes.error.message);
      return;
    }
    setJobs((jobsRes.data || []) as Job[]);
    const admin = (memberRes.data || []).find((m) => m.role === "admin");
    setTenantId(admin?.tenant_id || "");
    if (!overviewRes.error) setTechs(((overviewRes.data as { technicians: Tech[] })?.technicians || []) as Tech[]);
  }, []);

  useEffect(() => {
    // Loading data once access is confirmed is a genuine external sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (access.authorized) void load();
  }, [access.authorized, load]);

  const techName = useMemo(() => new Map(techs.map((t) => [t.user_id, t.name])), [techs]);
  const visible = jobs.filter((j) =>
    filter === "all" ? true : filter === "done" ? j.status === "done" || j.status === "cancelled" : j.status !== "done" && j.status !== "cancelled",
  );
  const counts = {
    open: jobs.filter((j) => j.status === "open").length,
    active: jobs.filter((j) => j.status === "assigned" || j.status === "in_progress").length,
    done: jobs.filter((j) => j.status === "done").length,
  };

  async function create() {
    setError("");
    setNotice("");
    if (!tenantId) return setError("Only an admin can create backbone jobs.");
    if (form.title.trim().length < 3) return setError("Give the job a short title, e.g. “Fiber cut at Purok 5 pole”.");
    setBusy(true);
    const { error: insertError } = await supabase.from("backbone_jobs").insert({
      tenant_id: tenantId,
      title: form.title.trim(),
      job_type: form.job_type,
      area: form.area.trim() || null,
      landmark: form.landmark.trim() || null,
      description: form.description.trim() || null,
      technician_user_id: form.tech || null,
    });
    setBusy(false);
    if (insertError) return setError(insertError.message);
    setForm({ title: "", job_type: "repair", area: "", landmark: "", description: "", tech: "" });
    setNotice(form.tech ? "Job created and the technician was notified." : "Job created. Any technician can take it in the app.");
    void load();
  }

  async function update(job: Job, patch: Partial<Job>, message: string) {
    setError("");
    setNotice("");
    const { error: updateError } = await supabase.from("backbone_jobs").update(patch).eq("id", job.id);
    if (updateError) return setError(updateError.message);
    setNotice(message);
    void load();
  }

  async function showPhotos(job: Job) {
    const sign = async (path: string | null) =>
      path ? (await supabase.storage.from("backbone-photos").createSignedUrl(path, 600)).data?.signedUrl : undefined;
    setPhotos({ job, before: await sign(job.before_photo_path), after: await sign(job.after_photo_path) });
  }

  if (!access.authorized) return null;

  return (
    <main className={styles.page}>
      <StaffHeader current="insights" roles={access.roles} />
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <h1>Backbone jobs</h1>
            <p>
              Work on the network itself — fiber lines, poles, splitters — with no customer attached. Technicians take materials for these
              jobs and declare what they used, the same as customer jobs.
            </p>
          </div>
        </section>

        <div className={styles.cards}>
          <div className={styles.card}>
            <small>Waiting for a technician</small>
            <strong className={counts.open > 0 ? styles.bad : styles.good}>{counts.open}</strong>
          </div>
          <div className={styles.card}>
            <small>Assigned / in progress</small>
            <strong>{counts.active}</strong>
          </div>
          <div className={styles.card}>
            <small>Done</small>
            <strong className={styles.good}>{counts.done}</strong>
          </div>
        </div>

        {error && <div className={styles.notice} role="alert">{error}</div>}
        {notice && (
          <div className={styles.notice} role="status" style={{ borderColor: "rgba(52,211,153,0.5)" }}>
            {notice}
          </div>
        )}

        <div className={styles.split}>
          <div className={styles.panel}>
            <h2>New backbone job</h2>
            <div style={{ padding: 16, display: "grid", gap: 12 }}>
              <label className={styles.field}>
                Title
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Fiber cut near the plaza" maxLength={120} />
              </label>
              <div className={styles.controls} style={{ marginBottom: 0 }}>
                <label className={styles.field}>
                  Type
                  <select value={form.job_type} onChange={(e) => setForm({ ...form, job_type: e.target.value })}>
                    <option value="repair">Repair</option>
                    <option value="new_installation">New install (new line / NAP box)</option>
                  </select>
                </label>
                <label className={styles.field}>
                  Technician (optional)
                  <select value={form.tech} onChange={(e) => setForm({ ...form, tech: e.target.value })}>
                    <option value="">Let any technician take it</option>
                    {techs.map((t) => (
                      <option key={t.user_id} value={t.user_id}>{t.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={styles.controls} style={{ marginBottom: 0 }}>
                <label className={styles.field}>
                  Area
                  <input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Purok 5, Visayan Village" />
                </label>
                <label className={styles.field}>
                  Landmark
                  <input value={form.landmark} onChange={(e) => setForm({ ...form, landmark: e.target.value })} placeholder="Pole beside the chapel" />
                </label>
              </div>
              <label className={styles.field}>
                Details
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What is wrong / what to build" />
              </label>
              <div>
                <button className={styles.btnPrimary} onClick={() => void create()} disabled={busy}>
                  {busy ? "Saving…" : "Create job"}
                </button>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <h2>Jobs</h2>
            <div className={styles.tabs} style={{ padding: "12px 16px 0" }}>
              {(["active", "done", "all"] as const).map((f) => (
                <button key={f} className={filter === f ? styles.tabOn : styles.tab} onClick={() => setFilter(f)}>
                  {f === "active" ? "Active" : f === "done" ? "Closed" : "All"}
                </button>
              ))}
            </div>
            {visible.length === 0 ? (
              <div className={styles.empty}>No backbone jobs here.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Status</th>
                      <th>Technician</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((j) => (
                      <tr key={j.id}>
                        <td>
                          <strong>{j.title}</strong>
                          <div className={styles.muted}>
                            {TYPE_LABEL[j.job_type]}
                            {j.area ? ` · ${j.area}` : ""}
                            {j.landmark ? ` · ${j.landmark}` : ""}
                            {" · "}
                            {new Date(j.created_at).toLocaleDateString()}
                          </div>
                          {j.resolution && <div className={styles.muted}>Done: {j.resolution}</div>}
                        </td>
                        <td>{j.status === "open" ? <span className={styles.flag}>Open</span> : STATUS_LABEL[j.status]}</td>
                        <td>
                          {j.status === "done" || j.status === "cancelled" ? (
                            techName.get(j.technician_user_id || "") || "—"
                          ) : (
                            <label className={styles.field}>
                              <select
                                value={j.technician_user_id || ""}
                                aria-label={`Technician for ${j.title}`}
                                onChange={(e) =>
                                  void update(
                                    j,
                                    { technician_user_id: e.target.value || null, status: e.target.value ? j.status === "open" ? "assigned" : j.status : "open" },
                                    e.target.value ? "Technician assigned and notified." : "Job is open again.",
                                  )
                                }
                              >
                                <option value="">Unassigned</option>
                                {techs.map((t) => (
                                  <option key={t.user_id} value={t.user_id}>{t.name}</option>
                                ))}
                              </select>
                            </label>
                          )}
                        </td>
                        <td className={styles.right}>
                          {j.status === "done" && (j.before_photo_path || j.after_photo_path) && (
                            <button className={styles.btn} onClick={() => void showPhotos(j)}>Photos</button>
                          )}
                          {j.status !== "done" && j.status !== "cancelled" && (
                            <button
                              className={styles.btn}
                              onClick={() => window.confirm(`Cancel “${j.title}”?`) && void update(j, { status: "cancelled" }, "Job cancelled.")}
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {photos && (
          <div className={styles.panel} style={{ marginTop: 16 }}>
            <h2>
              Photos — {photos.job.title}{" "}
              <button className={styles.btn} onClick={() => setPhotos(null)} style={{ marginLeft: 8 }}>Close</button>
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, padding: 16 }}>
              {(["before", "after"] as const).map((k) =>
                photos[k] ? (
                  <figure key={k} style={{ margin: 0 }}>
                    <figcaption className={styles.muted}>{k === "before" ? "Before" : "After"}</figcaption>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photos[k]} alt={`${k} photo`} style={{ width: "100%", borderRadius: 10 }} />
                  </figure>
                ) : null,
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
