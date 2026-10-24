"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { createClient } from "../../../lib/supabaseClient";
import { StaffHeader } from "../../components/StaffHeader";
import { PkcLoader } from "../../components/PkcLoader";
import { useInsightsAccess } from "../useInsightsAccess";
import styles from "../map/map.module.css";

type Area = {
  area: string;
  households: number;
  verified: number;
  paid: number;
  referred: number;
  score: number;
  installed: number;
  lat: number | null;
  lng: number | null;
  confidence: "high" | "medium" | "low";
};
type Point = { lat: number; lng: number; area: string; paid: boolean; verified: boolean; referred: boolean };
type Planner = { areas: Area[]; points: Point[]; served: { lat: number; lng: number }[] };

const supabase = createClient();
const PH_CENTER: [number, number] = [12.8, 121.8];
const CONFIDENCE = {
  high: { color: "#36e0a1", label: "High" },
  medium: { color: "#ffc857", label: "Medium" },
  low: { color: "#8fa8b8", label: "Low" },
};

export default function ExpansionPlannerPage() {
  const router = useRouter();
  const access = useInsightsAccess("users");
  const isAdmin = access.roles.includes("admin");
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [data, setData] = useState<Planner | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (access.authorized && !isAdmin) router.replace("/clients");
  }, [access.authorized, isAdmin, router]);

  useEffect(() => {
    if (!access.authorized || !isAdmin) return;
    let cancelled = false;
    void supabase.rpc("expansion_planner").then(({ data: result, error: rpcError }) => {
      if (cancelled) return;
      if (rpcError) setError(rpcError.message);
      else setData(result as Planner);
    });
    return () => {
      cancelled = true;
    };
  }, [access.authorized, isAdmin]);

  useEffect(() => {
    if (!data || !mapEl.current || mapRef.current) return;
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !mapEl.current) return;
      const map = L.map(mapEl.current).setView(PH_CENTER, 6);
      mapRef.current = map;
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
        subdomains: "abcd",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      }).addTo(map);

      const all: [number, number][] = [];
      for (const s of data.served) {
        all.push([s.lat, s.lng]);
        L.circleMarker([s.lat, s.lng], { radius: 4, color: "#00e5ff", fillColor: "#00e5ff", fillOpacity: 0.6, weight: 1 })
          .bindTooltip("Existing customer")
          .addTo(map);
      }
      for (const a of data.areas) {
        if (a.lat == null || a.lng == null) continue;
        const c = CONFIDENCE[a.confidence];
        L.circle([a.lat, a.lng], {
          radius: 120 + a.score * 40,
          color: c.color,
          fillColor: c.color,
          fillOpacity: 0.12,
          weight: 1,
          dashArray: "4 4",
        })
          .bindTooltip(`<strong>${escapeHtml(a.area)}</strong><br/>Score ${a.score} · ${c.label} confidence`)
          .addTo(map);
      }
      for (const p of data.points) {
        all.push([p.lat, p.lng]);
        const color = p.paid ? "#36e0a1" : p.verified ? "#ffc857" : "#8fa8b8";
        const notes = [p.paid ? "paid installation fee" : null, p.verified ? "verified email" : "email not verified", p.referred ? "referred by a customer" : null]
          .filter(Boolean)
          .join(", ");
        L.circleMarker([p.lat, p.lng], { radius: 6, color, fillColor: color, fillOpacity: 0.85, weight: 2, className: styles.dot })
          .bindTooltip(`Wants internet · ${escapeHtml(p.area)}<br/>${notes}`)
          .addTo(map);
      }
      if (all.length > 0) map.fitBounds(L.latLngBounds(all).pad(0.4), { maxZoom: 16 });
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [data]);

  if (access.checking || (access.authorized && !isAdmin)) {
    return <PkcLoader label="Opening expansion planner" steps={["Verifying your role", "Loading demand"]} />;
  }
  if (!access.authorized) return null;

  const areas = data?.areas || [];

  return (
    <main className={styles.page}>
      <StaffHeader current="insights" roles={access.roles} />
      <div className={styles.shell}>
        <header className={styles.hud}>
          <div className={styles.titleBlock}>
            <span className={styles.live} style={{ color: "#ffc857" }}>
              ADMIN ONLY
            </span>
            <h1>Expansion planner</h1>
          </div>
        </header>

        <p style={{ color: "#8fa8b8", fontSize: 14, lineHeight: 1.6, maxWidth: 820, margin: "0 0 14px" }}>
          Where people are asking for PKC but are not installed yet. Each household counts once (same app account or the same spot on
          the map). Score per household: 1, plus 1 for a verified email, plus 2 if they paid the installation fee, times 1.5 if an
          existing customer referred them, and lower when their last request is old. Green dots paid, yellow verified, grey unverified.
        </p>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.mapWrap}>
          <div ref={mapEl} className={styles.map} style={{ height: "min(58vh, 620px)" }} />
        </div>

        <div className={styles.mapWrap} style={{ marginTop: 16, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "#8fa8b8", textAlign: "left" }}>
                {["Area", "Score", "Households", "Verified", "Paid install fee", "Referred", "Already installed", "Confidence"].map((h) => (
                  <th key={h} style={{ padding: "12px 14px", borderBottom: "1px solid #17324a", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {areas.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 18, color: "#8fa8b8" }}>
                    {data ? "Nobody is waiting for installation right now." : "Loading…"}
                  </td>
                </tr>
              ) : (
                areas.map((a) => (
                  <tr key={a.area}>
                    <td style={cell}><strong>{a.area}</strong></td>
                    <td style={cell}><strong style={{ color: "#00e5ff" }}>{a.score}</strong></td>
                    <td style={cell}>{a.households}</td>
                    <td style={cell}>{a.verified}</td>
                    <td style={cell}>{a.paid}</td>
                    <td style={cell}>{a.referred}</td>
                    <td style={cell}>{a.installed}</td>
                    <td style={cell}>
                      <span style={{ color: CONFIDENCE[a.confidence].color, fontWeight: 800 }}>● {CONFIDENCE[a.confidence].label}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <footer className={styles.footer}>
          <span>High confidence: 3+ paid installation fees or 8+ verified households. Medium: 1+ paid or 3+ verified.</span>
        </footer>
      </div>
    </main>
  );
}

const cell: React.CSSProperties = { padding: "11px 14px", borderBottom: "1px solid #12253a", whiteSpace: "nowrap" };

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}
