"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type CSSProperties } from "react";

const Globe = dynamic(() => import("react-globe.gl"), { ssr: false });

const PKC_LOGO =
  "data:image/webp;base64,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";
const NETWORK_POINTS = [
  {
    id: "europe",
    lat: 48.8566,
    lng: 2.3522,
    label: "EUROPE GATEWAY",
    sub: "WI-FI UPLINK",
    icon: "wifi",
    status: "ONLINE",
    metric: "18ms",
  },
  {
    id: "cloud",
    lat: 37.7749,
    lng: -122.4194,
    label: "GLOBAL CLOUD",
    sub: "SERVICES ROUTE",
    icon: "cloud",
    status: "ACTIVE",
    metric: "42 routes",
  },
  {
    id: "philippines",
    lat: 14.5995,
    lng: 120.9842,
    label: "PH CORE SERVER",
    sub: "PHILIPPINES",
    icon: "server",
    status: "ONLINE",
    metric: "NODE 07",
  },
  {
    id: "tokyo",
    lat: 35.6762,
    lng: 139.6503,
    label: "ASIA ROUTE",
    sub: "TOKYO RELAY",
    icon: "globe",
    status: "SYNCED",
    metric: "31ms",
  },
  {
    id: "dubai",
    lat: 25.2048,
    lng: 55.2708,
    label: "SECURE LINK",
    sub: "DUBAI RELAY",
    icon: "shield",
    status: "SECURE",
    metric: "ENCRYPTED",
  },
];

const ROUTES = [
  {
    id: "eu-ph",
    coords: [
      [48.8566, 2.3522],
      [45.4642, 9.19],
      [41.0082, 28.9784],
      [35.6762, 51.389],
      [25.2048, 55.2708],
      [19.076, 72.8777],
      [13.7563, 100.5018],
      [14.5995, 120.9842],
    ],
  },
  {
    id: "cloud-ph",
    coords: [
      [37.7749, -122.4194],
      [35.6762, 139.6503],
      [25.033, 121.5654],
      [14.5995, 120.9842],
    ],
  },
];

const ROUTE_ARCS = [
  {
    id: "eu-core",
    startLat: 48.8566,
    startLng: 2.3522,
    endLat: 14.5995,
    endLng: 120.9842,
    label: "EUROPE → PH CORE",
  },
  {
    id: "cloud-core",
    startLat: 37.7749,
    startLng: -122.4194,
    endLat: 14.5995,
    endLng: 120.9842,
    label: "CLOUD → PH CORE",
  },
  {
    id: "asia-core",
    startLat: 35.6762,
    startLng: 139.6503,
    endLat: 14.5995,
    endLng: 120.9842,
    label: "ASIA → PH CORE",
  },
];

const features = [
  {
    number: "01",
    title: "Client Intelligence",
    text: "Keep customers, plans, installations and account status connected in one operational view.",
    icon: "clients",
  },
  {
    number: "02",
    title: "Live Operations",
    text: "See network activity, service routes and business signals without losing the human workflow.",
    icon: "pulse",
  },
  {
    number: "03",
    title: "Secure by Design",
    text: "Tenant-aware access and protected business data keep every workspace separated.",
    icon: "shield",
  },
];


function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "wifi":
      return (
        <svg {...common}>
          <path d="M3 8.5a15.4 15.4 0 0 1 18 0" />
          <path d="M6.5 12a10.5 10.5 0 0 1 11 0" />
          <path d="M10 15.3a5.7 5.7 0 0 1 4 0" />
          <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "cloud":
      return (
        <svg {...common}>
          <path d="M7.5 18.5h9.2a4.3 4.3 0 0 0 .4-8.6A6 6 0 0 0 5.7 8.8 4.8 4.8 0 0 0 7.5 18.5Z" />
        </svg>
      );
    case "server":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="6" rx="1.5" />
          <rect x="4" y="14" width="16" height="6" rx="1.5" />
          <path d="M7 7h.01M7 17h.01M10 7h6M10 17h6" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3 19 6v5.5c0 4.8-2.9 7.9-7 9.5-4.1-1.6-7-4.7-7-9.5V6l7-3Z" />
          <path d="m9.3 12 1.8 1.8 3.7-4" />
        </svg>
      );
    case "globe":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.8 12h16.4M12 3.5c2.2 2.3 3.2 5.1 3.2 8.5s-1 6.2-3.2 8.5c-2.2-2.3-3.2-5.1-3.2-8.5s1-6.2 3.2-8.5Z" />
        </svg>
      );
    case "leader":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 20c.8-4 3-6 6.5-6s5.7 2 6.5 6" />
          <path d="M19 4v3M17.5 5.5h3" />
        </svg>
      );
    case "cofounder":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="2.8" />
          <circle cx="16" cy="8" r="2.8" />
          <path d="M3.8 19c.7-3.3 2.2-5 4.2-5s3.5 1.7 4.2 5M11.8 19c.7-3.3 2.2-5 4.2-5s3.5 1.7 4.2 5" />
        </svg>
      );
    case "code":
      return (
        <svg {...common}>
          <path d="m8 8-4 4 4 4" />
          <path d="m16 8 4 4-4 4" />
          <path d="m14 5-4 14" />
        </svg>
      );
    case "clients":
      return (
        <svg {...common}>
          <circle cx="8.5" cy="8" r="2.7" />
          <circle cx="16.5" cy="9" r="2.2" />
          <path d="M3.8 19c.6-3.4 2.2-5.2 4.7-5.2s4.1 1.8 4.7 5.2M13 14.7c2.7-.8 5.1.5 6 4.3" />
        </svg>
      );
    case "pulse":
      return (
        <svg {...common}>
          <path d="M3 12h4l2-5 4.2 10 2-5H21" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}

