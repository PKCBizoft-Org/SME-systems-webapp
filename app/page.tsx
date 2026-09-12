"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

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

const founder = {
  name: "Paul Kent Cairel",
  role: "FOUNDER / GROUP CREATOR",
  tag: "FOUNDING LEADERSHIP",
  description:
    "The founder and group creator of PKC BIZOFT, guiding the organization’s direction, culture and long-term vision.",
  icon: "leader",
};

const coFounders = [
  "Beah Polangcos Payot",
  "Feuna Crizeth Lagolos",
  "Hannah Clarice Apresa Luceñara",
  "Jullia Anne De Dios",
  "Louise Martin Erine",
  "Madronero Justine",
  "Mark Ivan Cainglet",
  "Prix Cys",
  "Ziskin Ian Bernabe",
];

const leadProgrammer = {
  name: "Lead Programmer — To Be Decided",
  role: "LEAD PROGRAMMER / SELECTION IN PROGRESS",
  tag: "TEAM SELECTION",
  description:
    "The team is currently choosing its Lead Programmer. The role will be finalized once the ongoing selection is complete.",
  icon: "code",
};

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

function StickAvatar({ accent = "cyan" }: { accent?: string }) {
  return (
    <div className={`stickAvatar ${accent}`}>
      <div className="stickHead" />
      <div className="stickBody" />
      <div className="stickShoulder left" />
      <div className="stickShoulder right" />
      <span className="avatarScan" />
    </div>
  );
}

