"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabaseClient";
import { formatDate } from "@/lib/format";
import { StaffHeader } from "../components/StaffHeader";
import { PkcLoader } from "../components/PkcLoader";
import { notifyBadgesChanged } from "../components/LiveBadge";
import styles from "./ratings.module.css";

type Rating = {
  id: string;
  client_id: string;
  kind: "technician" | "service";
  technician_name: string | null;
  stars: number;
  comment: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type Filter = "all" | "low" | "todo" | "technician" | "service";

const supabase = createClient();

function Stars({ value }: { value: number }) {
  return (
    <span className={styles.stars} aria-label={`${value} out of 5 stars`}>
      {"★".repeat(value)}
      <span className={styles.starsOff}>{"★".repeat(5 - value)}</span>
    </span>
  );
}

const average = (rows: Rating[]) => (rows.length ? rows.reduce((sum, r) => sum + r.stars, 0) / rows.length : 0);

export default function RatingsPage() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [staffRoles, setStaffRoles] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [ratings, setRatings] = useState<Rating[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);

    try {
      const result = await supabase
        .from("ratings")
        .select("id, client_id, kind, technician_name, stars, comment, reviewed_at, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (result.error) throw new Error(result.error.message);
      const rows = (result.data || []) as Rating[];
      setRatings(rows);

      const clientIds = [...new Set(rows.map((r) => r.client_id))];
      if (clientIds.length) {
        const clients = await supabase.from("clients").select("id, customer_name").in("id", clientIds);
        if (clients.error) throw new Error(clients.error.message);
        setNames(new Map((clients.data || []).map((c) => [c.id as string, (c.customer_name as string) || "Customer"])));
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load ratings.");
    } finally {
      setLoading(false);
      setRefreshing(false);
      notifyBadgesChanged();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function checkAccess() {
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;
      if (error || !data.session) {
        router.replace("/login");
        return;
      }
      const { data: memberships, error: membershipError } = await supabase
        .from("tenant_users")
        .select("role")
        .eq("user_id", data.session.user.id);
      if (cancelled) return;
      const roles = (memberships || []).map((item) => item.role);
      if (membershipError || (!roles.includes("admin") && !roles.includes("accounting"))) {
        router.replace("/clients");
        return;
      }
      setStaffRoles(roles.filter((role): role is string => Boolean(role)));
      setAuthorized(true);
      setCheckingAccess(false);
    }
    void checkAccess();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    // Loading data once access is confirmed is a genuine external sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (authorized) void load();
  }, [authorized, load]);

  const stats = useMemo(() => {
    const dist = [0, 0, 0, 0, 0];
    for (const r of ratings) dist[r.stars - 1] += 1;

    const byTech = new Map<string, Rating[]>();
    for (const r of ratings) {
      if (r.kind !== "technician" || !r.technician_name) continue;
      byTech.set(r.technician_name, [...(byTech.get(r.technician_name) || []), r]);
    }
    const techs = [...byTech.entries()]
      .map(([name, rows]) => ({ name, count: rows.length, avg: average(rows) }))
      .sort((a, b) => b.avg - a.avg || b.count - a.count);

    return {
      avg: average(ratings),
      dist,
      techs,
      low: ratings.filter((r) => r.stars <= 2).length,
      todo: ratings.filter((r) => r.stars <= 2 && !r.reviewed_at).length,
    };
  }, [ratings]);

  const visible = useMemo(
    () =>
      ratings.filter((r) => {
        if (filter === "low") return r.stars <= 2;
        if (filter === "todo") return r.stars <= 2 && !r.reviewed_at;
        if (filter === "technician" || filter === "service") return r.kind === filter;
        return true;
      }),
    [ratings, filter],
  );

  async function markReviewed(id: string) {
    setBusyId(id);
    const { error } = await supabase.rpc("review_rating", { p_id: id });
    setBusyId(null);
    if (error) {
      setLoadError(error.message);
      return;
    }
    void load(true);
  }

  if (checkingAccess || (authorized && loading)) return <PkcLoader />;
  if (!authorized) return null;

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: ratings.length },
    { key: "todo", label: "To review", count: stats.todo },
    { key: "low", label: "Low (1-2★)", count: stats.low },
    { key: "technician", label: "Technician", count: ratings.filter((r) => r.kind === "technician").length },
    { key: "service", label: "Service", count: ratings.filter((r) => r.kind === "service").length },
  ];

  return (
    <main className={styles.page}>
      <StaffHeader current="ratings" roles={staffRoles} />

      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <h1>Customer ratings</h1>
            <p>
              What customers think of completed jobs and of the service overall. Low ratings (1-2 stars) show a red count
              on the menu until someone marks them reviewed.
            </p>
          </div>
          <button className={styles.btn} onClick={() => void load(true)} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
        </section>

        {loadError && (
          <div className={styles.notice} role="alert">
            {loadError}
          </div>
        )}

        <section className={styles.summary}>
          <div className={styles.panel}>
            <h2>Overall</h2>
            <div className={styles.big}>{ratings.length ? stats.avg.toFixed(1) : "—"}</div>
            <div className={styles.bigSub}>
              {ratings.length ? <Stars value={Math.round(stats.avg)} /> : null} {ratings.length} rating
              {ratings.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className={styles.panel}>
            <h2>Breakdown</h2>
            <div className={styles.bars}>
              {[5, 4, 3, 2, 1].map((n) => (
                <div key={n} className={styles.barRow}>
                  <span>{n} ★</span>
                  <div className={styles.barTrack}>
                    <div
                      className={n <= 2 ? styles.barFillLow : styles.barFill}
                      style={{ width: `${ratings.length ? (stats.dist[n - 1] / ratings.length) * 100 : 0}%` }}
                    />
                  </div>
                  <span>{stats.dist[n - 1]}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {stats.techs.length > 0 && (
          <section className={`${styles.panel} ${styles.techs}`}>
            <h2>Technicians</h2>
            {stats.techs.map((t) => (
              <div key={t.name} className={styles.techRow}>
                <span>
                  {t.name}
                  <small>
                    {t.count} job{t.count === 1 ? "" : "s"}
                  </small>
                </span>
                <span>
                  <Stars value={Math.round(t.avg)} /> {t.avg.toFixed(1)}
                </span>
              </div>
            ))}
          </section>
        )}

        <div className={styles.tabs} role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={filter === tab.key}
              className={filter === tab.key ? styles.tabActive : styles.tab}
              onClick={() => setFilter(tab.key)}
            >
              {tab.label} <span>{tab.count}</span>
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className={styles.empty}>
            {ratings.length === 0 ? "No ratings yet. Customers can rate from the mobile app." : "Nothing to show here."}
          </div>
        ) : (
          <div className={styles.list}>
            {visible.map((r) => {
              const low = r.stars <= 2;
              return (
                <article key={r.id} className={`${styles.card} ${low ? styles.cardLow : ""}`}>
                  <div className={styles.cardTop}>
                    <div>
                      <strong>{names.get(r.client_id) || "Customer"}</strong>
                      <small>
                        {r.kind === "technician" ? `Job by ${r.technician_name || "technician"}` : "Overall service"}
                      </small>
                    </div>
                    <Stars value={r.stars} />
                  </div>

                  {r.comment ? <p className={styles.comment}>{r.comment}</p> : <p className={styles.noComment}>No comment.</p>}

                  <div className={styles.cardFoot}>
                    <span>{formatDate(r.created_at)}</span>
                    {low ? (
                      r.reviewed_at ? (
                        <span className={styles.reviewed}>✓ Reviewed {formatDate(r.reviewed_at)}</span>
                      ) : (
                        <button className={styles.btn} disabled={busyId === r.id} onClick={() => void markReviewed(r.id)}>
                          {busyId === r.id ? "Saving…" : "Mark reviewed"}
                        </button>
                      )
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
