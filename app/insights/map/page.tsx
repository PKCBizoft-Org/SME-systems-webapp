"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CircleMarker, LayerGroup, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { createClient } from "../../../lib/supabaseClient";
import { formatPeso } from "@/lib/format";
import { StaffHeader } from "../../components/StaffHeader";
import { PkcLoader } from "../../components/PkcLoader";
import { useInsightsAccess } from "../useInsightsAccess";
import styles from "./map.module.css";

type Customer = {
  id: string;
  name: string | null;
  lat: number;
  lng: number;
  area: string | null;
  installation: string | null;
  account: string | null;
  in_outage: boolean;
};
type Outage = { id: string; title: string; areas: string[]; created_at: string };
type Payment = { id: string; client_id: string | null; amount: number };
type MapData = { customers: Customer[]; unpinned: number; outages: Outage[]; payments: Payment[] };
type Toast = { id: string; text: string; kind: "paid" | "outage" };

const supabase = createClient();
const REFRESH_MS = 15000;
const PH_CENTER: [number, number] = [12.8, 121.8];

type Status = "outage" | "online" | "pending" | "offline";

function statusOf(c: Customer): Status {
  if (c.in_outage) return "outage";
  const install = (c.installation || "").toLowerCase();
  const account = (c.account || "").toLowerCase();
  if (!["installed", "completed", "done"].includes(install)) return "pending";
  if (account && account !== "active") return "offline";
  return "online";
}

const COLORS: Record<Status, string> = {
  online: "#00e5ff",
  pending: "#ffc857",
  offline: "#5b6b7c",
  outage: "#ff4d6d",
};

// Sounds are made in the browser, so there are no audio files to load.
function tone(ctx: AudioContext, freq: number, start: number, length: number, type: OscillatorType, volume: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  gain.gain.setValueAtTime(volume, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + length);
}

function playChaChing(ctx: AudioContext) {
  tone(ctx, 1318, 0, 0.12, "triangle", 0.25);
  tone(ctx, 1760, 0.1, 0.35, "triangle", 0.25);
}

function playAlarm(ctx: AudioContext) {
  for (let i = 0; i < 6; i++) tone(ctx, i % 2 ? 660 : 880, i * 0.28, 0.26, "square", 0.12);
}