export default function HomePage() {
  const globeRef = useRef<any>(null);
  const [activeFeature, setActiveFeature] = useState(0);
  const [networkLive, setNetworkLive] = useState(true);
  const [time, setTime] = useState("");
  const [storySection, setStorySection] = useState("network");
  const [introVisible, setIntroVisible] = useState(true);
  const [introExiting, setIntroExiting] = useState(false);
  const [introPhase, setIntroPhase] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const finishIntro = () => {
      setIntroExiting(true);
      window.setTimeout(() => setIntroVisible(false), 720);
    };

    const phaseTimers = [
      window.setTimeout(() => setIntroPhase(1), 520),
      window.setTimeout(() => setIntroPhase(2), 1350),
      window.setTimeout(() => setIntroPhase(3), 2350),
      window.setTimeout(() => setIntroPhase(4), 3350),
    ];
    const timer = window.setTimeout(finishIntro, 4400);
    return () => {
      phaseTimers.forEach((id) => window.clearTimeout(id));
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("introLocked", introVisible);
    return () => document.documentElement.classList.remove("introLocked");
  }, [introVisible]);

  useEffect(() => {
    const update = () =>
      setTime(
        new Intl.DateTimeFormat("en-PH", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date()),
      );
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    const controls = globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.72;
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableRotate = true;
    globe.pointOfView({ lat: 22, lng: 105, altitude: 1.72 }, 0);
    const material = globe.globeMaterial();
    material.color?.set("#087d9d");
    material.emissive?.set("#032b3d");
    material.emissiveIntensity = 1.25;
    material.shininess = 18;
  }, []);

  useEffect(() => {
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("[data-story-section]"),
    );

    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("storyVisible");
          }
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" },
    );

    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("[data-story-section]"),
    );

    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visible) {
          setStorySection(visible.target.getAttribute("data-story-section") || "network");
        }
      },
      {
        threshold: [0.2, 0.45, 0.7],
        rootMargin: "-12% 0px -38% 0px",
      },
    );

    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let frame = 0;
    let x = 0;
    let y = 0;
    const move = (event: PointerEvent) => {
      x = event.clientX;
      y = event.clientY;
      if (!frame) {
        frame = window.requestAnimationFrame(() => {
          document.documentElement.style.setProperty("--mx", `${x}px`);
          document.documentElement.style.setProperty("--my", `${y}px`);
          frame = 0;
        });
      }
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    let frame = 0;

    const updateScroll = () => {
      frame = 0;
      const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const progress = Math.min(window.scrollY / maxScroll, 1);
      document.documentElement.style.setProperty("--story-scroll", `${progress}`);
    };

    const handleScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(updateScroll);
    };

    updateScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <main className={`page ${introVisible ? "hasIntro" : "introComplete"}`}>
      {introVisible && (
        <div className={`introScreen phase-${introPhase} ${introExiting ? "isExiting" : ""}`} role="status" aria-live="polite">
          <div className="introNoise" />
          <div className="introOrb introOrbOne" />
          <div className="introOrb introOrbTwo" />
          <div className="introGrid" />
          <div className="introVignette" />
          <div className="introHud introHudTL">
            <span>PKC-NET // CORE</span><b>SECURE</b>
          </div>
          <div className="introHud introHudTR">
            <span>LAT 07</span><b>SYNC 99.9%</b>
          </div>
          <div className="introHud introHudBL">
            <span>LOCAL NODE</span><b>PHILIPPINES</b>
          </div>
          <div className="introHud introHudBR">
            <span>BUILD 01</span><b>READY</b>
          </div>
          <div className="introBeam introBeamA" aria-hidden="true" />
          <div className="introBeam introBeamB" aria-hidden="true" />
          <div className="introStars" aria-hidden="true">
            {Array.from({ length: 22 }, (_, index) => (
              <i key={index} style={{ "--i": index } as CSSProperties} />
            ))}
          </div>
          <div className="introScan introScanOne" aria-hidden="true" />
          <div className="introScan introScanTwo" aria-hidden="true" />
          <div className="introCenter">
            <div className="introLogoWrap">
              <div className="introRing introRingOuter" />
              <div className="introRing introRingInner" />
              <img src={PKC_LOGO} alt="PKC BIZOFT" className="introLogo" />
            </div>
            <div className="introKicker">PKC // BIZOFT</div>
            <div className="introTitle">
              <span>YOUR BUSINESS.</span>
              <strong>CONNECTED.</strong>
            </div>
            <p className="introSubtitle">A living network for people, systems, and operations.</p>
            <div className="introBoot">
              <div className="introBootTop">
                <span className="introBootLabel">INITIALIZING BUSINESS NETWORK</span>
                <span className="introBootStatus"><i /> ONLINE</span>
              </div>
              <span className="introBootLine"><i /></span>
              <div className="introBootMeta">
                <span>AUTHENTICATING</span>
                <span>LINKING SYSTEMS</span>
                <span>SYNCING OPERATIONS</span>
                <b>100%</b>
              </div>
              <div className="introSignalRow" aria-hidden="true">
                <span><i /> CORE</span><span><i /> DATA</span><span><i /> PEOPLE</span><span><i /> READY</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="introSkip"
            onClick={() => {
              setIntroExiting(true);
              window.setTimeout(() => setIntroVisible(false), 720);
            }}
          >
            SKIP INTRO <span>↗</span>
          </button>
          <div className="introCorner introCornerTL" />
          <div className="introCorner introCornerBR" />
        </div>
      )}
      <div className="ambient ambientOne" />
      <div className="ambient ambientTwo" />
      <div className="ambient ambientThree" />
      <div className="grid" />
      <div className="cursorGlow" aria-hidden="true" />

      <div className="storyProgress" aria-label="Page story progress">
        <div className="storyProgressLine">
          <span className="storyProgressFill" />
        </div>
        <div className="storySteps">
          {[
            ["network", "01", "NETWORK"],
            ["systems", "02", "SYSTEM"],
            ["features", "03", "CAPABILITIES"],
          ].map(([id, number, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className={storySection === id ? "active" : ""}
              aria-label={`Go to ${label}`}
            >
              <span>{number}</span>
              <small>{label}</small>
            </a>
          ))}
        </div>
      </div>

      <div className="scrollHint" aria-hidden="true">
        <span>SCROLL TO EXPLORE</span>
        <i />
      </div>

      <nav className="nav">
        <a className="brand" href="#network">
          <img className="brandLogo" src={PKC_LOGO} alt="PKC BIZOFT" />
          <span>
            <strong>PKC</strong>
            <small>BIZOFT</small>
          </span>
        </a>
        <div className="navLinks">
          <a href="#network">Network</a>
          <a href="#systems">Systems</a>
          <a href="/who-we-are">Who We Are</a>
          <a href="#features">Capabilities</a>
        </div>
        <div className="navRight">
          <span className="clock">{time || "--:--:--"} PHT</span>
          <button
            className={`liveToggle ${networkLive ? "on" : ""}`}
            onClick={() => setNetworkLive((v) => !v)}
            aria-label="Toggle network status"
          >
            <span />
            {networkLive ? "LIVE" : "PAUSED"}
          </button>
          <a className="loginButton" href="/login">
            ENTER SYSTEM <span>↗</span>
          </a>
          <button className={`menuButton ${mobileMenuOpen ? "open" : ""}`} type="button" onClick={() => setMobileMenuOpen((v) => !v)} aria-label="Toggle navigation" aria-expanded={mobileMenuOpen}>
            <span /><span />
          </button>
        </div>
        <div className={`mobileMenu ${mobileMenuOpen ? "open" : ""}`}>
          <a href="#network" onClick={() => setMobileMenuOpen(false)}>NETWORK <b>01</b></a>
          <a href="#systems" onClick={() => setMobileMenuOpen(false)}>SYSTEMS <b>02</b></a>
          <a href="/who-we-are" onClick={() => setMobileMenuOpen(false)}>WHO WE ARE <b>03</b></a>
          <a href="#features" onClick={() => setMobileMenuOpen(false)}>CAPABILITIES <b>04</b></a>
          <a href="/login" onClick={() => setMobileMenuOpen(false)}>ENTER SYSTEM <b>↗</b></a>
        </div>
      </nav>

      <section className="hero storySection storyVisible" id="network" data-story-section="network">
        <div className="heroCopy">
          <div className="eyebrow">
            <span className="pulse" />
            <span>BUSINESS OPERATIONS NETWORK</span>
          </div>
          <h1>
            Your business.
            <br />
            <span>Connected.</span>
          </h1>
          <p>
            PKC BIZOFT turns everyday operations into a living network —
            connecting clients, services, people and data in one intelligent
            workspace.
          </p>
          <div className="heroActions">
            <a href="/login" className="primaryButton">
              OPEN BIZOFT <span>→</span>
            </a>
            <a href="/who-we-are" className="secondaryButton">
              WHO WE ARE
            </a>
          </div>
          <div className="miniStats">
            <div>
              <strong>24/7</strong>
              <span>NETWORK VISIBILITY</span>
            </div>
            <div>
              <strong>01</strong>
              <span>CONNECTED WORKSPACE</span>
            </div>
            <div>
              <strong>∞</strong>
              <span>ROOM TO SCALE</span>
            </div>
          </div>
          <div className="heroSignalStrip" aria-label="Network capabilities">
            <span><i /> CLIENTS</span>
            <span><i /> SERVICES</span>
            <span><i /> PEOPLE</span>
            <span><i /> DATA</span>
            <b>ALL CONNECTED</b>
          </div>
          <a href="/who-we-are" className="teamRoute" aria-label="Meet the PKC BIZOFT team">
            <span><i /> PEOPLE / FOUNDING NETWORK</span>
            <b>MEET THE TEAM ↗</b>
          </a>
        </div>

        <div className="globeWrap">
          <div className="globeLabel top">
            <span>GLOBAL NETWORK</span>
            <b>NODE 07</b>
          </div>
          <div className="globeStage">
            <div className="scanRing ringOne" />
            <div className="scanRing ringTwo" />
            <div className="scanRing ringThree" />
            <div className="scanCross crossH" />
            <div className="scanCross crossV" />
            <Globe
              ref={globeRef}
              width={680}
              height={680}
              backgroundColor="rgba(0,0,0,0)"
              globeImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/earth-dark.jpg"
              bumpImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png"
              showAtmosphere
              atmosphereColor="#16d9ff"
              atmosphereAltitude={0.17}
              showGraticules
                            pointsData={NETWORK_POINTS}
              pointLat="lat"
              pointLng="lng"
              pointColor={(d: any) =>
                d.id === "philippines" ? "#a9fbff" : "#35e7ff"
              }
              pointAltitude={(d: any) =>
                d.id === "philippines" ? 0.075 : 0.052
              }
              pointRadius={(d: any) => (d.id === "philippines" ? 0.7 : 0.48)}
              ringsData={NETWORK_POINTS}
              ringLat="lat"
              ringLng="lng"
              ringColor={(d: any) =>
                d.id === "philippines" ? "#71f4ff" : "#36e6ff"
              }
              ringMaxRadius={(d: any) => (d.id === "philippines" ? 4.5 : 3.1)}
              ringPropagationSpeed={1.3}
              ringRepeatPeriod={1150}
              arcsData={networkLive ? ROUTE_ARCS : []}
              arcStartLat="startLat"
              arcStartLng="startLng"
              arcEndLat="endLat"
              arcEndLng="endLng"
              arcColor={() => ["rgba(86,239,255,.95)", "rgba(86,239,255,.12)"]}
              arcAltitudeAutoScale={0.34}
              arcStroke={1.1}
              arcDashLength={0.45}
              arcDashGap={1.25}
              arcDashAnimateTime={1800}
              pathsData={networkLive ? ROUTES : []}
              pathPoints="coords"
              pathPointLat={(p: number[]) => p[0]}
              pathPointLng={(p: number[]) => p[1]}
              pathColor={() => "#2fe5ff"}
              pathStroke={0.7}
              pathDashLength={0.24}
              pathDashGap={1.5}
              pathDashAnimateTime={2400}
              htmlElementsData={NETWORK_POINTS}
              htmlLat="lat"
              htmlLng="lng"
              htmlAltitude={0.13}
              htmlTransitionDuration={0}
              htmlElement={(d: any) => {
                const element = document.createElement("div");
                element.innerHTML = `<span class="geoAnchor"></span><span class="geoHalo"></span><span class="geoLine"></span><span class="geoArrow"></span><div class="geoCard"><div class="geoIcon"><span class="iconMount"></span></div><div class="geoText"><strong>${d.label}</strong><small>${d.sub}</small><div class="geoMeta"><em><i></i>${d.status}</em><b>${d.metric}</b></div></div></div>`;
                const mount = element.querySelector(".iconMount");
                if (mount) {
                  const icons: any = {
                    wifi: '<svg viewBox="0 0 24 24"><path d="M3 8.5a15.4 15.4 0 0 1 18 0"/><path d="M6.5 12a10.5 10.5 0 0 1 11 0"/><path d="M10 15.3a5.7 5.7 0 0 1 4 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/></svg>',
                    cloud:
                      '<svg viewBox="0 0 24 24"><path d="M7.5 18.5h9.2a4.3 4.3 0 0 0 .4-8.6A6 6 0 0 0 5.7 8.8 4.8 4.8 0 0 0 7.5 18.5Z"/></svg>',
                    server:
                      '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="6" rx="1.5"/><rect x="4" y="14" width="16" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01M10 7h6M10 17h6"/></svg>',
                    shield:
                      '<svg viewBox="0 0 24 24"><path d="M12 3 19 6v5.5c0 4.8-2.9 7.9-7 9.5-4.1-1.6-7-4.7-7-9.5V6l7-3Z"/><path d="m9.3 12 1.8 1.8 3.7-4"/></svg>',
                    globe:
                      '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.8 12h16.4M12 3.5c2.2 2.3 3.2 5.1 3.2 8.5s-1 6.2-3.2 8.5c-2.2-2.3-3.2-5.1-3.2-8.5s1-6.2 3.2-8.5Z"/></svg>',
                  };
                  mount.innerHTML = icons[d.icon] || icons.globe;
                }
                return element;
              }}
              htmlElementVisibilityModifier={(
                el: HTMLElement,
                visible: boolean,
              ) => {
                el.style.opacity = visible ? "1" : "0";
              }}
              enablePointerInteraction
            />
          </div>
          <div className="globeLabel bottom">
            <span>
              <i /> ROUTES SYNCHRONIZED
            </span>
            <b>{networkLive ? "LIVE" : "STANDBY"}</b>
          </div>
          <div className="orbitReadout">
            <span className="orbitDot" />
            <strong>EARTH LINK</strong>
            <small>AUTO ROTATION • ACTIVE</small>
          </div>
          <div className="heroTelemetry" aria-hidden="true">
            <span><b>LATENCY</b><strong>18ms</strong></span>
            <span><b>UPTIME</b><strong>99.9%</strong></span>
            <span><b>STATUS</b><strong>STABLE</strong></span>
          </div>
        </div>
      </section>

      <div className="signalTicker" aria-hidden="true">
        <div className="tickerTrack">
          <span>PKC NETWORK</span><i /> <span>CLIENTS</span><i /> <span>SERVICES</span><i /> <span>OPERATIONS</span><i /> <span>DATA</span><i /> <span>PEOPLE</span><i /> <span>PKC NETWORK</span><i /> <span>CLIENTS</span><i /> <span>SERVICES</span><i /> <span>OPERATIONS</span><i /> <span>DATA</span><i /> <span>PEOPLE</span><i />
        </div>
      </div>

      <section className="systems storySection" id="systems" data-story-section="systems">
        <div className="sectionHeading">
          <div>
            <span className="sectionKicker">THE SYSTEM</span>
            <h2>
              One view.
              <br />
              <em>Every signal.</em>
            </h2>
          </div>
          <p>
            A connected view of the signals that matter — without turning the
            homepage into a wall of dashboards.
          </p>
        </div>
        <div className="systemGrid">
          <article className="systemCard large">
            <div className="cardTop">
              <span>NETWORK / 01</span>
              <b>↗</b>
            </div>
            <div className="networkGraphic">
              <div className="networkCore">
                <span>PKC</span>
                <i />
              </div>
              <div className="node nodeA">
                <Icon name="clients" size={12} /> CLIENTS
              </div>
              <div className="node nodeB">
                <Icon name="pulse" size={12} /> BILLING
              </div>
              <div className="node nodeC">
                <Icon name="server" size={12} /> OPS
              </div>
              <div className="node nodeD">
                <Icon name="cloud" size={12} /> DATA
              </div>
              <div className="line lineA" />
              <div className="line lineB" />
              <div className="line lineC" />
              <div className="line lineD" />
              <div className="dataParticle p1" />
              <div className="dataParticle p2" />
              <div className="dataParticle p3" />
            </div>
            <div className="systemCopy">
              <h3>Everything talks.</h3>
              <p>
                Bring your core business signals into a single connected
                environment.
              </p>
            </div>
          </article>

          <article className="systemCard">
            <div className="cardTop">
              <span>STATUS / 02</span>
              <b>●</b>
            </div>
            <div className="statusGraphic">
              <div className="statusBar">
                <span style={{ width: "92%" }} />
              </div>
              <div className="statusBar">
                <span style={{ width: "78%" }} />
              </div>
              <div className="statusBar">
                <span style={{ width: "86%" }} />
              </div>
              <div className="statusBar">
                <span style={{ width: "64%" }} />
              </div>
              <div className="statusLegend">
                <i /> LIVE SIGNALS
              </div>
            </div>
            <div className="systemCopy">
              <h3>See what matters.</h3>
              <p>
                Turn scattered activity into clean, readable operational
                signals.
              </p>
            </div>
          </article>

          <article className="systemCard">
            <div className="cardTop">
              <span>SECURITY / 03</span>
              <b>◇</b>
            </div>
            <div className="shieldGraphic">
              <div className="shieldIcon">
                <Icon name="shield" size={58} />
              </div>
              <span>SECURE</span>
            </div>
            <div className="systemCopy">
              <h3>Stay protected.</h3>
              <p>
                Tenant-aware access keeps business information isolated and
                controlled.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className="features storySection" id="features" data-story-section="features">
        <div className="featureIntro">
          <span className="sectionKicker">CAPABILITIES</span>
          <h2>
            Built around
            <br />
            <em>your workflow.</em>
          </h2>
          <p>
            Focused tools for the parts of a business that need the clearest
            view.
          </p>
        </div>
        <div className="featureList">
          {features.map((feature, index) => (
            <button
              type="button"
              key={feature.number}
              className={`featureCard ${activeFeature === index ? "active" : ""}`}
              onClick={() => setActiveFeature(index)}
              aria-pressed={activeFeature === index}
            >
              <span className="featureCardTop">
                <b>{feature.number}</b>
                <span className="featureIcon">
                  <Icon name={feature.icon} size={20} />
                </span>
                <span className="featureArrow">↗</span>
              </span>
              <span className="featureTitle">{feature.title}</span>
              <span className="featureText">{feature.text}</span>
              <span className="featureAccent" />
            </button>
          ))}
        </div>
      </section>

      <section className="finalCta storySection" data-story-section="features">
        <div className="finalCtaGrid" />
        <div className="finalCtaCopy">
          <span className="sectionKicker">NEXT / PRIVATE WORKSPACE</span>
          <h2>Ready to move<br /><em>inside the system?</em></h2>
          <p>The public network shows the architecture. The workspace is where your business actually moves.</p>
          <a href="/login" className="primaryButton">ENTER BIZOFT <span>↗</span></a>
        </div>
        <div className="finalCtaCore"><div className="ctaRing ctaRingA" /><div className="ctaRing ctaRingB" /><img src={PKC_LOGO} alt="PKC BIZOFT" /><span>PRIVATE / 01</span></div>
      </section>

      <footer className="storySection" data-story-section="features">
        <div className="footerBrand">
          <img
            className="brandLogo footerLogo"
            src={PKC_LOGO}
            alt="PKC BIZOFT"
          />
          <strong>PKC BIZOFT</strong>
        </div>
        <span>BUSINESS OPERATIONS / CONNECTED</span>
        <span>© 2026 PKC</span>
      </footer>

      <style jsx>{`
        :global(*) {
          box-sizing: border-box;
        }

        :global(html) {
          scroll-behavior: smooth;
          scroll-padding-top: 92px;
          overscroll-behavior-y: none;
        }

        :global([id]) {
          scroll-margin-top: 92px;
        }

        :global(body) {
          margin: 0;
          background: #02080c;
          color: #eaffff;
          font-family: Arial, Helvetica, sans-serif;
        }

        :global(a) {
          color: inherit;
          text-decoration: none;
        }

        :global(button) {
          font: inherit;
        }

        .page {
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(
              circle at 72% 20%,
              rgba(0, 200, 255, 0.13),
              transparent 29%
            ),
            radial-gradient(
              circle at 10% 62%,
              rgba(0, 125, 180, 0.1),
              transparent 27%
            ),
            #02080c;
        }

        .grid {
          position: absolute;
          inset: 0;
          opacity: 0.2;
          pointer-events: none;
          background-image:
            linear-gradient(rgba(37, 211, 255, 0.055) 1px, transparent 1px),
            linear-gradient(
              90deg,
              rgba(37, 211, 255, 0.055) 1px,
              transparent 1px
            );
          background-size: 55px 55px;
          mask-image: linear-gradient(to bottom, black, transparent 92%);
        }

        .ambient {
          position: absolute;
          width: 500px;
          height: 500px;
          border-radius: 50%;
          filter: blur(90px);
          opacity: 0.12;
          pointer-events: none;
          animation: drift 9s ease-in-out infinite alternate;
        }

        .ambientOne {
          top: 80px;
          right: -180px;
          background: #00d9ff;
        }

        .ambientTwo {
          bottom: 200px;
          left: -220px;
          background: #007ca8;
          animation-delay: -4s;
        }

        .ambientThree {
          top: 44%;
          left: 45%;
          background: #005d8c;
          animation-delay: -7s;
        }

        @keyframes drift {
          to {
            transform: translate3d(-50px, 30px, 0) scale(1.08);
          }
        }

        .nav,
        .hero,
        .systems,
        .people,
        .features,
        footer {
          width: min(1400px, calc(100% - 64px));
          margin: 0 auto;
        }

        .nav {
          height: 82px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 50;
          border-bottom: 1px solid rgba(122, 235, 255, 0.12);
          background: linear-gradient(180deg, rgba(2, 8, 12, 0.94), rgba(2, 8, 12, 0.68));
          backdrop-filter: blur(18px) saturate(125%);
          -webkit-backdrop-filter: blur(18px) saturate(125%);
          box-shadow: 0 14px 45px rgba(0, 0, 0, 0.18);
        }

        .brand,
        .navRight,
        .navLinks,
        .brand > span:last-child {
          display: flex;
          align-items: center;
        }

        .brand {
          gap: 11px;
        }

        .brand > span:last-child {
          gap: 6px;
        }

        .brandLogo {
          width: 34px;
          height: 34px;
          object-fit: contain;
          display: block;
          filter: drop-shadow(0 0 12px rgba(57, 228, 255, 0.18));
        }

        .footerLogo {
          width: 27px;
          height: 27px;
        }

        .brand strong {
          font-size: 18px;
          letter-spacing: 0.12em;
        }

        .brand small {
          font-size: 10px;
          letter-spacing: 0.24em;
          opacity: 0.55;
        }

        .navLinks {
          gap: 25px;
        }

        .navLinks a {
          font-size: 10px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          opacity: 0.55;
          transition: 0.25s;
        }

        .navLinks a:hover {
          opacity: 1;
          color: #53e8ff;
        }

        .navRight {
          gap: 13px;
        }

        .clock {
          font-size: 10px;
          letter-spacing: 0.12em;
          opacity: 0.45;
        }

        .liveToggle {
          border: 1px solid rgba(65, 229, 255, 0.22);
          background: rgba(16, 45, 54, 0.55);
          color: #9eeefa;
          padding: 8px 11px;
          border-radius: 999px;
          font-size: 10px;
          letter-spacing: 0.16em;
          cursor: pointer;
        }

        .liveToggle span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          display: inline-block;
          background: #53656b;
          margin-right: 6px;
        }

        .liveToggle.on span {
          background: #46f4bd;
          box-shadow: 0 0 9px #46f4bd;
        }

        .loginButton,
        .primaryButton {
          display: inline-flex;
          align-items: center;
          gap: 13px;
          background: #bff9ff;
          color: #031017;
          padding: 12px 16px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.13em;
          border-radius: 5px;
          transition: 0.25s;
        }

        .loginButton:hover,
        .primaryButton:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 35px rgba(40, 222, 255, 0.18);
        }

        .hero {
          min-height: 720px;
          display: grid;
          grid-template-columns: 0.76fr 1.24fr;
          align-items: center;
          position: relative;
          z-index: 3;
        }

        .heroCopy::before {
          content: "01 / NETWORK ONLINE";
          display: inline-block;
          margin-bottom: 18px;
          padding: 6px 9px;
          border: 1px solid rgba(89, 230, 255, 0.14);
          background: rgba(7, 25, 33, 0.45);
          color: rgba(153, 241, 255, 0.5);
          font-size: 8px;
          letter-spacing: .2em;
        }

        .heroCopy {
          padding: 65px 0 80px;
          position: relative;
          z-index: 5;
        }

        .eyebrow,
        .sectionKicker {
          color: #53e8ff;
          font-size: 10px;
          letter-spacing: 0.23em;
          font-weight: 700;
        }

        .eyebrow {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .pulse {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #43efc1;
          box-shadow: 0 0 12px #43efc1;
          animation: blink 1.6s infinite;
        }

        @keyframes blink {
          50% {
            opacity: 0.35;
            transform: scale(0.65);
          }
        }

        h1 {
          font-size: clamp(52px, 6.3vw, 92px);
          line-height: 0.9;
          letter-spacing: -0.065em;
          margin: 22px 0;
          max-width: 720px;
        }

        h1 span {
          color: transparent;
          -webkit-text-stroke: 1px rgba(150, 244, 255, 0.8);
          text-shadow: 0 0 35px rgba(27, 213, 255, 0.1);
        }

        .heroCopy > p {
          max-width: 500px;
          font-size: 14px;
          line-height: 1.85;
          color: rgba(224, 250, 255, 0.68);
          margin: 0 0 28px;
        }

        .heroActions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .secondaryButton {
          padding: 12px 16px;
          border: 1px solid rgba(134, 237, 255, 0.2);
          color: rgba(225, 253, 255, 0.72);
          border-radius: 5px;
          font-size: 10px;
          letter-spacing: 0.13em;
          transition: 0.25s;
        }

        .secondaryButton:hover {
          border-color: rgba(134, 237, 255, 0.6);
          color: white;
        }

        .heroSignalStrip {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px 14px;
          margin-top: 20px;
          padding-top: 13px;
          border-top: 1px solid rgba(122, 235, 255, 0.11);
          color: rgba(207, 246, 255, 0.52);
          font-size: 8px;
          letter-spacing: 0.16em;
        }

        .heroSignalStrip span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        }

        .heroSignalStrip i {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #58edff;
          box-shadow: 0 0 9px rgba(88, 237, 255, 0.85);
          animation: signalPulse 1.8s ease-in-out infinite;
        }

        .heroSignalStrip span:nth-child(2) i { animation-delay: .25s; }
        .heroSignalStrip span:nth-child(3) i { animation-delay: .5s; }
        .heroSignalStrip span:nth-child(4) i { animation-delay: .75s; }

        .heroSignalStrip b {
          margin-left: auto;
          color: rgba(141, 243, 255, 0.9);
          font-weight: 600;
        }

        @keyframes signalPulse {
          0%, 100% { opacity: .35; transform: scale(.8); }
          50% { opacity: 1; transform: scale(1.35); }
        }

        .teamRoute {
          margin-top: 12px; display: flex; align-items: center; justify-content: space-between; gap: 16px;
          max-width: 500px; padding: 11px 13px; border: 1px solid rgba(112,235,255,.1); border-radius: 7px;
          background: linear-gradient(90deg,rgba(8,31,40,.45),rgba(4,14,20,.25)); color: rgba(221,251,255,.48);
          font-size: 8px; letter-spacing: .15em; transition: transform .3s ease,border-color .3s ease,color .3s ease,background .3s ease;
        }
        .teamRoute span,.teamRoute b { display:inline-flex; align-items:center; gap:7px; }
        .teamRoute i { width:5px; height:5px; border-radius:50%; background:#4cefc0; box-shadow:0 0 10px #4cefc0; animation:signalPulse 1.8s ease-in-out infinite; }
        .teamRoute b { color:rgba(150,244,255,.78); font-weight:700; }
        .teamRoute:hover { transform:translateY(-2px); border-color:rgba(104,235,255,.3); color:rgba(232,253,255,.85); background:rgba(10,38,47,.5); }

        .heroTelemetry {
          position: absolute;
          right: 2px;
          bottom: 42px;
          display: grid;
          grid-template-columns: repeat(3, auto);
          gap: 1px;
          padding: 1px;
          border: 1px solid rgba(116, 238, 255, 0.14);
          background: rgba(1, 10, 15, 0.7);
          backdrop-filter: blur(12px);
        }

        .heroTelemetry span {
          min-width: 78px;
          padding: 9px 11px;
          display: grid;
          gap: 3px;
          background: rgba(5, 18, 25, 0.78);
        }

        .heroTelemetry b {
          font-size: 7px;
          letter-spacing: .18em;
          color: rgba(177, 233, 242, .42);
        }

        .heroTelemetry strong {
          font-size: 10px;
          letter-spacing: .12em;
          color: #bff9ff;
        }

        .miniStats {
          display: flex;
          gap: 28px;
          margin-top: 42px;
        }

        .miniStats div {
          display: grid;
          gap: 5px;
        }

        .miniStats strong {
          font-size: 22px;
          letter-spacing: -0.03em;
        }

        .miniStats span {
          font-size: 9px;
          letter-spacing: 0.16em;
          opacity: 0.48;
        }

        .globeWrap {
          height: 720px;
          position: relative;
          display: grid;
          place-items: center;
          margin-right: -65px;
        }

        .globeStage {
          width: 680px;
          height: 680px;
          position: relative;
          display: grid;
          place-items: center;
          overflow: visible;
        }

        .globeStage > :global(div) {
          overflow: visible !important;
        }

        .globeStage :global(canvas) {
          filter: saturate(1.28) contrast(1.05)
            drop-shadow(0 0 28px rgba(15, 213, 255, 0.09));
        }

        .scanRing {
          position: absolute;
          border: 1px solid rgba(49, 224, 255, 0.1);
          border-radius: 50%;
          pointer-events: none;
        }

        .ringOne {
          width: 570px;
          height: 205px;
          transform: rotate(-17deg);
          animation: ringSpin 13s linear infinite;
        }

        .ringTwo {
          width: 640px;
          height: 245px;
          transform: rotate(14deg);
          opacity: 0.55;
          animation: ringSpinReverse 18s linear infinite;
        }

        .ringThree {
          width: 455px;
          height: 455px;
          opacity: 0.4;
          animation: ringPulse 4s ease-in-out infinite;
        }

        .scanCross {
          position: absolute;
          opacity: 0.18;
          pointer-events: none;
        }

        .crossH {
          width: 710px;
          height: 1px;
          background: linear-gradient(90deg, transparent, #3de5ff, transparent);
        }

        .crossV {
          width: 1px;
          height: 710px;
          background: linear-gradient(
            180deg,
            transparent,
            #3de5ff,
            transparent
          );
        }

        @keyframes ringSpin {
          to {
            transform: rotate(343deg);
          }
        }

        @keyframes ringSpinReverse {
          to {
            transform: rotate(-346deg);
          }
        }

        @keyframes ringPulse {
          50% {
            transform: scale(1.035);
            opacity: 0.16;
          }
        }

        .globeLabel {
          position: absolute;
          z-index: 7;
          display: flex;
          gap: 10px;
          align-items: center;
          font-size: 10px;
          letter-spacing: 0.17em;
          color: rgba(197, 247, 255, 0.48);
        }

        .globeLabel b {
          color: #4de4ff;
          font-size: 9px;
        }

        .globeLabel.top {
          top: 38px;
          right: 75px;
        }

        .globeLabel.bottom {
          bottom: 36px;
          left: 80px;
        }

        .globeLabel.bottom i {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #46f4bd;
          box-shadow: 0 0 9px #46f4bd;
          margin-right: 5px;
        }

        .orbitReadout {
          position: absolute;
          bottom: 82px;
          right: 45px;
          display: grid;
          gap: 4px;
          z-index: 8;
        }

        .orbitReadout strong {
          font-size: 10px;
          letter-spacing: 0.18em;
          color: rgba(224, 252, 255, 0.55);
        }

        .orbitReadout small {
          font-size: 8px;
          letter-spacing: 0.12em;
          color: rgba(224, 252, 255, 0.34);
        }

        .orbitDot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #4cefc0;
          box-shadow: 0 0 10px #4cefc0;
          animation: blink 1.3s infinite;
        }

        :global(.geoHud) {
          width: 1px;
          height: 1px;
          position: relative;
          overflow: visible !important;
          pointer-events: none;
          transform: translate(-50%, -50%);
          transition: opacity 0.2s;
        }

        :global(.geoAnchor) {
          width: 9px;
          height: 9px;
          position: absolute;
          left: 0;
          top: 0;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          background: #c7fdff;
          box-shadow:
            0 0 0 4px rgba(53, 231, 255, 0.12),
            0 0 24px rgba(53, 231, 255, 0.95);
        }

        :global(.geoHalo) {
          position: absolute;
          left: 0;
          top: 0;
          width: 28px;
          height: 28px;
          transform: translate(-50%, -50%);
          border: 1px solid rgba(66, 232, 255, 0.32);
          border-radius: 50%;
          animation: geoPulse 1.8s ease-out infinite;
        }

        :global(.geoLine) {
          position: absolute;
          left: 0;
          top: -40px;
          width: 1px;
          height: 40px;
          background: linear-gradient(to top, #45eaff, rgba(69, 234, 255, 0));
          transform: translateX(-50%);
          opacity: 0.9;
        }

        :global(.geoArrow) {
          position: absolute;
          left: -3px;
          top: -43px;
          width: 7px;
          height: 7px;
          border-left: 1px solid #57eaff;
          border-top: 1px solid #57eaff;
          transform: rotate(45deg);
          opacity: 0.75;
        }

        :global(.geoCard) {
          position: absolute;
          left: 0;
          bottom: 40px;
          transform: translateX(-50%);
          min-width: 205px;
          max-width: 245px;
          padding: 12px 13px;
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid rgba(81, 227, 255, 0.3);
          background: linear-gradient(
            145deg,
            rgba(4, 20, 27, 0.96),
            rgba(2, 11, 16, 0.92)
          );
          backdrop-filter: blur(14px);
          border-radius: 8px;
          box-shadow:
            0 14px 38px rgba(0, 0, 0, 0.35),
            0 0 28px rgba(26, 211, 255, 0.09);
          white-space: nowrap;
          overflow: hidden;
        }

        :global(.geoCard::before) {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(80, 230, 255, 0.08),
            transparent
          );
          transform: translateX(-100%);
          animation: hudSweep 3.4s ease-in-out infinite;
        }

        :global(.geoIcon) {
          width: 35px;
          height: 35px;
          flex: 0 0 35px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(71, 231, 255, 0.32);
          color: #53e8ff;
          border-radius: 7px;
          background: rgba(26, 215, 255, 0.07);
          position: relative;
          z-index: 1;
        }

        :global(.iconMount svg) {
          width: 19px;
          height: 19px;
          stroke: currentColor;
          fill: none;
          stroke-width: 1.5;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        :global(.geoText) {
          position: relative;
          z-index: 1;
        }

        :global(.geoCard strong) {
          display: block;
          font-size: 11px;
          letter-spacing: 0.12em;
          color: #e8fdff;
        }

        :global(.geoCard small) {
          display: block;
          margin-top: 3px;
          font-size: 9px;
          letter-spacing: 0.13em;
          color: rgba(211, 249, 255, 0.52);
        }

        :global(.geoMeta) {
          margin-top: 5px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        :global(.geoCard em) {
          display: block;
          font-size: 9px;
          letter-spacing: 0.15em;
          font-style: normal;
          color: #5cf0c1;
        }

        :global(.geoCard em i) {
          display: inline-block;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #5cf0c1;
          margin-right: 4px;
          box-shadow: 0 0 7px #5cf0c1;
        }

        :global(.geoMeta b) {
          font-size: 8px;
          letter-spacing: 0.13em;
          color: rgba(213, 250, 255, 0.32);
          font-weight: 600;
        }

        @keyframes geoPulse {
          0% {
            transform: translate(-50%, -50%) scale(0.65);
            opacity: 0.8;
          }
          75%,
          100% {
            transform: translate(-50%, -50%) scale(1.45);
            opacity: 0;
          }
        }

        @keyframes hudSweep {
          35%,
          100% {
            transform: translateX(100%);
          }
        }

        .systems {
          padding: 105px 0 80px;
          position: relative;
          z-index: 5;
        }

        .sectionHeading,
        .peopleHeading {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 50px;
          margin-bottom: 38px;
        }

        h2 {
          margin: 12px 0 0;
          font-size: clamp(40px, 5vw, 70px);
          line-height: 0.92;
          letter-spacing: -0.055em;
        }

        h2 em {
          color: transparent;
          -webkit-text-stroke: 1px rgba(154, 242, 255, 0.65);
          font-style: normal;
        }

        .sectionHeading > p,
        .peopleHeading > p {
          max-width: 420px;
          margin: 0 0 5px;
          color: rgba(221, 250, 255, 0.56);
          line-height: 1.8;
          font-size: 13px;
        }

        .systemGrid {
          display: grid;
          grid-template-columns: 1.3fr 0.85fr 0.85fr;
          gap: 16px;
        }

        .systemCard {
          min-height: 420px;
          padding: 28px;
          display: flex;
          flex-direction: column;
          border: 1px solid rgba(107, 233, 255, 0.13);
          border-radius: 14px;
          overflow: hidden;
          position: relative;
          background: linear-gradient(
            145deg,
            rgba(10, 31, 39, 0.8),
            rgba(2, 12, 17, 0.95)
          );
          box-shadow: inset 0 1px rgba(255, 255, 255, 0.035);
          transition:
            transform 0.3s,
            border-color 0.3s,
            box-shadow 0.3s;
        }

        .systemCard:hover {
          transform: translateY(-4px);
          border-color: rgba(83, 232, 255, 0.28);
          box-shadow:
            0 22px 55px rgba(0, 0, 0, 0.24),
            inset 0 1px rgba(255, 255, 255, 0.04);
        }

        .cardTop {
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: rgba(220, 252, 255, 0.48);
          font-size: 10px;
          letter-spacing: 0.16em;
        }

        .cardTop b {
          color: #53e8ff;
          font-size: 12px;
          font-weight: 600;
        }

        .systemCopy {
          margin-top: auto;
          padding-top: 22px;
        }

        .systemCopy h3 {
          margin: 0;
          font-size: 28px;
          line-height: 1;
          letter-spacing: -0.04em;
        }

        .systemCopy p {
          margin: 12px 0 0;
          max-width: 500px;
          color: rgba(220, 250, 255, 0.58);
          font-size: 13px;
          line-height: 1.7;
        }

        .networkGraphic {
          height: 220px;
          flex: 0 0 220px;
          position: relative;
          margin-top: 20px;
          border: 1px solid rgba(85, 230, 255, 0.06);
          border-radius: 10px;
          background:
            radial-gradient(
              circle at 50% 50%,
              rgba(38, 216, 245, 0.08),
              transparent 44%
            ),
            rgba(1, 10, 15, 0.55);
          overflow: hidden;
        }

        .networkCore {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 88px;
          height: 88px;
          transform: translate(-50%, -50%);
          display: grid;
          place-items: center;
          border: 1px solid #53e8ff;
          border-radius: 50%;
          color: #5be9ff;
          font-size: 13px;
          letter-spacing: 0.15em;
          background: rgba(4, 24, 31, 0.9);
          box-shadow:
            0 0 35px rgba(34, 218, 255, 0.1),
            inset 0 0 24px rgba(34, 218, 255, 0.08);
          z-index: 2;
        }

        .networkCore i {
          position: absolute;
          width: 118px;
          height: 118px;
          border: 1px dashed rgba(83, 232, 255, 0.2);
          border-radius: 50%;
          animation: coreSpin 9s linear infinite;
        }

        @keyframes coreSpin {
          to {
            transform: rotate(360deg);
          }
        }

        .node {
          position: absolute;
          min-width: 70px;
          padding: 8px 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border: 1px solid rgba(80, 231, 255, 0.2);
          border-radius: 5px;
          color: rgba(222, 251, 255, 0.64);
          background: rgba(3, 18, 24, 0.85);
          font-size: 7px;
          letter-spacing: 0.12em;
          z-index: 3;
        }

        .node svg {
          color: #53e8ff;
        }

        .nodeA {
          top: 24%;
          left: 8%;
        }
        .nodeB {
          top: 24%;
          right: 8%;
        }
        .nodeC {
          bottom: 20%;
          left: 12%;
        }
        .nodeD {
          bottom: 20%;
          right: 12%;
        }

        .line {
          position: absolute;
          height: 1px;
          width: 42%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(65, 229, 255, 0.55),
            transparent
          );
          transform-origin: center;
          left: 29%;
          top: 50%;
          opacity: 0.7;
        }

        .lineA {
          transform: rotate(24deg);
        }
        .lineB {
          transform: rotate(-24deg);
        }
        .lineC {
          transform: rotate(156deg);
        }
        .lineD {
          transform: rotate(-156deg);
        }

        .dataParticle {
          position: absolute;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #54eaff;
          box-shadow: 0 0 12px #54eaff;
        }

        .p1 {
          left: 19%;
          top: 34%;
          animation: particleA 2.5s linear infinite;
        }
        .p2 {
          right: 18%;
          top: 61%;
          animation: particleB 2.9s linear infinite -0.7s;
        }
        .p3 {
          left: 44%;
          bottom: 13%;
          animation: particleC 3.1s linear infinite -1.2s;
        }

        @keyframes particleA {
          50% {
            transform: translate(110px, 30px);
            opacity: 0.25;
          }
        }

        @keyframes particleB {
          50% {
            transform: translate(-100px, -26px);
            opacity: 0.25;
          }
        }

        @keyframes particleC {
          50% {
            transform: translate(10px, -70px);
            opacity: 0.25;
          }
        }

        .statusGraphic {
          height: 220px;
          flex: 0 0 220px;
          margin-top: 20px;
          padding: 42px 0 0;
          display: flex;
          flex-direction: column;
          gap: 17px;
        }

        .statusBar {
          height: 4px;
          border-radius: 999px;
          background: rgba(98, 232, 255, 0.08);
          overflow: hidden;
        }

        .statusBar span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #2cbad2, #53e8ff);
          box-shadow: 0 0 14px rgba(83, 232, 255, 0.3);
          animation: statusPulse 2.4s ease-in-out infinite alternate;
        }

        .statusBar:nth-child(2) span {
          animation-delay: -0.4s;
        }
        .statusBar:nth-child(3) span {
          animation-delay: -0.9s;
        }
        .statusBar:nth-child(4) span {
          animation-delay: -1.3s;
        }

        @keyframes statusPulse {
          to {
            filter: brightness(1.25);
            transform: translateX(3px);
          }
        }

        .statusLegend {
          margin-top: 7px;
          display: flex;
          align-items: center;
          gap: 7px;
          color: #55edc0;
          font-size: 9px;
          letter-spacing: 0.14em;
        }

        .statusLegend i {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #55edc0;
          box-shadow: 0 0 9px #55edc0;
        }

        .shieldGraphic {
          height: 220px;
          flex: 0 0 220px;
          margin-top: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 15px;
          color: #4fe5ff;
        }

        .shieldIcon {
          width: 108px;
          height: 108px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(68, 226, 255, 0.24);
          clip-path: polygon(
            50% 0,
            91% 15%,
            84% 70%,
            50% 100%,
            16% 70%,
            9% 15%
          );
          background: radial-gradient(
            circle,
            rgba(42, 218, 255, 0.1),
            rgba(4, 18, 24, 0.6)
          );
          box-shadow:
            0 0 50px rgba(42, 218, 255, 0.1),
            inset 0 0 30px rgba(42, 218, 255, 0.05);
        }

        .shieldGraphic > span {
          font-size: 10px;
          letter-spacing: 0.2em;
          color: rgba(215, 252, 255, 0.58);
        }

        .features {
          padding: 120px 0 115px;
          display: grid;
          grid-template-columns: 0.8fr 1.2fr;
          gap: 70px;
          align-items: start;
          position: relative;
          z-index: 5;
        }

        .featureIntro {
          position: sticky;
          top: 110px;
        }

        .featureIntro > p {
          max-width: 330px;
          margin: 24px 0 0;
          color: rgba(221, 250, 255, 0.54);
          font-size: 13px;
          line-height: 1.75;
        }

        .featureList {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .featureCard {
          position: relative;
          min-height: 300px;
          padding: 22px;
          text-align: left;
          border: 1px solid rgba(107, 233, 255, 0.11);
          border-radius: 14px;
          background: linear-gradient(
            145deg,
            rgba(8, 27, 34, 0.72),
            rgba(2, 12, 17, 0.94)
          );
          color: #eaffff;
          cursor: pointer;
          overflow: hidden;
          transition: 0.35s;
          display: flex;
          flex-direction: column;
        }

        .featureCard:hover {
          transform: translateY(-5px);
          border-color: rgba(89, 232, 255, 0.3);
          box-shadow: 0 22px 55px rgba(0, 0, 0, 0.24);
        }

        .featureCard.active {
          border-color: rgba(83, 232, 255, 0.48);
          background: linear-gradient(
            145deg,
            rgba(10, 36, 45, 0.9),
            rgba(3, 14, 20, 0.96)
          );
          box-shadow:
            0 22px 60px rgba(0, 0, 0, 0.28),
            0 0 35px rgba(30, 211, 255, 0.06);
        }

        .featureCardTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .featureCardTop > b {
          font-size: 10px;
          color: #53e8ff;
          letter-spacing: 0.15em;
        }

        .featureIcon {
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(80, 231, 255, 0.22);
          border-radius: 9px;
          color: #5be9ff;
          background: rgba(37, 216, 245, 0.055);
        }

        .featureArrow {
          font-size: 18px;
          color: rgba(220, 252, 255, 0.42);
          transition: 0.25s;
        }

        .featureCard:hover .featureArrow,
        .featureCard.active .featureArrow {
          color: #53e8ff;
          transform: translate(2px, -2px);
        }

        .featureTitle {
          margin-top: auto;
          font-size: 21px;
          font-weight: 700;
          letter-spacing: -0.03em;
        }

        .featureText {
          display: block;
          margin-top: 11px;
          font-size: 12px;
          line-height: 1.7;
          color: rgba(220, 250, 255, 0.58);
          white-space: normal;
        }

        .featureAccent {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #53e8ff, transparent);
          transform: scaleX(0.35);
          opacity: 0.35;
          transition: 0.35s;
        }

        .featureCard.active .featureAccent {
          transform: scaleX(1);
          opacity: 1;
        }

        footer {
          padding: 28px 0 35px;
          border-top: 1px solid rgba(100, 231, 255, 0.1);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          color: rgba(215, 250, 255, 0.42);
          font-size: 10px;
          letter-spacing: 0.12em;
          position: relative;
          z-index: 5;
        }

        .footerBrand {
          display: flex;
          align-items: center;
          gap: 10px;
          color: rgba(231, 253, 255, 0.75);
        }

        .footerBrand strong {
          font-size: 10px;
          letter-spacing: 0.14em;
        }

        .stickAvatar {
          width: 170px;
          height: 210px;
          position: relative;
          z-index: 4;
          filter: drop-shadow(0 0 25px rgba(82, 231, 255, 0.12));
        }

        .stickHead {
          position: absolute;
          width: 78px;
          height: 78px;
          left: 50%;
          top: 18px;
          transform: translateX(-50%);
          border: 2px solid currentColor;
          border-radius: 50%;
          background: radial-gradient(
            circle at 40% 35%,
            rgba(213, 253, 255, 0.09),
            rgba(5, 18, 24, 0.92)
          );
          box-shadow:
            0 0 0 10px rgba(80, 231, 255, 0.025),
            0 0 35px rgba(80, 231, 255, 0.13);
        }

        .stickHead::after {
          content: "";
          position: absolute;
          width: 7px;
          height: 7px;
          left: 22px;
          top: 29px;
          border-radius: 50%;
          background: currentColor;
          box-shadow: 27px 0 0 currentColor;
          opacity: 0.55;
        }

        .stickBody {
          position: absolute;
          width: 74px;
          height: 95px;
          left: 50%;
          top: 92px;
          transform: translateX(-50%);
          border: 2px solid currentColor;
          border-bottom: 0;
          border-radius: 35px 35px 10px 10px;
          background: linear-gradient(
            180deg,
            rgba(80, 231, 255, 0.045),
            rgba(2, 13, 18, 0.75)
          );
        }

        .stickShoulder {
          position: absolute;
          width: 58px;
          height: 2px;
          top: 103px;
          background: currentColor;
          transform-origin: center;
          opacity: 0.85;
        }

        .stickShoulder.left {
          left: 20px;
          transform: rotate(48deg);
        }

        .stickShoulder.right {
          right: 20px;
          transform: rotate(-48deg);
        }

        .avatarScan {
          position: absolute;
          left: 15%;
          right: 15%;
          top: 46%;
          height: 1px;
          background: linear-gradient(
            90deg,
            transparent,
            currentColor,
            transparent
          );
          opacity: 0.45;
          animation: avatarScan 2.8s ease-in-out infinite;
        }

        @keyframes avatarScan {
          0%,
          100% {
            transform: translateY(-50px);
            opacity: 0;
          }
          50% {
            transform: translateY(55px);
            opacity: 0.55;
          }
        }

        .stickAvatar.cyan {
          color: #53e8ff;
        }
        .stickAvatar.muted {
          color: #72b7c1;
        }
        .stickAvatar.violet {
          color: #c2a9ff;
        }


        /* --------------------------------------------------------------
           CINEMATIC INTRO
           A short first-impression sequence before the page story begins.
        -------------------------------------------------------------- */
        html.introLocked,
        html.introLocked body {
          overflow: hidden;
        }

        .introScreen {
          position: fixed;
          inset: 0;
          z-index: 200;
          display: grid;
          place-items: center;
          overflow: hidden;
          background:
            radial-gradient(circle at 50% 44%, rgba(11, 111, 148, .20), transparent 25%),
            radial-gradient(circle at 18% 80%, rgba(27, 104, 150, .12), transparent 26%),
            #020a12;
          animation: introIn .65s ease both;
        }

        .introScreen.isExiting {
          pointer-events: none;
          animation: introOut .72s cubic-bezier(.76,0,.24,1) forwards;
        }


        .introVignette {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(circle at 50% 48%, transparent 25%, rgba(0,0,0,.22) 68%, rgba(0,0,0,.7) 100%);
        }

        .introHud {
          position: absolute;
          z-index: 3;
          display: flex;
          gap: 10px;
          align-items: center;
          color: rgba(143,205,229,.36);
          font-size: 7px;
          font-weight: 800;
          letter-spacing: .16em;
          text-transform: uppercase;
          opacity: 0;
          transition: opacity .7s ease, transform .7s ease;
        }
        .introHud b { color: rgba(83,225,184,.58); font-weight: 800; }
        .introHudTL { top: 34px; left: 38px; transform: translateX(-12px); }
        .introHudTR { top: 34px; right: 38px; transform: translateX(12px); }
        .introHudBL { bottom: 34px; left: 38px; transform: translateX(-12px); }
        .introHudBR { bottom: 34px; right: 38px; transform: translateX(12px); }
        .introScreen.phase-1 .introHud, .introScreen.phase-2 .introHud, .introScreen.phase-3 .introHud, .introScreen.phase-4 .introHud { opacity: 1; transform: translateX(0); }

        .introBeam {
          position: absolute;
          z-index: 1;
          width: 42vw;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(77,214,255,.4), transparent);
          box-shadow: 0 0 30px rgba(56,203,255,.3);
          opacity: 0;
          pointer-events: none;
        }
        .introBeamA { top: 42%; left: -10vw; transform: rotate(-18deg); animation: introBeamSweep 5.5s ease-in-out infinite; }
        .introBeamB { top: 58%; right: -10vw; transform: rotate(18deg); animation: introBeamSweep 6.2s ease-in-out 1.2s infinite reverse; }
        .introScreen.phase-2 .introBeam, .introScreen.phase-3 .introBeam, .introScreen.phase-4 .introBeam { opacity: 1; }

        .introSignalRow {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-top: 17px;
          color: rgba(135,191,212,.3);
          font-size: 6px;
          font-weight: 800;
          letter-spacing: .14em;
        }
        .introSignalRow span { display: flex; align-items: center; gap: 5px; }
        .introSignalRow i { width: 4px; height: 4px; border-radius: 50%; background: #45dfbb; box-shadow: 0 0 8px rgba(69,223,187,.7); animation: introStatusPulse 1.2s ease-in-out infinite; }
        .introSignalRow span:nth-child(2) i { animation-delay: .15s; }
        .introSignalRow span:nth-child(3) i { animation-delay: .3s; }
        .introSignalRow span:nth-child(4) i { animation-delay: .45s; }

        .introNoise {
          position: absolute;
          inset: 0;
          opacity: .12;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E");
          mix-blend-mode: screen;
          pointer-events: none;
        }

        .introGrid {
          position: absolute;
          inset: -20%;
          opacity: .18;
          background-image:
            linear-gradient(rgba(66, 174, 218, .08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(66, 174, 218, .08) 1px, transparent 1px);
          background-size: 54px 54px;
          transform: perspective(700px) rotateX(62deg) translateY(24%);
          transform-origin: center bottom;
          animation: introGridMove 7s linear infinite;
        }

        .introOrb {
          position: absolute;
          border-radius: 50%;
          filter: blur(50px);
          pointer-events: none;
        }

        .introOrbOne {
          width: 34vw;
          height: 34vw;
          top: -16vw;
          right: -8vw;
          background: rgba(0, 156, 211, .12);
        }

        .introOrbTwo {
          width: 30vw;
          height: 30vw;
          bottom: -18vw;
          left: -8vw;
          background: rgba(37, 90, 180, .13);
        }

        .introStars {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          opacity: .65;
        }

        .introStars i {
          --i: 0;
          position: absolute;
          left: calc((var(--i) * 37.7%) - 30%);
          top: calc((var(--i) * 19.3%) % 100%);
          width: 2px;
          height: 2px;
          border-radius: 50%;
          background: rgba(137, 222, 255, .65);
          box-shadow: 0 0 9px rgba(65, 205, 255, .5);
          animation: introStarFloat calc(3.2s + (var(--i) * .13s)) ease-in-out infinite alternate;
          animation-delay: calc(var(--i) * -.17s);
        }

        .introScan {
          position: absolute;
          left: -10%;
          width: 120%;
          height: 1px;
          pointer-events: none;
          background: linear-gradient(90deg, transparent, rgba(83, 214, 255, .28), transparent);
          box-shadow: 0 0 22px rgba(50, 201, 255, .2);
        }

        .introScanOne {
          top: 31%;
          animation: introScan 5.5s ease-in-out infinite;
        }

        .introScanTwo {
          top: 69%;
          opacity: .45;
          animation: introScan 7s ease-in-out 1.2s infinite reverse;
        }

        .introCenter {
          position: relative;
          z-index: 2;
          width: min(680px, 88vw);
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .introLogoWrap {
          position: relative;
          width: 118px;
          height: 118px;
          display: grid;
          place-items: center;
          margin-bottom: 28px;
          animation: introLogoIn 1.1s cubic-bezier(.2,.8,.2,1) .15s both;
        }

        .introLogo {
          width: 67px;
          height: 67px;
          object-fit: contain;
          filter: drop-shadow(0 0 22px rgba(30, 190, 255, .34));
        }

        .introRing {
          position: absolute;
          inset: 0;
          border: 1px solid rgba(67, 199, 240, .22);
          border-radius: 50%;
        }

        .introRingOuter {
          animation: introRing 3.2s linear infinite;
        }

        .introRingInner {
          inset: 13px;
          border-style: dashed;
          border-color: rgba(86, 207, 255, .35);
          animation: introRingReverse 5s linear infinite;
        }

        .introKicker {
          color: rgba(104, 202, 239, .72);
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .42em;
          margin-left: .42em;
          animation: introTextIn .8s ease .55s both;
        }

        .introTitle {
          margin-top: 18px;
          display: grid;
          gap: 2px;
          font-size: clamp(30px, 5vw, 62px);
          line-height: .98;
          letter-spacing: -.045em;
          font-weight: 300;
          color: #eaf9ff;
          animation: introTextIn .9s cubic-bezier(.2,.8,.2,1) .7s both;
        }

        .introTitle strong {
          color: #54d6ff;
          font-weight: 700;
          text-shadow: 0 0 32px rgba(38, 191, 255, .18);
        }

        .introSubtitle {
          max-width: 520px;
          margin: 17px auto 0;
          color: rgba(190, 221, 236, .55);
          font-size: 12px;
          line-height: 1.7;
          animation: introTextIn .8s ease .95s both;
        }

        .introBoot {
          width: min(470px, 78vw);
          margin-top: 42px;
          animation: introTextIn .8s ease 1.15s both;
        }

        .introBootTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
        }

        .introBootLabel,
        .introBootStatus,
        .introBootMeta {
          font-size: 7px;
          font-weight: 800;
          letter-spacing: .2em;
          color: rgba(145, 202, 226, .42);
        }

        .introBootLabel {
          text-align: left;
        }

        .introBootStatus {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: rgba(83, 225, 184, .72);
        }

        .introBootStatus i {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #53e1b8;
          box-shadow: 0 0 10px rgba(83, 225, 184, .9);
          animation: introStatusPulse 1.2s ease-in-out infinite;
        }

        .introBootLine {
          display: block;
          width: 100%;
          height: 2px;
          margin-top: 10px;
          overflow: hidden;
          background: rgba(83, 173, 214, .12);
        }

        .introBootLine i {
          display: block;
          width: 100%;
          height: 100%;
          transform-origin: left;
          background: linear-gradient(90deg, rgba(46, 198, 255, .15), #32c9ff, rgba(76, 239, 197, .75));
          box-shadow: 0 0 16px rgba(41, 202, 255, .7);
          animation: introBootProgress 2.2s cubic-bezier(.2,.7,.2,1) .85s both;
        }

        .introBootMeta {
          display: grid;
          grid-template-columns: repeat(3, 1fr) auto;
          gap: 8px;
          margin-top: 10px;
          font-size: 6px;
          letter-spacing: .14em;
        }

        .introBootMeta span {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .introBootMeta b {
          color: rgba(101, 211, 246, .65);
          font-size: 6px;
          font-weight: 800;
        }

        .introSkip {
          position: absolute;
          z-index: 4;
          right: 28px;
          bottom: 25px;
          border: 0;
          background: transparent;
          color: rgba(181, 216, 231, .42);
          font: 700 8px/1 inherit;
          letter-spacing: .18em;
          cursor: pointer;
          padding: 10px;
          transition: color .25s ease, transform .25s ease;
        }

        .introSkip:hover {
          color: #eaf9ff;
          transform: translateX(3px);
        }

        .introCorner {
          position: absolute;
          width: 70px;
          height: 70px;
          opacity: .45;
          border-color: rgba(75, 190, 236, .28);
        }

        .introCornerTL {
          top: 26px;
          left: 26px;
          border-top: 1px solid;
          border-left: 1px solid;
        }

        .introCornerBR {
          right: 26px;
          bottom: 26px;
          border-right: 1px solid;
          border-bottom: 1px solid;
        }


        .introScreen.phase-2 .introLogo { filter: drop-shadow(0 0 34px rgba(30, 190, 255, .6)); }
        .introScreen.phase-3 .introTitle strong { text-shadow: 0 0 42px rgba(38, 191, 255, .38); }
        .introScreen.phase-4 .introBootLine i { box-shadow: 0 0 24px rgba(41, 202, 255, .95); }

        @keyframes introIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes introOut {
          0% { opacity: 1; transform: scale(1); filter: blur(0); }
          100% { opacity: 0; transform: scale(1.035); filter: blur(10px); visibility: hidden; }
        }

        @keyframes introLogoIn {
          from { opacity: 0; transform: scale(.55) rotate(-15deg); }
          to { opacity: 1; transform: scale(1) rotate(0); }
        }

        @keyframes introRing {
          to { transform: rotate(360deg); }
        }

        @keyframes introRingReverse {
          to { transform: rotate(-360deg); }
        }

        @keyframes introTextIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes introBootProgress {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }

        @keyframes introGridMove {
          from { background-position: 0 0; }
          to { background-position: 0 54px; }
        }

        @keyframes introStarFloat {
          from { opacity: .18; transform: translate3d(0, 8px, 0) scale(.75); }
          to { opacity: .85; transform: translate3d(0, -10px, 0) scale(1.25); }
        }

        @keyframes introScan {
          0%, 100% { transform: translateY(-18vh); opacity: 0; }
          15% { opacity: .55; }
          50% { opacity: .8; }
          85% { opacity: .25; }
          100% { transform: translateY(18vh); }
        }

        @keyframes introBeamSweep {
          0%, 100% { transform: translateX(-18vw) rotate(-18deg); opacity: 0; }
          30% { opacity: .45; }
          60% { opacity: .75; }
          100% { transform: translateX(118vw) rotate(-18deg); opacity: 0; }
        }

        @keyframes introStatusPulse {
          0%, 100% { opacity: .45; transform: scale(.75); }
          50% { opacity: 1; transform: scale(1.2); }
        }

        .heroSignalStrip b {
          width: 100%;
          margin-left: 0;
          padding-top: 2px;
        }

        .heroTelemetry {
          right: 10px;
          bottom: 28px;
        }

        @media (max-width: 700px) {
          .introLogoWrap { width: 96px; height: 96px; margin-bottom: 22px; }
          .introLogo { width: 55px; height: 55px; }
          .introTitle { font-size: clamp(28px, 9vw, 44px); }
          .introSubtitle { font-size: 11px; padding: 0 16px; }
          .introBoot { margin-top: 32px; }
          .introBootTop { gap: 10px; }
          .introBootMeta { grid-template-columns: 1fr 1fr; }
          .introBootMeta span:nth-child(3) { display: none; }
          .introBootMeta b { text-align: right; }
          .introSkip { right: 14px; bottom: 14px; }
          .introHud { font-size: 5px; letter-spacing: .1em; }
          .introHudTL, .introHudBL { left: 16px; }
          .introHudTR, .introHudBR { right: 16px; }
          .introSignalRow { gap: 6px; }
          .introCorner { width: 45px; height: 45px; }
          .introCornerTL { top: 16px; left: 16px; }
          .introCornerBR { right: 16px; bottom: 16px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .introScreen,
          .introLogoWrap,
          .introKicker,
          .introTitle,
          .introSubtitle,
          .introBoot,
          .introBootLine i,
          .introRingOuter,
          .introRingInner,
          .introGrid,
          .introStars i,
          .introScanOne,
          .introScanTwo,
          .introBootStatus i,
          .introSignalRow i {
            animation: none !important;
          }
          .introBeam, .introHud { transition: none !important; animation: none !important; }
        }

        /* --------------------------------------------------------------
           SCROLL STORY LAYER
           Additive only: the existing layout/content stays untouched.
        -------------------------------------------------------------- */
        html {
          scroll-behavior: smooth;
          scroll-padding-top: 92px;
          overscroll-behavior-y: none;
        }

        body {
          scroll-behavior: smooth;
        }

        .page {
          --story-scroll: 0;
        }

        .storySection {
          scroll-snap-align: start;
          scroll-margin-top: 92px;
          will-change: opacity, transform;
        }

        .cursorGlow{position:fixed;left:var(--mx,50%);top:var(--my,50%);width:360px;height:360px;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,rgba(46,224,255,.075),transparent 68%);filter:blur(3px);pointer-events:none;z-index:1;mix-blend-mode:screen;transition:opacity .3s ease}.signalTicker{position:relative;z-index:4;overflow:hidden;border-top:1px solid rgba(99,232,255,.08);border-bottom:1px solid rgba(99,232,255,.08);background:rgba(2,11,15,.7);white-space:nowrap}.tickerTrack{display:flex;align-items:center;gap:18px;width:max-content;padding:11px 0;animation:ticker 34s linear infinite;color:rgba(205,247,255,.28);font-size:8px;letter-spacing:.22em}.tickerTrack i{width:3px;height:3px;border-radius:50%;background:#4eeaff;box-shadow:0 0 10px rgba(78,234,255,.8)}@keyframes ticker{to{transform:translateX(-50%)}}.menuButton,.mobileMenu{display:none}.finalCta{width:min(1400px,calc(100% - 64px));min-height:440px;margin:80px auto 90px;position:relative;overflow:hidden;border:1px solid rgba(102,231,255,.11);border-radius:18px;background:radial-gradient(circle at 80% 50%,rgba(61,221,255,.1),transparent 28%),linear-gradient(135deg,rgba(5,21,28,.92),rgba(2,9,13,.86));display:grid;grid-template-columns:1.15fr .85fr;align-items:center;padding:70px}.finalCtaGrid{position:absolute;inset:0;opacity:.23;background-image:linear-gradient(rgba(90,230,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(90,230,255,.06) 1px,transparent 1px);background-size:42px 42px;mask-image:linear-gradient(90deg,black,transparent 75%)}.finalCtaCopy{position:relative;z-index:2}.finalCta h2{margin:14px 0 20px;font-size:clamp(48px,6vw,82px);line-height:.9;letter-spacing:-.065em}.finalCta h2 em{font-style:normal;color:transparent;-webkit-text-stroke:1px rgba(132,239,255,.72)}.finalCta p{max-width:510px;color:rgba(220,250,255,.5);font-size:13px;line-height:1.8;margin:0 0 28px}.finalCtaCore{justify-self:end;width:260px;height:260px;border:1px solid rgba(86,231,255,.17);border-radius:50%;display:grid;place-items:center;position:relative;background:rgba(3,16,22,.65);box-shadow:0 0 80px rgba(40,215,255,.09),inset 0 0 50px rgba(40,215,255,.05)}.finalCtaCore img{width:108px;height:108px;object-fit:contain;filter:drop-shadow(0 0 22px rgba(70,232,255,.24));z-index:2}.finalCtaCore span{position:absolute;bottom:-28px;font-size:8px;letter-spacing:.18em;color:rgba(178,242,255,.34)}.ctaRing{position:absolute;border:1px solid rgba(80,230,255,.16);border-radius:50%}.ctaRingA{inset:20px;animation:spin 15s linear infinite}.ctaRingB{inset:-16px;border-style:dashed;border-color:rgba(176,148,255,.12);animation:spin 21s linear infinite reverse}
        @media (max-width:620px){.finalCta{margin:55px auto 65px;min-height:520px;padding:42px 22px}.finalCta h2{font-size:clamp(43px,12vw,64px)}.finalCtaCore{width:170px;height:170px}.finalCtaCore img{width:76px;height:76px}.cursorGlow{display:none}.tickerTrack{animation-duration:28s}}
        @media (prefers-reduced-motion: no-preference) {
          .page {
            scroll-snap-type: y proximity;
          }
        }

        .storyProgress {
          position: fixed;
          z-index: 40;
          left: 24px;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          align-items: stretch;
          gap: 13px;
          pointer-events: none;
        }

        .storyProgressLine {
          position: relative;
          width: 1px;
          min-height: 156px;
          overflow: hidden;
          background: rgba(80, 170, 220, .16);
        }

        .storyProgressFill {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: calc(100% * var(--story-scroll));
          transform-origin: top;
          background: linear-gradient(to bottom, #16b9ff, rgba(22, 185, 255, .1));
          box-shadow: 0 0 10px rgba(22, 185, 255, .55);
        }

        .storySteps {
          display: flex;
          flex-direction: column;
          gap: 13px;
          pointer-events: auto;
        }

        .storySteps a {
          position: relative;
          display: flex;
          align-items: center;
          gap: 8px;
          width: 108px;
          color: rgba(183, 211, 229, .38);
          text-decoration: none;
          transition: color .35s ease, transform .35s ease;
        }

        .storySteps a::before {
          content: "";
          width: 5px;
          height: 5px;
          flex: 0 0 5px;
          border: 1px solid rgba(73, 183, 235, .4);
          border-radius: 50%;
          background: #061b2c;
          box-shadow: 0 0 0 0 rgba(24, 177, 255, 0);
          transition: background .35s ease, box-shadow .35s ease, transform .35s ease;
        }

        .storySteps a span {
          font-size: 8px;
          letter-spacing: .16em;
          opacity: .55;
        }

        .storySteps a small {
          font-size: 7px;
          font-weight: 700;
          letter-spacing: .15em;
          white-space: nowrap;
        }

        .storySteps a:hover,
        .storySteps a.active {
          color: #eaf8ff;
          transform: translateX(3px);
        }

        .storySteps a.active::before {
          background: #18b7ff;
          border-color: #7cddff;
          transform: scale(1.35);
          box-shadow: 0 0 12px rgba(24, 183, 255, .9);
        }

        .scrollHint {
          position: fixed;
          z-index: 30;
          right: 30px;
          bottom: 28px;
          display: flex;
          align-items: center;
          gap: 10px;
          color: rgba(179, 215, 235, .52);
          font-size: 7px;
          font-weight: 700;
          letter-spacing: .2em;
          pointer-events: none;
          opacity: calc(1 - (var(--story-scroll) * 5));
          transition: opacity .2s ease;
        }

        .scrollHint i {
          position: relative;
          width: 34px;
          height: 1px;
          overflow: visible;
          background: rgba(100, 196, 239, .35);
        }

        .scrollHint i::after {
          content: "";
          position: absolute;
          right: 0;
          top: -2px;
          width: 5px;
          height: 5px;
          border-right: 1px solid #56caff;
          border-bottom: 1px solid #56caff;
          transform: rotate(45deg);
          animation: scrollArrow 1.5s ease-in-out infinite;
        }

        @keyframes scrollArrow {
          0%, 100% { transform: translateX(0) rotate(45deg); opacity: .35; }
          50% { transform: translateX(7px) rotate(45deg); opacity: 1; }
        }

        .storySection {
          --story-distance: 42px;
          position: relative;
          transition:
            opacity .9s cubic-bezier(.2,.7,.2,1),
            transform 1s cubic-bezier(.2,.7,.2,1),
            filter .9s ease;
        }

        .storySection:not(.storyVisible) {
          opacity: .18;
          transform: translate3d(0, var(--story-distance), 0);
          filter: blur(3px);
        }

        .storySection.storyVisible {
          opacity: 1;
          transform: translate3d(0, 0, 0);
          filter: blur(0);
        }

        .storySection .sectionHeading,
        .storySection .peopleHeading,
        .storySection .whatWeDo,
        .storySection .featureIntro {
          transition:
            opacity .85s ease .12s,
            transform .85s cubic-bezier(.2,.7,.2,1) .12s;
        }

        .storySection:not(.storyVisible) .sectionHeading,
        .storySection:not(.storyVisible) .peopleHeading,
        .storySection:not(.storyVisible) .whatWeDo,
        .storySection:not(.storyVisible) .featureIntro {
          opacity: 0;
          transform: translateY(28px);
        }

        .storySection.storyVisible .sectionHeading,
        .storySection.storyVisible .peopleHeading,
        .storySection.storyVisible .whatWeDo,
        .storySection.storyVisible .featureIntro {
          opacity: 1;
          transform: translateY(0);
        }

        .storySection .systemCard,
        .storySection .founderSpotlight,
        .storySection .leadProgrammerCard,
        .storySection .coFounderCard,
        .storySection .doGrid > div,
        .storySection .featureCard {
          transition:
            opacity .75s ease,
            transform .8s cubic-bezier(.2,.7,.2,1),
            border-color .35s ease,
            box-shadow .35s ease;
        }

        .storySection:not(.storyVisible) .systemCard,
        .storySection:not(.storyVisible) .founderSpotlight,
        .storySection:not(.storyVisible) .leadProgrammerCard,
        .storySection:not(.storyVisible) .coFounderCard,
        .storySection:not(.storyVisible) .doGrid > div,
        .storySection:not(.storyVisible) .featureCard {
          opacity: 0;
          transform: translateY(32px) scale(.985);
        }

        .storySection.storyVisible .systemCard,
        .storySection.storyVisible .founderSpotlight,
        .storySection.storyVisible .leadProgrammerCard,
        .storySection.storyVisible .coFounderCard,
        .storySection.storyVisible .doGrid > div,
        .storySection.storyVisible .featureCard {
          opacity: 1;
          transform: translateY(0) scale(1);
        }

        .storySection.storyVisible .systemCard:nth-child(2),
        .storySection.storyVisible .coFounderCard:nth-child(2),
        .storySection.storyVisible .doGrid > div:nth-child(2),
        .storySection.storyVisible .featureCard:nth-child(2) {
          transition-delay: .08s;
        }

        .storySection.storyVisible .systemCard:nth-child(3),
        .storySection.storyVisible .coFounderCard:nth-child(3),
        .storySection.storyVisible .doGrid > div:nth-child(3),
        .storySection.storyVisible .featureCard:nth-child(3) {
          transition-delay: .16s;
        }

        .storySection.storyVisible .coFounderCard:nth-child(4),
        .storySection.storyVisible .doGrid > div:nth-child(4),
        .storySection.storyVisible .featureCard:nth-child(4) {
          transition-delay: .24s;
        }

        .storySection.storyVisible .coFounderCard:nth-child(5),
        .storySection.storyVisible .doGrid > div:nth-child(5),
        .storySection.storyVisible .featureCard:nth-child(5) {
          transition-delay: .32s;
        }

        .storySection.storyVisible .coFounderCard:nth-child(6) {
          transition-delay: .40s;
        }

        .storySection.storyVisible .coFounderCard:nth-child(7) {
          transition-delay: .48s;
        }

        .storySection.storyVisible .coFounderCard:nth-child(8) {
          transition-delay: .56s;
        }

        .storySection.storyVisible .coFounderCard:nth-child(9) {
          transition-delay: .64s;
        }

        .hero.storySection {
          --story-distance: 0px;
        }

        .hero.storySection .heroCopy {
          animation: heroStoryIn 1.1s cubic-bezier(.2,.7,.2,1) both;
        }

        .hero.storySection .globeWrap {
          animation: heroGlobeIn 1.35s cubic-bezier(.2,.7,.2,1) .08s both;
        }

        @keyframes heroStoryIn {
          from { opacity: 0; transform: translateY(28px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes heroGlobeIn {
          from { opacity: 0; transform: translateY(40px) scale(.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @media (max-width: 980px) {
          .teamRoute { max-width: none; }
          .storyProgress {
            left: 14px;
          }

          .storySteps a {
            width: 8px;
          }

          .storySteps a span,
          .storySteps a small {
            display: none;
          }

          .scrollHint {
            right: 18px;
          }
        }

        @media (max-width: 700px) {
          .storyProgress {
            display: none;
          }

          .scrollHint {
            bottom: 18px;
            right: 16px;
          }

          .storySection:not(.storyVisible) {
            transform: translate3d(0, 24px, 0);
            filter: blur(2px);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          html {
            scroll-behavior: auto;
          }

          .storySection,
          .storySection .sectionHeading,
          .storySection .peopleHeading,
          .storySection .whatWeDo,
          .storySection .featureIntro,
          .storySection .systemCard,
          .storySection .founderSpotlight,
          .storySection .leadProgrammerCard,
          .storySection .coFounderCard,
          .storySection .doGrid > div,
          .storySection .featureCard,
          .hero.storySection .heroCopy,
          .hero.storySection .globeWrap {
            opacity: 1 !important;
            transform: none !important;
            filter: none !important;
            animation: none !important;
            transition: none !important;
          }

          .storyProgress,
          .scrollHint {
            display: none;
          }
        }

        @media (max-width: 1180px) {
          .navLinks {
            gap: 14px;
          }

          .hero {
            grid-template-columns: 1fr;
            min-height: auto;
          }

          .heroCopy {
            padding-bottom: 15px;
          }

          .globeWrap {
            margin-right: 0;
            height: 690px;
          }

          .globeStage {
            transform: scale(0.86);
          }

          .globeLabel.top {
            right: 11%;
          }

          .globeLabel.bottom {
            left: 11%;
          }

          .systemGrid {
            grid-template-columns: 1fr 1fr;
          }

          .systemCard.large {
            grid-column: 1 / -1;
          }

          .whatWeDo {
            grid-template-columns: 1fr;
            gap: 35px;
          }

          .features {
            grid-template-columns: 1fr;
            gap: 35px;
          }

          .featureIntro {
            position: static;
          }
        }

        @media (max-width: 800px) {
          .navLinks,.navRight .clock,.navRight .liveToggle{display:none}
          .navRight{margin-left:auto}
          .menuButton{display:flex;width:42px;height:42px;align-items:center;justify-content:center;flex-direction:column;gap:6px;border:1px solid rgba(106,231,255,.14);background:rgba(4,17,23,.72);color:#a9f6ff;border-radius:7px;cursor:pointer}
          .menuButton span{width:15px;height:1px;background:currentColor;transition:transform .3s ease}
          .menuButton.open span:first-child{transform:translateY(3.5px) rotate(45deg)}
          .menuButton.open span:last-child{transform:translateY(-3.5px) rotate(-45deg)}
          .mobileMenu{display:grid;position:absolute;left:0;right:0;top:calc(100% + 10px);padding:8px;border:1px solid rgba(105,231,255,.12);background:rgba(2,10,15,.95);backdrop-filter:blur(22px);transform:translateY(-10px);opacity:0;pointer-events:none;transition:opacity .3s ease,transform .3s ease;box-shadow:0 20px 50px rgba(0,0,0,.35)}
          .mobileMenu.open{opacity:1;transform:none;pointer-events:auto}
          .mobileMenu a{display:flex;justify-content:space-between;padding:16px 14px;border-bottom:1px solid rgba(105,231,255,.07);font-size:9px;letter-spacing:.18em;color:rgba(226,253,255,.68)}
          .mobileMenu a:last-child{border:0;color:#86efff}.mobileMenu b{font-weight:500;color:rgba(126,238,255,.35)}

          .navLinks,
          .clock {
            display: none;
          }

          .leadProgrammerCard,
          .founderSpotlight {
            grid-template-columns: 1fr;
          }

          .peopleHeading,
          .sectionHeading,
          .subsectionHeading {
            display: block;
          }

          .sectionHeading > p,
          .peopleHeading > p,
          .subsectionHeading > p {
            margin-top: 20px;
          }

          .coFounderGrid {
            grid-template-columns: 1fr 1fr;
          }
        }

        @media (max-width: 700px) {
          .heroTelemetry {
            display: none;
          }

          .nav,
          .hero,
          .systems,
          .features,
          .people,
          footer {
            width: calc(100% - 32px);
          }

          .nav {
            height: 72px;
          }

          .brand strong {
            font-size: 16px;
          }

          .brand small {
            font-size: 8px;
          }

          .navRight .liveToggle {
            display: none;
          }

          .loginButton {
            padding: 10px 11px;
            font-size: 9px;
          }

          .heroCopy {
            padding-top: 55px;
          }

          h1 {
            font-size: 53px;
          }

          .heroCopy > p {
            font-size: 13px;
          }

          .miniStats {
            gap: 18px;
            margin-top: 35px;
          }

          .miniStats strong {
            font-size: 19px;
          }

          .miniStats span {
            font-size: 8px;
          }

          .globeWrap {
            height: 510px;
            margin: -10px -18px 0;
          }

          .globeStage {
            width: 500px;
            height: 500px;
            transform: scale(0.9);
          }

          .globeLabel {
            font-size: 8px;
          }

          .globeLabel.top {
            top: 10px;
            right: 2%;
          }

          .globeLabel.bottom {
            bottom: 10px;
            left: 2%;
          }

          .orbitReadout {
            right: 24px;
            bottom: 55px;
          }

          .orbitReadout small {
            display: none;
          }

          :global(.geoCard) {
            min-width: 155px;
            padding: 8px;
            gap: 7px;
          }

          :global(.geoIcon) {
            width: 26px;
            height: 26px;
            flex-basis: 26px;
          }

          :global(.geoCard strong) {
            font-size: 8px;
          }

          :global(.geoCard small),
          :global(.geoCard em) {
            font-size: 7px;
          }

          :global(.geoLine) {
            height: 28px;
            top: -28px;
          }

          :global(.geoArrow) {
            top: -31px;
          }

          .systems {
            padding-top: 75px;
          }

          .systemGrid,
          .coFounderGrid,
          .doGrid,
          .featureList {
            grid-template-columns: 1fr;
          }

          .systemCard.large {
            grid-column: auto;
          }

          .systemCard {
            min-height: 390px;
          }

          .networkGraphic,
          .statusGraphic,
          .shieldGraphic {
            height: 190px;
            flex-basis: 190px;
          }

          .systemCopy h3 {
            font-size: 25px;
          }

          .systemCopy p {
            font-size: 12px;
          }

          .people {
            padding-top: 65px;
          }

          .founderVisual {
            min-height: 340px;
          }

          .leadProgrammerVisual {
            min-height: 310px;
          }

          .founderCopy,
          .leadProgrammerCopy {
            padding: 28px;
          }

          .founderIdentity h3 {
            font-size: 25px;
          }

          .founderCopy > p,
          .leadProgrammerCopy > p {
            font-size: 13px;
          }

          .coFounderCard {
            min-height: 250px;
          }

          .whatWeDo {
            margin-top: 60px;
          }

          .whatWeDo h3 {
            font-size: 30px;
          }

          .features {
            padding-top: 80px;
            padding-bottom: 75px;
          }

          .featureCard {
            min-height: 245px;
          }

          footer {
            flex-wrap: wrap;
            padding: 24px 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>
    </main>
  );
}