export default function HomePage() {
  const globeRef = useRef<any>(null);
  const [activeFeature, setActiveFeature] = useState(0);
  const [networkLive, setNetworkLive] = useState(true);
  const [time, setTime] = useState("");

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
    const timer = window.setInterval(
      () => setActiveFeature((c) => (c + 1) % features.length),
      4200,
    );
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="page">
      <div className="ambient ambientOne" />
      <div className="ambient ambientTwo" />
      <div className="ambient ambientThree" />
      <div className="grid" />

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
          <a href="#people">People</a>
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
        </div>
      </nav>

      <section className="hero" id="network">
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
            <a href="#people" className="secondaryButton">
              MEET THE TEAM
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
              graticuleColor="rgba(43,220,255,.17)"
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
              htmlElement={(d: (typeof NETWORK_POINTS)[number]) => {
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
        </div>
      </section>

      <section className="systems" id="systems">
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

      <section className="people" id="people">
        <div className="peopleHeading">
          <div>
            <span className="sectionKicker">WHO WE ARE</span>
            <h2>
              People behind
              <br />
              <em>the system.</em>
            </h2>
          </div>
          <p>
            PKC BIZOFT is more than software. It is a founding team building
            practical systems, connecting people and turning business operations
            into something easier to see, manage and grow.
          </p>
        </div>

        <article className="founderSpotlight">
          <div className="founderVisual">
            <div className="founderGrid" />
            <div className="founderGlow" />
            <div className="founderBadge">
              <span className="badgeDot" /> FOUNDING LEADERSHIP
            </div>
            <StickAvatar accent="cyan" />
            <div className="founderOrbit founderOrbitA" />
            <div className="founderOrbit founderOrbitB" />
            <span className="founderNode fn1" />
            <span className="founderNode fn2" />
            <span className="founderNode fn3" />
          </div>
          <div className="founderCopy">
            <div className="leaderTop">
              <span>{founder.tag}</span>
              <b>01</b>
            </div>
            <div className="founderIdentity">
              <div className="founderIcon">
                <Icon name={founder.icon} size={24} />
              </div>
              <div>
                <h3>{founder.name}</h3>
                <small>{founder.role}</small>
              </div>
            </div>
            <p>{founder.description}</p>
            <div className="founderMeta">
              <span>
                <i /> PROFILE / PRIVATE
              </span>
              <span>ORIGIN NODE / PKC</span>
            </div>
          </div>
        </article>

        <div className="coFounderSection">
          <div className="subsectionHeading">
            <div>
              <span className="sectionKicker">CO-FOUNDERS</span>
              <h3>
                The founding team.
                <br />
                <em>Equal roots. Shared vision.</em>
              </h3>
            </div>
            <p>
              These are the people recognized as co-founders of PKC BIZOFT.
              Profiles remain intentionally private and use a neutral visual
              identity.
            </p>
          </div>
          <div className="coFounderGrid">
            {coFounders.map((name, index) => (
              <article className="coFounderCard" key={name}>
                <div className="coFounderTop">
                  <span>CO-FOUNDER</span>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                </div>
                <div className="coFounderVisual">
                  <div className="miniGrid" />
                  <StickAvatar accent={index % 2 === 0 ? "muted" : "violet"} />
                  <span className="coNode cn1" />
                  <span className="coNode cn2" />
                </div>
                <div className="coFounderInfo">
                  <div className="coFounderIcon">
                    <Icon name="cofounder" size={17} />
                  </div>
                  <div>
                    <strong>{name}</strong>
                    <small>PKC BIZOFT • CO-FOUNDER</small>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <article className="leadProgrammerCard">
          <div className="leadProgrammerVisual">
            <div className="programmerGrid" />
            <div className="programmerGlow" />
            <div className="codeOrb">
              <span>&lt;/&gt;</span>
            </div>
            <div className="codeOrbit codeOrbitA" />
            <div className="codeOrbit codeOrbitB" />
            <span className="codeNode cp1" />
            <span className="codeNode cp2" />
            <span className="codeNode cp3" />
          </div>
          <div className="leadProgrammerCopy">
            <div className="leaderTop">
              <span>{leadProgrammer.tag}</span>
              <b>02</b>
            </div>
            <div className="founderIdentity">
              <div className="founderIcon programmerIcon">
                <Icon name={leadProgrammer.icon} size={24} />
              </div>
              <div>
                <h3>Lead Programmer</h3>
                <small>{leadProgrammer.role}</small>
              </div>
            </div>
            <p>
              The team is currently choosing its Lead Programmer. The role will
              be finalized once the ongoing selection is complete.
            </p>
            <div className="selectionStatus">
              <span className="selectionPulse" /> TEAM SELECTION IN PROGRESS{" "}
              <b>● ACTIVE</b>
            </div>
            <div className="founderMeta">
              <span>POSITION / OPEN</span>
              <span>DECISION / TEAM</span>
            </div>
          </div>
        </article>

        <div className="whatWeDo">
          <div>
            <span className="sectionKicker">WHAT WE DO</span>
            <h3>
              We build the pieces
              <br />
              that keep business moving.
            </h3>
          </div>
          <div className="doGrid">
            <div>
              <span>01</span>
              <Icon name="clients" size={18} />
              <strong>BUSINESS SYSTEMS</strong>
              <p>
                Digital tools that organize customers, services and daily
                operations.
              </p>
            </div>
            <div>
              <span>02</span>
              <Icon name="server" size={18} />
              <strong>TECH & INFRASTRUCTURE</strong>
              <p>
                Connected infrastructure that keeps information and workflows
                moving.
              </p>
            </div>
            <div>
              <span>03</span>
              <Icon name="pulse" size={18} />
              <strong>AUTOMATION</strong>
              <p>
                Smarter workflows that reduce repetitive work and surface useful
                signals.
              </p>
            </div>
            <div>
              <span>04</span>
              <Icon name="shield" size={18} />
              <strong>SECURITY</strong>
              <p>
                Access-aware systems designed to keep business data separated
                and protected.
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="features" id="features">
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

      <footer>
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
          position: relative;
          z-index: 20;
          border-bottom: 1px solid rgba(122, 235, 255, 0.12);
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

        .people {
          padding: 100px 0 0;
          position: relative;
          z-index: 5;
        }

        .founderSpotlight {
          min-height: 500px;
          display: grid;
          grid-template-columns: 1.05fr 0.95fr;
          border: 1px solid rgba(107, 233, 255, 0.14);
          border-radius: 16px;
          background: linear-gradient(
            135deg,
            rgba(8, 29, 37, 0.9),
            rgba(2, 11, 16, 0.96)
          );
          overflow: hidden;
          position: relative;
          box-shadow:
            0 28px 90px rgba(0, 0, 0, 0.28),
            inset 0 1px rgba(255, 255, 255, 0.035);
        }

        .founderVisual,
        .leadProgrammerVisual {
          min-height: 500px;
          position: relative;
          display: grid;
          place-items: center;
          overflow: hidden;
          background:
            radial-gradient(
              circle at 50% 48%,
              rgba(24, 220, 255, 0.13),
              transparent 30%
            ),
            rgba(2, 12, 17, 0.65);
        }

        .founderGrid,
        .programmerGrid,
        .miniGrid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(66, 229, 255, 0.045) 1px, transparent 1px),
            linear-gradient(
              90deg,
              rgba(66, 229, 255, 0.045) 1px,
              transparent 1px
            );
          background-size: 30px 30px;
          mask-image: linear-gradient(to bottom, black, transparent 92%);
        }

        .founderGlow,
        .programmerGlow {
          position: absolute;
          width: 250px;
          height: 250px;
          border-radius: 50%;
          background: rgba(43, 221, 255, 0.12);
          filter: blur(45px);
        }

        .founderBadge {
          position: absolute;
          top: 24px;
          left: 25px;
          z-index: 5;
          font-size: 10px;
          letter-spacing: 0.17em;
          color: rgba(220, 252, 255, 0.5);
          padding: 8px 10px;
          border: 1px solid rgba(81, 232, 255, 0.14);
          border-radius: 999px;
          background: rgba(5, 21, 27, 0.7);
        }

        .badgeDot,
        .selectionPulse {
          display: inline-block;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #4cefc0;
          box-shadow: 0 0 10px #4cefc0;
          margin-right: 7px;
        }

        .founderOrbit,
        .codeOrbit {
          position: absolute;
          border: 1px solid rgba(83, 232, 255, 0.17);
          border-radius: 50%;
          pointer-events: none;
        }

        .founderOrbitA {
          width: 360px;
          height: 135px;
          transform: rotate(-17deg);
          animation: founderOrbitA 9s linear infinite;
        }

        .founderOrbitB {
          width: 310px;
          height: 115px;
          transform: rotate(26deg);
          animation: founderOrbitB 12s linear infinite;
        }

        @keyframes founderOrbitA {
          to {
            transform: rotate(343deg);
          }
        }

        @keyframes founderOrbitB {
          to {
            transform: rotate(-334deg);
          }
        }

        .founderNode,
        .codeNode,
        .coNode {
          position: absolute;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #52e7ff;
          box-shadow: 0 0 12px #52e7ff;
        }

        .fn1 {
          top: 23%;
          left: 18%;
        }
        .fn2 {
          top: 18%;
          right: 20%;
        }
        .fn3 {
          bottom: 20%;
          right: 17%;
        }

        .founderCopy,
        .leadProgrammerCopy {
          padding: 42px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          position: relative;
        }

        .leaderTop {
          display: flex;
          justify-content: space-between;
          margin-bottom: 18px;
          color: rgba(220, 252, 255, 0.42);
          font-size: 10px;
          letter-spacing: 0.17em;
        }

        .leaderTop b {
          color: #53e8ff;
        }

        .founderIdentity {
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .founderIcon {
          width: 52px;
          height: 52px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(80, 231, 255, 0.25);
          border-radius: 9px;
          color: #55e8ff;
          background: rgba(37, 216, 245, 0.06);
          flex: 0 0 52px;
        }

        .founderIdentity h3 {
          margin: 0 0 7px;
          font-size: 32px;
          letter-spacing: -0.04em;
        }

        .founderIdentity small {
          font-size: 10px;
          letter-spacing: 0.15em;
          color: #53e8ff;
        }

        .founderCopy > p,
        .leadProgrammerCopy > p {
          margin: 25px 0 28px;
          max-width: 510px;
          color: rgba(220, 250, 255, 0.62);
          line-height: 1.85;
          font-size: 14px;
        }

        .founderMeta {
          display: flex;
          justify-content: space-between;
          gap: 15px;
          border-top: 1px solid rgba(100, 231, 255, 0.1);
          padding-top: 15px;
          color: rgba(220, 252, 255, 0.42);
          font-size: 10px;
          letter-spacing: 0.15em;
        }

        .founderMeta i {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #4cefc0;
          box-shadow: 0 0 8px #4cefc0;
          margin-right: 5px;
        }

        .coFounderSection {
          margin-top: 72px;
        }

        .subsectionHeading {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 50px;
          margin-bottom: 24px;
        }

        .subsectionHeading h3 {
          margin: 11px 0 0;
          font-size: 36px;
          line-height: 1;
          letter-spacing: -0.045em;
        }

        .subsectionHeading h3 em {
          color: transparent;
          -webkit-text-stroke: 1px rgba(154, 242, 255, 0.55);
          font-style: normal;
        }

        .subsectionHeading > p {
          max-width: 420px;
          margin: 0;
          color: rgba(221, 250, 255, 0.55);
          line-height: 1.8;
          font-size: 13px;
        }

        .coFounderGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .coFounderCard {
          min-height: 265px;
          padding: 18px;
          border: 1px solid rgba(107, 233, 255, 0.1);
          border-radius: 12px;
          background: linear-gradient(
            145deg,
            rgba(8, 28, 36, 0.8),
            rgba(2, 12, 17, 0.92)
          );
          transition: 0.3s;
          position: relative;
          overflow: hidden;
        }

        .coFounderCard:hover {
          transform: translateY(-4px);
          border-color: rgba(89, 232, 255, 0.3);
          box-shadow: 0 20px 55px rgba(0, 0, 0, 0.25);
        }

        .coFounderTop {
          display: flex;
          justify-content: space-between;
          color: rgba(220, 252, 255, 0.42);
          font-size: 10px;
          letter-spacing: 0.15em;
        }

        .coFounderTop b {
          color: #53e8ff;
        }

        .coFounderVisual {
          height: 142px;
          margin-top: 12px;
          border: 1px solid rgba(94, 231, 255, 0.07);
          border-radius: 8px;
          display: grid;
          place-items: center;
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(circle, rgba(38, 215, 245, 0.07), transparent 48%),
            rgba(2, 12, 17, 0.7);
        }

        .coFounderVisual .stickAvatar {
          transform: scale(0.62);
        }

        .coNode.cn1 {
          top: 18%;
          left: 13%;
        }
        .coNode.cn2 {
          bottom: 16%;
          right: 15%;
        }

        .coFounderInfo {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 15px;
        }

        .coFounderIcon {
          width: 39px;
          height: 39px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(80, 231, 255, 0.18);
          border-radius: 7px;
          color: #53e8ff;
          background: rgba(37, 216, 245, 0.045);
          flex: 0 0 39px;
        }

        .coFounderInfo strong {
          display: block;
          font-size: 14px;
          line-height: 1.3;
        }

        .coFounderInfo small {
          display: block;
          margin-top: 5px;
          font-size: 10px;
          letter-spacing: 0.1em;
          color: rgba(220, 252, 255, 0.48);
        }

        .leadProgrammerCard {
          margin-top: 64px;
          display: grid;
          grid-template-columns: 0.85fr 1.15fr;
          min-height: 390px;
          border: 1px solid rgba(191, 168, 255, 0.16);
          border-radius: 16px;
          background: linear-gradient(
            145deg,
            rgba(16, 15, 30, 0.78),
            rgba(5, 10, 17, 0.9)
          );
          overflow: hidden;
          position: relative;
          box-shadow:
            0 25px 80px rgba(0, 0, 0, 0.24),
            inset 0 1px rgba(255, 255, 255, 0.03);
        }

        .leadProgrammerVisual {
          min-height: 390px;
          background:
            radial-gradient(
              circle at 50% 48%,
              rgba(170, 129, 255, 0.12),
              transparent 30%
            ),
            rgba(3, 9, 16, 0.72);
        }

        .programmerGlow {
          background: rgba(145, 100, 255, 0.13);
        }

        .codeOrb {
          width: 125px;
          height: 125px;
          border: 1px solid rgba(199, 170, 255, 0.55);
          border-radius: 50%;
          display: grid;
          place-items: center;
          color: #c9b1ff;
          font-size: 24px;
          letter-spacing: 0.06em;
          box-shadow:
            0 0 0 18px rgba(177, 135, 255, 0.025),
            0 0 60px rgba(151, 106, 255, 0.18),
            inset 0 0 35px rgba(151, 106, 255, 0.08);
          animation: codeOrb 3.5s ease-in-out infinite;
        }

        .codeOrb span {
          font-family: monospace;
        }

        .codeOrbitA {
          width: 320px;
          height: 105px;
          transform: rotate(20deg);
          border-color: rgba(197, 168, 255, 0.18);
          animation: codeOrbitA 10s linear infinite;
        }

        .codeOrbitB {
          width: 270px;
          height: 90px;
          transform: rotate(-28deg);
          border-color: rgba(197, 168, 255, 0.14);
          animation: codeOrbitB 13s linear infinite;
        }

        @keyframes codeOrb {
          50% {
            transform: scale(1.04);
          }
        }

        @keyframes codeOrbitA {
          to {
            transform: rotate(380deg);
          }
        }

        @keyframes codeOrbitB {
          to {
            transform: rotate(-388deg);
          }
        }

        .cp1 {
          top: 20%;
          left: 18%;
          background: #c7b1ff;
          box-shadow: 0 0 12px #c7b1ff;
        }
        .cp2 {
          top: 25%;
          right: 17%;
          background: #65eaff;
          box-shadow: 0 0 12px #65eaff;
        }
        .cp3 {
          bottom: 18%;
          right: 24%;
          background: #c7b1ff;
          box-shadow: 0 0 12px #c7b1ff;
        }

        .programmerIcon {
          color: #c6aaff;
          border-color: rgba(198, 168, 255, 0.28);
          background: rgba(157, 111, 255, 0.07);
        }

        .selectionStatus {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
          margin: 0 0 23px;
          padding: 13px 15px;
          border: 1px solid rgba(76, 239, 192, 0.15);
          border-radius: 8px;
          background: rgba(76, 239, 192, 0.035);
          color: #9ef6dc;
          font-size: 11px;
          letter-spacing: 0.12em;
        }

        .selectionStatus b {
          margin-left: auto;
          font-size: 10px;
          color: #58efc1;
        }

        .selectionPulse {
          animation: selectionBlink 1.7s infinite;
        }

        @keyframes selectionBlink {
          50% {
            opacity: 0.3;
            transform: scale(0.75);
          }
        }

        .whatWeDo {
          margin-top: 82px;
          padding-top: 0;
          display: grid;
          grid-template-columns: 0.8fr 1.2fr;
          gap: 70px;
        }

        .whatWeDo h3 {
          margin: 12px 0 0;
          font-size: 38px;
          line-height: 0.98;
          letter-spacing: -0.045em;
        }

        .doGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .doGrid > div {
          min-height: 190px;
          padding: 22px;
          border: 1px solid rgba(107, 233, 255, 0.11);
          border-radius: 12px;
          background: linear-gradient(
            145deg,
            rgba(8, 28, 36, 0.72),
            rgba(2, 12, 17, 0.9)
          );
          transition: 0.3s;
          position: relative;
        }

        .doGrid > div:hover {
          transform: translateY(-4px);
          border-color: rgba(89, 232, 255, 0.28);
          box-shadow: 0 18px 45px rgba(0, 0, 0, 0.22);
        }

        .doGrid > div > span {
          position: absolute;
          top: 16px;
          right: 18px;
          font-size: 9px;
          letter-spacing: 0.14em;
          color: rgba(220, 252, 255, 0.26);
        }

        .doGrid svg {
          color: #53e8ff;
          margin-top: 12px;
        }

        .doGrid strong {
          display: block;
          margin-top: 17px;
          font-size: 11px;
          letter-spacing: 0.15em;
        }

        .doGrid p {
          margin: 10px 0 0;
          font-size: 12px;
          line-height: 1.7;
          color: rgba(220, 250, 255, 0.54);
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