export default function MissionControlPage() {
  const access = useInsightsAccess("dispatch");
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const markersRef = useRef<Map<string, CircleMarker>>(new Map());
  const seenPayments = useRef<Set<string> | null>(null);
  const seenOutages = useRef<Set<string> | null>(null);
  const fitted = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);
  const soundOnRef = useRef(false);

  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState("");
  const [soundOn, setSoundOn] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const pushToast = useCallback((toast: Toast) => {
    setToasts((list) => [...list.slice(-3), toast]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== toast.id)), 6000);
  }, []);

  const sound = useCallback((which: "paid" | "alarm") => {
    const ctx = audioRef.current;
    if (!soundOnRef.current || !ctx) return;
    if (which === "paid") playChaChing(ctx);
    else playAlarm(ctx);
  }, []);

  // Create the map once the page is allowed to show.
  useEffect(() => {
    if (!access.authorized || !mapEl.current || mapRef.current) return;
    let cancelled = false;
    const markers = markersRef.current;
    void import("leaflet").then((L) => {
      if (cancelled || !mapEl.current) return;
      const map = L.map(mapEl.current, { zoomControl: true, attributionControl: true }).setView(PH_CENTER, 6);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
        subdomains: "abcd",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setMapReady(true);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      markers.clear();
      fitted.current = false;
    };
  }, [access.authorized]);

  const load = useCallback(async () => {
    const { data: result, error: rpcError } = await supabase.rpc("mission_control_map");
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setError("");
    const next = result as MapData;
    setData(next);
    setUpdatedAt(new Date());

    // New outages: alarm + toast. The first load only remembers what is there.
    const outageIds = new Set(next.outages.map((o) => o.id));
    if (seenOutages.current) {
      const fresh = next.outages.filter((o) => !seenOutages.current!.has(o.id));
      if (fresh.length > 0) {
        sound("alarm");
        fresh.forEach((o) => pushToast({ id: `o-${o.id}`, text: `Outage: ${o.title}`, kind: "outage" }));
      }
    }
    seenOutages.current = outageIds;

    // New payments: cha-ching, toast and a green flash on the customer's dot.
    const paymentIds = new Set(next.payments.map((p) => p.id));
    if (seenPayments.current) {
      const fresh = next.payments.filter((p) => !seenPayments.current!.has(p.id));
      if (fresh.length > 0) sound("paid");
      fresh.forEach((p) => {
        const who = next.customers.find((c) => c.id === p.client_id)?.name || "a customer";
        pushToast({ id: `p-${p.id}`, text: `${formatPeso(p.amount)} payment from ${who}`, kind: "paid" });
        const marker = p.client_id ? markersRef.current.get(p.client_id) : undefined;
        const el = marker?.getElement();
        if (el) {
          el.classList.add(styles.paidFlash);
          window.setTimeout(() => el.classList.remove(styles.paidFlash), 4000);
        }
      });
    }
    seenPayments.current = paymentIds;
  }, [pushToast, sound]);

  // Draw the dots whenever new data arrives.
  useEffect(() => {
    if (!data || !mapRef.current || !layerRef.current) return;
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !layerRef.current || !mapRef.current) return;
      const layer = layerRef.current;
      const keep = new Set<string>();
      for (const c of data.customers) {
        keep.add(c.id);
        const status = statusOf(c);
        const label = `<strong>${escapeHtml(c.name || "Customer")}</strong><br/>${escapeHtml(c.area || "")}<br/>${statusText(status)}`;
        const existing = markersRef.current.get(c.id);
        const options = {
          radius: status === "outage" ? 9 : 7,
          color: COLORS[status],
          fillColor: COLORS[status],
          fillOpacity: 0.85,
          weight: 2,
          className: `${styles.dot} ${status === "outage" ? styles.dotOutage : ""}`,
        };
        if (existing) {
          existing.setLatLng([c.lat, c.lng]);
          existing.setStyle(options);
          existing.setTooltipContent(label);
          const el = existing.getElement();
          if (el) el.classList.toggle(styles.dotOutage, status === "outage");
        } else {
          const marker = L.circleMarker([c.lat, c.lng], options).bindTooltip(label, { direction: "top" }).addTo(layer);
          marker.on("click", () => window.open(`/clients/${c.id}`, "_blank"));
          markersRef.current.set(c.id, marker);
        }
      }
      for (const [id, marker] of markersRef.current) {
        if (!keep.has(id)) {
          layer.removeLayer(marker);
          markersRef.current.delete(id);
        }
      }
      if (!fitted.current && data.customers.length > 0) {
        fitted.current = true;
        const bounds = L.latLngBounds(data.customers.map((c) => [c.lat, c.lng] as [number, number]));
        mapRef.current.fitBounds(bounds.pad(0.4), { maxZoom: 16 });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [data, mapReady]);

  // Live refresh.
  useEffect(() => {
    if (!access.authorized) return;
    // Polling the database is a genuine external sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [access.authorized, load]);

  function toggleSound() {
    if (!audioRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioRef.current = new Ctx();
    }
    void audioRef.current.resume();
    const next = !soundOnRef.current;
    soundOnRef.current = next;
    setSoundOn(next);
    if (next) playChaChing(audioRef.current);
  }

  if (access.checking) return <PkcLoader label="Opening mission control" steps={["Verifying your role", "Loading the map"]} />;
  if (!access.authorized) return null;

  const counts = { online: 0, pending: 0, offline: 0, outage: 0 };
  for (const c of data?.customers || []) counts[statusOf(c)]++;
  const outages = data?.outages || [];

  return (
    <main className={styles.page}>
      <StaffHeader current="insights" roles={access.roles} />

      <div className={styles.shell}>
        <header className={styles.hud}>
          <div className={styles.titleBlock}>
            <span className={styles.live}>
              <i /> LIVE
            </span>
            <h1>Mission control</h1>
          </div>

          <div className={styles.stats}>
            <Stat label="Online" value={counts.online} color={COLORS.online} />
            <Stat label="Pending install" value={counts.pending} color={COLORS.pending} />
            <Stat label="Inactive" value={counts.offline} color={COLORS.offline} />
            <Stat label="In outage" value={counts.outage} color={COLORS.outage} />
          </div>

          <button className={`${styles.soundBtn} ${soundOn ? styles.soundOn : ""}`} onClick={toggleSound}>
            {soundOn ? "🔊 Sound on" : "🔇 Turn sound on"}
          </button>
        </header>

        {outages.length > 0 && (
          <a href="/insights/outages" className={styles.outageBanner} role="alert">
            <strong>⚠ OUTAGE</strong>
            <span>
              {outages
                .map((o) => `${o.title}${o.areas.length ? ` (${o.areas.join(", ")})` : " (everyone)"}`)
                .join(" · ")}
              {" — "}
              {counts.outage} customer{counts.outage === 1 ? "" : "s"} affected
            </span>
            <em>Manage outages →</em>
          </a>
        )}

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.mapWrap}>
          <div ref={mapEl} className={styles.map} />
          <div className={styles.toasts} aria-live="polite">
            {toasts.map((t) => (
              <div key={t.id} className={`${styles.toast} ${t.kind === "outage" ? styles.toastOutage : styles.toastPaid}`}>
                {t.kind === "paid" ? "₱ " : "⚠ "}
                {t.text}
              </div>
            ))}
          </div>
        </div>

        <footer className={styles.footer}>
          <span>
            Click a dot to open the customer. Updates every {REFRESH_MS / 1000} seconds
            {updatedAt ? `, last at ${updatedAt.toLocaleTimeString("en-PH", { timeStyle: "medium" })}` : ""}.
          </span>
          {data && data.unpinned > 0 ? (
            <span>
              {data.unpinned} customer{data.unpinned === 1 ? " has" : "s have"} no map pin yet.
            </span>
          ) : null}
        </footer>
      </div>
    </main>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={styles.stat}>
      <b style={{ color }}>{value}</b>
      <span>
        <i style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
        {label}
      </span>
    </div>
  );
}

function statusText(status: Status) {
  return { online: "Online", pending: "Waiting for installation", offline: "Inactive account", outage: "Affected by outage" }[status];
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}
