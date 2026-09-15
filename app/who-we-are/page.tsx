"use client";

import { useEffect, useState } from "react";

const PKC_LOGO =
  "data:image/webp;base64,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";

const founder = {
  name: "Paul Kent Cairel",
  role: "FOUNDER / GROUP CREATOR",
  tag: "FOUNDING LEADERSHIP",
  description:
    "The founder and group creator of PKC BIZOFT, guiding the organization’s direction, culture and long-term vision.",
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
  role: "LEAD PROGRAMMER / SELECTION IN PROGRESS",
  description:
    "The team is currently choosing its Lead Programmer. The role will be finalized once the ongoing selection is complete.",
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
  if (name === "leader")
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5.5 20c.8-4 3-6 6.5-6s5.7 2 6.5 6" />
        <path d="M19 4v3M17.5 5.5h3" />
      </svg>
    );
  if (name === "cofounder")
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="2.8" />
        <circle cx="16" cy="8" r="2.8" />
        <path d="M3.8 19c.7-3.3 2.2-5 4.2-5s3.5 1.7 4.2 5M11.8 19c.7-3.3 2.2-5 4.2-5s3.5 1.7 4.2 5" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />
    </svg>
  );
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

export default function WhoWeArePage() {
  const [introVisible, setIntroVisible] = useState(true);
  const [exiting, setExiting] = useState(false);
  const [phase, setPhase] = useState(0);
  const [activeMember, setActiveMember] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const timers = [
      window.setTimeout(() => setPhase(1), 500),
      window.setTimeout(() => setPhase(2), 1250),
      window.setTimeout(() => setPhase(3), 2050),
      window.setTimeout(() => setPhase(4), 2900),
    ];
    const finish = window.setTimeout(() => {
      setExiting(true);
      window.setTimeout(() => setIntroVisible(false), 760);
    }, 4200);
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(finish);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("whoIntroLocked", introVisible);
    return () => document.documentElement.classList.remove("whoIntroLocked");
  }, [introVisible]);

  useEffect(() => {
    let frame = 0;
    let x = 0;
    let y = 0;
    const move = (event: PointerEvent) => {
      x = event.clientX;
      y = event.clientY;
      if (!frame)
        frame = window.requestAnimationFrame(() => {
          document.documentElement.style.setProperty("--who-mx", `${x}px`);
          document.documentElement.style.setProperty("--who-my", `${y}px`);
          frame = 0;
        });
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const reveal = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("revealed");
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    document
      .querySelectorAll<HTMLElement>("[data-reveal]")
      .forEach((el) => reveal.observe(el));
    return () => reveal.disconnect();
  }, []);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress =
        max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      document.documentElement.style.setProperty(
        "--who-scroll",
        String(progress),
      );
      setScrollProgress(progress);
      frame = 0;
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const closeIntro = () => {
    if (exiting) return;
    setExiting(true);
    window.setTimeout(() => setIntroVisible(false), 760);
  };

  return (
    <main className="whoPage">
      {introVisible && (
        <div
          className={`whoIntro phase-${phase} ${exiting ? "isExiting" : ""}`}
          role="status"
          aria-live="polite"
        >
          <div className="introNoise" />
          <div className="introGrid" />
          <div className="introVignette" />
          <div className="introOrb orbA" />
          <div className="introOrb orbB" />
          <div className="introOrb orbC" />
          <div className="introBeam beamA" />
          <div className="introBeam beamB" />
          <div className="hud hudTL">
            PKC // IDENTITY <b>ONLINE</b>
          </div>
          <div className="hud hudTR">WHO WE ARE // PEOPLE NETWORK</div>
          <div className="hud hudBL">FOUNDING TEAM / SECURE PROFILE</div>
          <div className="hud hudBR">NODE 01 / PHILIPPINES</div>
          <div className="introCenter">
            <div className="introLogo">
              <span className="logoRing ringA" />
              <span className="logoRing ringB" />
              <span className="logoRing ringC" />
              <div className="logoHalo" />
              <img src={PKC_LOGO} alt="PKC BIZOFT" />
            </div>
            <div className="introKicker">PKC BIZOFT / PEOPLE NETWORK</div>
            <h1>
              <span>THE PEOPLE</span>
              <strong>BEHIND THE SYSTEM.</strong>
            </h1>
            <p>
              Founding leadership, shared vision, and the people building PKC
              BIZOFT.
            </p>
            <div className="boot">
              <div className="bootTop">
                <span>INITIALIZING TEAM PROFILE</span>
                <b>
                  <i /> ONLINE
                </b>
              </div>
              <div className="bootLine">
                <i />
              </div>
              <div className="bootMeta">
                <span>IDENTITY</span>
                <span>FOUNDERS</span>
                <span>TEAM</span>
                <strong>100%</strong>
              </div>
            </div>
          </div>
          <button className="skip" type="button" onClick={closeIntro}>
            SKIP INTRO <span>↗</span>
          </button>
        </div>
      )}

      <div className="ambient ambientA" />
      <div className="ambient ambientB" />
      <div className="ambient ambientC" />
      <div className="pageGrid" />
      <div className="whoCursorGlow" aria-hidden="true" />
      <div className="scrollProgress">
        <i style={{ transform: `scaleX(${scrollProgress})` }} />
      </div>

      <nav className="nav" aria-label="Primary navigation">
        <a className="brand" href="/" aria-label="PKC BIZOFT home">
          <img src={PKC_LOGO} alt="PKC BIZOFT" />
          <span>
            <strong>PKC</strong>
            <small>BIZOFT</small>
          </span>
        </a>
        <div className="links">
          <a href="/">Home</a>
          <a className="active" href="/who-we-are">
            Who We Are
          </a>
          <a href="/#systems">Systems</a>
          <a href="/#features">Capabilities</a>
        </div>
        <div className="navRight">
          <span className="live">
            <i /> TEAM ONLINE
          </span>
          <a className="enter" href="/login">
            ENTER SYSTEM ↗
          </a>
          <button
            className={`menuButton ${mobileMenuOpen ? "open" : ""}`}
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle navigation"
            aria-expanded={mobileMenuOpen}
          >
            <span />
            <span />
          </button>
        </div>
        <div className={`mobileMenu ${mobileMenuOpen ? "open" : ""}`}>
          <a href="/" onClick={() => setMobileMenuOpen(false)}>
            HOME <b>01</b>
          </a>
          <a href="/who-we-are" onClick={() => setMobileMenuOpen(false)}>
            WHO WE ARE <b>02</b>
          </a>
          <a href="/#systems" onClick={() => setMobileMenuOpen(false)}>
            SYSTEMS <b>03</b>
          </a>
          <a href="/#features" onClick={() => setMobileMenuOpen(false)}>
            CAPABILITIES <b>04</b>
          </a>
          <a href="/login" onClick={() => setMobileMenuOpen(false)}>
            ENTER SYSTEM <b>↗</b>
          </a>
        </div>
      </nav>

      <section className="hero" data-reveal>
        <div className="heroCopy">
          <div className="eyebrow">
            <i /> COMPANY / WHO WE ARE
          </div>
          <div className="heroMeta">
            <span>PROFILE 01</span>
            <span>FOUNDING NETWORK</span>
            <b>CONNECTED</b>
          </div>
          <h2>
            The people <em>behind</em>
            <br />
            the system.
          </h2>
          <p>
            PKC BIZOFT is shaped by its founding team — people bringing
            direction, collaboration, and technical thinking together to build a
            connected business platform.
          </p>
          <div className="heroActions">
            <a className="primary" href="#founder">
              MEET THE FOUNDER <span>↓</span>
            </a>
            <a className="secondary" href="/#network">
              BACK TO NETWORK
            </a>
          </div>
        </div>
        <div className="heroVisual">
          <div className="visualGrid" />
          <div className="visualGlow" />
          <div className="orbit orbit1" />
          <div className="orbit orbit2" />
          <div className="orbit orbit3" />
          <span className="node n1" />
          <span className="node n2" />
          <span className="node n3" />
          <span className="node n4" />
          <div className="heroAvatar">
            <StickAvatar accent="cyan" />
          </div>
          <div className="visualLabel labelTL">
            <small>CORE PERSON</small>
            <b>FOUNDING NODE</b>
          </div>
          <div className="visualLabel labelBR">
            <small>STATUS</small>
            <b>CONNECTED / 01</b>
          </div>
          <div className="verticalCode">PKC / PEOPLE / 2026</div>
        </div>
      </section>

      <div className="peopleTicker" aria-hidden="true">
        <div className="peopleTickerTrack">
          <span>FOUNDER</span>
          <i />
          <span>CO-FOUNDERS × 09</span>
          <i />
          <span>TECHNICAL LEADERSHIP</span>
          <i />
          <span>ONE CONNECTED TEAM</span>
          <i />
          <span>FOUNDER</span>
          <i />
          <span>CO-FOUNDERS × 09</span>
          <i />
          <span>TECHNICAL LEADERSHIP</span>
          <i />
          <span>ONE CONNECTED TEAM</span>
          <i />
        </div>
      </div>

      <section className="teamSection" id="founder" data-reveal>
        <div className="sectionHeader">
          <div>
            <span>01 / FOUNDING LEADERSHIP</span>
            <h3>
              One origin.
              <br />
              <em>One direction.</em>
            </h3>
          </div>
          <p>
            The founder and group creator sits at the center of the PKC BIZOFT
            story, setting the direction while the wider founding team turns
            that vision into a working network.
          </p>
        </div>
        <article className="founderCard">
          <div className="founderVisual">
            <div className="visualGrid" />
            <div className="founderGlow" />
            <div className="founderBadge">
              <i /> FOUNDING LEADERSHIP
            </div>
            <div className="founderAvatar">
              <StickAvatar accent="cyan" />
            </div>
            <div className="founderOrbit fA" />
            <div className="founderOrbit fB" />
            <span className="node fn1" />
            <span className="node fn2" />
            <span className="node fn3" />
            <div className="cornerCode">
              ORIGIN / PKC
              <br />
              ROLE / 01
            </div>
          </div>
          <div className="founderCopy">
            <div className="cardTop">
              <span>{founder.tag}</span>
              <b>01</b>
            </div>
            <div className="identity">
              <div className="identityIcon">
                <Icon name="leader" size={24} />
              </div>
              <div>
                <h4>{founder.name}</h4>
                <small>{founder.role}</small>
              </div>
            </div>
            <p>{founder.description}</p>
            <div className="signal">
              <i /> FOUNDING NODE <b>ACTIVE</b>
            </div>
            <div className="meta">
              <span>PROFILE / PRIVATE</span>
              <span>ORIGIN NODE / PKC</span>
              <span>STATUS / ACTIVE</span>
            </div>
          </div>
        </article>
      </section>

      <section className="teamSection coSection" data-reveal>
        <div className="sectionHeader">
          <div>
            <span>02 / CO-FOUNDERS</span>
            <h3>
              The founding team.
              <br />
              <em>Shared roots.</em>
            </h3>
          </div>
          <p>
            These are the people recognized as co-founders of PKC BIZOFT. Each
            profile keeps the same neutral visual language used across the
            network while preserving personal privacy.
          </p>
        </div>
        <div className="coGrid">
          {coFounders.map((name, index) => (
            <button
              type="button"
              className={`coCard ${activeMember === index ? "active" : ""}`}
              key={name}
              onClick={() => setActiveMember(index)}
              aria-pressed={activeMember === index}
            >
              <div className="cardTop">
                <span>CO-FOUNDER</span>
                <b>{String(index + 1).padStart(2, "0")}</b>
              </div>
              <div className="coVisual">
                <div className="visualGrid" />
                <div className="coGlow" />
                <StickAvatar accent={index % 2 === 0 ? "muted" : "violet"} />
                <span className="node cn1" />
                <span className="node cn2" />
                <span className="scanLine" />
              </div>
              <div className="coInfo">
                <div className="identityIcon">
                  <Icon name="cofounder" size={17} />
                </div>
                <div>
                  <strong>{name}</strong>
                  <small>PKC BIZOFT • CO-FOUNDER</small>
                </div>
              </div>
              <div className="coFooter">
                <span>NODE {String(index + 1).padStart(2, "0")}</span>
                <b>
                  {activeMember === index ? "FOCUS / ACTIVE" : "VIEW PROFILE"}
                </b>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="teamSection leadSection" data-reveal>
        <div className="sectionHeader">
          <div>
            <span>03 / TECHNICAL LEADERSHIP</span>
            <h3>
              The role is open.
              <br />
              <em>The standard is high.</em>
            </h3>
          </div>
          <p>
            The Lead Programmer position is still in selection. This panel
            intentionally represents the role rather than assigning it to a
            person before the team makes its decision.
          </p>
        </div>
        <article className="leadCard">
          <div className="leadVisual">
            <div className="visualGrid" />
            <div className="programGlow" />
            <div className="codeOrb">
              <span>&lt;/&gt;</span>
            </div>
            <div className="codeOrbit cA" />
            <div className="codeOrbit cB" />
            <span className="node cp1" />
            <span className="node cp2" />
            <span className="node cp3" />
            <div className="codeReadout">
              ROLE / 03
              <br />
              SELECTION / ACTIVE
            </div>
          </div>
          <div className="leadCopy">
            <div className="cardTop">
              <span>TEAM SELECTION</span>
              <b>03</b>
            </div>
            <div className="identity">
              <div className="identityIcon programmer">
                <Icon name="code" size={24} />
              </div>
              <div>
                <h4>Lead Programmer</h4>
                <small>{leadProgrammer.role}</small>
              </div>
            </div>
            <p>{leadProgrammer.description}</p>
            <div className="selection">
              <i /> TEAM SELECTION IN PROGRESS <b>● ACTIVE</b>
            </div>
            <div className="meta">
              <span>POSITION / OPEN</span>
              <span>DECISION / TEAM</span>
              <span>STATUS / PENDING</span>
            </div>
          </div>
        </article>
      </section>

      <section className="constellation" data-reveal>
        <div className="constellationCopy">
          <span>PEOPLE / NETWORK MAP</span>
          <h3>
            Different roles.
            <br />
            <em>One connected system.</em>
          </h3>
          <p>
            The founder establishes the direction, the co-founders form the
            shared foundation, and the technical leadership role connects that
            vision to the product.
          </p>
          <a href="/#network" className="textLink">
            RETURN TO NETWORK <span>↗</span>
          </a>
        </div>
        <div className="map">
          <div className="mapGrid" />
          <div className="mapCore">
            <img src={PKC_LOGO} alt="PKC BIZOFT" />
          </div>
          <div className="mapLine ml1" />
          <div className="mapLine ml2" />
          <div className="mapLine ml3" />
          <div className="mapNode mapFounder">
            <b>01</b>
            <span>FOUNDER</span>
          </div>
          <div className="mapNode mapCo">
            <b>02</b>
            <span>CO-FOUNDERS</span>
          </div>
          <div className="mapNode mapLead">
            <b>03</b>
            <span>LEAD PROGRAMMER</span>
          </div>
          <div className="mapPulse" />
        </div>
      </section>

      <section className="peopleCta" data-reveal>
        <div className="ctaGrid" />
        <div>
          <span>04 / THE NEXT NODE</span>
          <h3>
            Good systems need
            <br />
            <em>good people.</em>
          </h3>
          <p>
            The people page is the human side of the network. The next step is
            seeing what the system can do for the work itself.
          </p>
        </div>
        <a href="/login" className="ctaButton">
          ENTER THE WORKSPACE <b>↗</b>
        </a>
      </section>

      <footer className="footer">
        <div className="footerBrand">
          <img src={PKC_LOGO} alt="PKC BIZOFT" />
          <span>
            <strong>PKC BIZOFT</strong>
            <small>PEOPLE / SYSTEMS / OPERATIONS</small>
          </span>
        </div>
        <div className="footerLinks">
          <a href="/">HOME</a>
          <a href="/#systems">SYSTEMS</a>
          <a href="/#features">CAPABILITIES</a>
          <a href="/login">ENTER SYSTEM</a>
        </div>
        <span className="copyright">© 2026 PKC</span>
      </footer>

      <style jsx>{`
        :global(*) {
          box-sizing: border-box;
        }
        :global(html) {
          scroll-behavior: smooth;
          scroll-padding-top: 88px;
          overscroll-behavior-y: none;
          background: #02080c;
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
        :global(html.whoIntroLocked),
        :global(html.whoIntroLocked body) {
          overflow: hidden;
        }
        .whoPage {
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(
              circle at 75% 15%,
              rgba(0, 210, 255, 0.11),
              transparent 26%
            ),
            radial-gradient(
              circle at 8% 68%,
              rgba(0, 105, 160, 0.1),
              transparent 28%
            ),
            #02080c;
        }
        .pageGrid {
          position: fixed;
          inset: 0;
          pointer-events: none;
          opacity: 0.13;
          background-image:
            linear-gradient(rgba(50, 220, 255, 0.045) 1px, transparent 1px),
            linear-gradient(
              90deg,
              rgba(50, 220, 255, 0.045) 1px,
              transparent 1px
            );
          background-size: 52px 52px;
          mask-image: linear-gradient(to bottom, black, transparent 90%);
        }
        .ambient {
          position: fixed;
          width: 520px;
          height: 520px;
          border-radius: 50%;
          filter: blur(110px);
          opacity: 0.1;
          pointer-events: none;
          animation: drift 12s ease-in-out infinite alternate;
        }
        .ambientA {
          top: 8%;
          right: -220px;
          background: #00d9ff;
        }
        .ambientB {
          top: 55%;
          left: -260px;
          background: #007ca8;
          animation-delay: -4s;
        }
        .ambientC {
          top: 72%;
          right: 15%;
          background: #713bff;
          animation-delay: -8s;
          opacity: 0.06;
        }
        @keyframes drift {
          to {
            transform: translate3d(-55px, 35px, 0) scale(1.08);
          }
        }
        @keyframes blink {
          50% {
            opacity: 0.3;
            transform: scale(0.7);
          }
        }
        .scrollProgress {
          position: fixed;
          z-index: 100;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: rgba(105, 230, 255, 0.06);
        }
        .scrollProgress i {
          display: block;
          height: 100%;
          transform-origin: left;
          background: linear-gradient(90deg, #45eaff, #8d7aff);
          box-shadow: 0 0 14px rgba(69, 234, 255, 0.7);
        }
        .nav {
          width: min(1400px, calc(100% - 64px));
          height: 82px;
          margin: auto;
          position: sticky;
          top: 0;
          z-index: 80;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(122, 235, 255, 0.12);
          background: linear-gradient(
            180deg,
            rgba(2, 8, 12, 0.95),
            rgba(2, 8, 12, 0.7)
          );
          backdrop-filter: blur(18px) saturate(125%);
          -webkit-backdrop-filter: blur(18px) saturate(125%);
        }
        .brand,
        .brand span,
        .links,
        .navRight,
        .live,
        .enter,
        .heroMeta,
        .heroActions,
        .cardTop,
        .identity,
        .signal,
        .meta,
        .coInfo,
        .coFooter,
        .footerBrand,
        .footerLinks {
          display: flex;
          align-items: center;
        }
        .brand {
          gap: 11px;
        }
        .brand img {
          width: 34px;
          height: 34px;
          object-fit: contain;
          filter: drop-shadow(0 0 12px rgba(57, 228, 255, 0.2));
        }
        .brand span {
          gap: 6px;
        }
        .brand strong {
          font-size: 18px;
          letter-spacing: 0.12em;
        }
        .brand small {
          font-size: 10px;
          letter-spacing: 0.24em;
          opacity: 0.5;
        }
        .links {
          gap: 25px;
        }
        .links a {
          font-size: 10px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          opacity: 0.5;
          transition: 0.25s;
        }
        .links a:hover,
        .links a.active {
          opacity: 1;
          color: #53e8ff;
        }
        .links a.active {
          text-shadow: 0 0 18px rgba(83, 232, 255, 0.3);
        }
        .navRight {
          gap: 12px;
        }
        .live {
          gap: 7px;
          font-size: 8px;
          letter-spacing: 0.14em;
          color: rgba(221, 250, 255, 0.48);
        }
        .live i {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #46f4bd;
          box-shadow: 0 0 10px #46f4bd;
          animation: blink 1.6s infinite;
        }
        .enter,
        .primary {
          background: #bff9ff;
          color: #031017;
          padding: 12px 15px;
          border-radius: 5px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.13em;
          transition: 0.25s;
        }
        .enter:hover,
        .primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 32px rgba(40, 222, 255, 0.16);
        }
        .hero {
          width: min(1400px, calc(100% - 64px));
          min-height: 700px;
          margin: auto;
          display: grid;
          grid-template-columns: 0.86fr 1.14fr;
          align-items: center;
          gap: 30px;
          position: relative;
          z-index: 3;
        }
        .heroCopy {
          padding: 85px 0 95px;
        }
        .eyebrow {
          display: flex;
          align-items: center;
          gap: 9px;
          color: #53e8ff;
          font-size: 10px;
          letter-spacing: 0.23em;
          font-weight: 700;
        }
        .eyebrow i {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #43efc1;
          box-shadow: 0 0 12px #43efc1;
          animation: blink 1.6s infinite;
        }
        .heroMeta {
          gap: 14px;
          margin-top: 22px;
          font-size: 8px;
          letter-spacing: 0.16em;
          color: rgba(221, 250, 255, 0.35);
        }
        .heroMeta b {
          margin-left: auto;
          color: rgba(120, 241, 255, 0.78);
          font-weight: 700;
        }
        .hero h2 {
          margin: 22px 0;
          font-size: clamp(52px, 6vw, 88px);
          line-height: 0.9;
          letter-spacing: -0.065em;
          max-width: 720px;
        }
        .hero h2 em {
          color: transparent;
          -webkit-text-stroke: 1px rgba(150, 244, 255, 0.72);
          font-style: normal;
        }
        .heroCopy > p {
          max-width: 540px;
          font-size: 14px;
          line-height: 1.85;
          color: rgba(224, 250, 255, 0.64);
          margin: 0 0 28px;
        }
        .heroActions {
          gap: 10px;
          flex-wrap: wrap;
        }
        .secondary {
          padding: 12px 15px;
          border: 1px solid rgba(134, 237, 255, 0.2);
          border-radius: 5px;
          font-size: 10px;
          letter-spacing: 0.13em;
          color: rgba(225, 253, 255, 0.68);
          transition: 0.25s;
        }
        .secondary:hover {
          border-color: rgba(134, 237, 255, 0.6);
          color: #fff;
        }
        .heroVisual {
          min-height: 570px;
          position: relative;
          display: grid;
          place-items: center;
          border: 1px solid rgba(107, 233, 255, 0.12);
          border-radius: 18px;
          overflow: hidden;
          background:
            radial-gradient(
              circle at 50% 48%,
              rgba(24, 220, 255, 0.12),
              transparent 31%
            ),
            linear-gradient(
              145deg,
              rgba(8, 29, 37, 0.72),
              rgba(2, 11, 16, 0.95)
            );
          box-shadow:
            0 30px 100px rgba(0, 0, 0, 0.25),
            inset 0 1px rgba(255, 255, 255, 0.035);
        }
        .visualGrid,
        .mapGrid {
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
        .visualGlow {
          width: 260px;
          height: 260px;
          border-radius: 50%;
          background: rgba(43, 221, 255, 0.12);
          filter: blur(50px);
          position: absolute;
          animation: glow 4s ease-in-out infinite;
        }
        @keyframes glow {
          50% {
            transform: scale(1.12);
            opacity: 0.7;
          }
        }
        .orbit {
          position: absolute;
          border: 1px solid rgba(83, 232, 255, 0.16);
          border-radius: 50%;
          pointer-events: none;
        }
        .orbit1 {
          width: 450px;
          height: 170px;
          transform: rotate(-17deg);
          animation: orbit1 11s linear infinite;
        }
        .orbit2 {
          width: 350px;
          height: 130px;
          transform: rotate(32deg);
          animation: orbit2 14s linear infinite reverse;
        }
        .orbit3 {
          width: 560px;
          height: 270px;
          transform: rotate(75deg);
          border-color: rgba(190, 155, 255, 0.08);
          animation: orbit3 18s linear infinite;
        }
        @keyframes orbit1 {
          to {
            transform: rotate(343deg);
          }
        }
        @keyframes orbit2 {
          to {
            transform: rotate(-328deg);
          }
        }
        @keyframes orbit3 {
          to {
            transform: rotate(435deg);
          }
        }
        .heroAvatar,
        .founderAvatar {
          position: relative;
          z-index: 5;
          display: grid;
          place-items: center;
        }
        .stickAvatar {
          width: 170px;
          height: 240px;
          position: relative;
          filter: drop-shadow(0 0 24px rgba(75, 229, 255, 0.12));
          animation: avatarFloat 4.5s ease-in-out infinite;
        }
        @keyframes avatarFloat {
          50% {
            transform: translateY(-8px);
          }
        }
        .stickHead {
          width: 64px;
          height: 64px;
          border: 1px solid rgba(160, 247, 255, 0.65);
          border-radius: 50%;
          position: absolute;
          top: 16px;
          left: 53px;
          background:
            radial-gradient(
              circle at 35% 30%,
              rgba(182, 249, 255, 0.2),
              transparent 40%
            ),
            rgba(7, 31, 39, 0.72);
          box-shadow: 0 0 40px rgba(44, 222, 255, 0.12);
        }
        .stickBody {
          position: absolute;
          top: 88px;
          left: 81px;
          width: 8px;
          height: 106px;
          border-radius: 5px;
          background: linear-gradient(
            to bottom,
            rgba(154, 246, 255, 0.85),
            rgba(49, 150, 176, 0.35)
          );
          box-shadow: 0 0 16px rgba(50, 226, 255, 0.25);
        }
        .stickShoulder {
          position: absolute;
          top: 96px;
          width: 62px;
          height: 2px;
          background: rgba(132, 242, 255, 0.72);
          box-shadow: 0 0 10px rgba(52, 221, 255, 0.22);
        }
        .stickShoulder.left {
          left: 24px;
          transform: rotate(25deg);
        }
        .stickShoulder.right {
          right: 22px;
          transform: rotate(-25deg);
        }
        .avatarScan {
          position: absolute;
          left: 38px;
          right: 38px;
          top: 55px;
          height: 1px;
          background: rgba(92, 236, 255, 0.75);
          box-shadow: 0 0 12px rgba(92, 236, 255, 0.6);
          animation: scan 2.4s linear infinite;
        }
        @keyframes scan {
          0% {
            transform: translateY(-20px);
            opacity: 0;
          }
          15%,
          80% {
            opacity: 1;
          }
          100% {
            transform: translateY(145px);
            opacity: 0;
          }
        }
        .node {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #55eaff;
          box-shadow: 0 0 14px rgba(85, 234, 255, 0.8);
          position: absolute;
          animation: nodePulse 2.4s ease-in-out infinite;
        }
        @keyframes nodePulse {
          50% {
            transform: scale(1.6);
            opacity: 0.5;
          }
        }
        .n1 {
          top: 23%;
          left: 18%;
        }
        .n2 {
          top: 31%;
          right: 15%;
          animation-delay: 0.5s;
        }
        .n3 {
          bottom: 20%;
          left: 21%;
          animation-delay: 1s;
        }
        .n4 {
          bottom: 27%;
          right: 20%;
          animation-delay: 1.5s;
        }
        .visualLabel {
          position: absolute;
          z-index: 8;
          display: grid;
          gap: 4px;
          padding: 10px 12px;
          border: 1px solid rgba(91, 232, 255, 0.12);
          background: rgba(3, 15, 21, 0.68);
          backdrop-filter: blur(10px);
          font-size: 8px;
          letter-spacing: 0.14em;
        }
        .visualLabel small {
          color: rgba(220, 252, 255, 0.34);
        }
        .visualLabel b {
          color: rgba(157, 244, 255, 0.82);
          font-size: 9px;
        }
        .labelTL {
          top: 22px;
          left: 22px;
        }
        .labelBR {
          right: 22px;
          bottom: 22px;
        }
        .verticalCode {
          position: absolute;
          right: 16px;
          top: 50%;
          writing-mode: vertical-rl;
          font-size: 8px;
          letter-spacing: 0.24em;
          color: rgba(157, 244, 255, 0.24);
        }
        .teamSection {
          width: min(1400px, calc(100% - 64px));
          margin: 0 auto;
          padding: 100px 0 0;
          position: relative;
          z-index: 3;
        }
        .sectionHeader {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 50px;
          margin-bottom: 38px;
        }
        .sectionHeader > div > span,
        .constellationCopy > span {
          color: #53e8ff;
          font-size: 10px;
          letter-spacing: 0.22em;
          font-weight: 700;
        }
        .sectionHeader h3,
        .constellation h3 {
          margin: 12px 0 0;
          font-size: clamp(40px, 5vw, 68px);
          line-height: 0.92;
          letter-spacing: -0.055em;
        }
        .sectionHeader h3 em,
        .constellation h3 em {
          color: transparent;
          -webkit-text-stroke: 1px rgba(154, 242, 255, 0.65);
          font-style: normal;
        }
        .sectionHeader > p {
          max-width: 470px;
          margin: 0 0 4px;
          color: rgba(221, 250, 255, 0.54);
          font-size: 13px;
          line-height: 1.8;
        }
        .founderCard,
        .leadCard {
          min-height: 500px;
          display: grid;
          grid-template-columns: 1.05fr 0.95fr;
          border: 1px solid rgba(107, 233, 255, 0.14);
          border-radius: 16px;
          overflow: hidden;
          background: linear-gradient(
            135deg,
            rgba(8, 29, 37, 0.9),
            rgba(2, 11, 16, 0.96)
          );
          box-shadow:
            0 28px 90px rgba(0, 0, 0, 0.28),
            inset 0 1px rgba(255, 255, 255, 0.035);
        }
        .founderVisual,
        .leadVisual {
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
        .founderGlow {
          position: absolute;
          width: 280px;
          height: 280px;
          border-radius: 50%;
          background: rgba(43, 221, 255, 0.12);
          filter: blur(45px);
          animation: glow 4s ease-in-out infinite;
        }
        .founderBadge {
          position: absolute;
          top: 24px;
          left: 25px;
          z-index: 7;
          padding: 8px 10px;
          border: 1px solid rgba(81, 232, 255, 0.14);
          border-radius: 999px;
          background: rgba(5, 21, 27, 0.72);
          font-size: 10px;
          letter-spacing: 0.17em;
          color: rgba(220, 252, 255, 0.5);
        }
        .founderBadge i,
        .signal i,
        .selection i {
          display: inline-block;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #4cefc0;
          box-shadow: 0 0 10px #4cefc0;
          margin-right: 7px;
          animation: blink 1.5s infinite;
        }
        .founderOrbit {
          position: absolute;
          border: 1px solid rgba(83, 232, 255, 0.17);
          border-radius: 50%;
        }
        .fA {
          width: 390px;
          height: 145px;
          transform: rotate(-17deg);
          animation: fA 10s linear infinite;
        }
        .fB {
          width: 310px;
          height: 105px;
          transform: rotate(31deg);
          animation: fB 13s linear infinite reverse;
        }
        @keyframes fA {
          to {
            transform: rotate(343deg);
          }
        }
        @keyframes fB {
          to {
            transform: rotate(-329deg);
          }
        }
        .cornerCode,
        .codeReadout {
          position: absolute;
          right: 22px;
          bottom: 22px;
          font-size: 8px;
          line-height: 1.7;
          letter-spacing: 0.16em;
          color: rgba(153, 242, 255, 0.3);
          text-align: right;
        }
        .founderCopy,
        .leadCopy {
          padding: 54px 50px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .cardTop {
          justify-content: space-between;
          color: rgba(220, 252, 255, 0.42);
          font-size: 10px;
          letter-spacing: 0.16em;
        }
        .cardTop b {
          color: #53e8ff;
          font-size: 12px;
        }
        .identity {
          gap: 13px;
          margin-top: 34px;
        }
        .identityIcon {
          width: 50px;
          height: 50px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(80, 231, 255, 0.18);
          border-radius: 9px;
          color: #53e8ff;
          background: rgba(37, 216, 245, 0.045);
          flex: 0 0 50px;
        }
        .identity h4 {
          margin: 0;
          font-size: 25px;
          letter-spacing: -0.03em;
        }
        .identity small {
          display: block;
          margin-top: 7px;
          color: rgba(220, 252, 255, 0.42);
          font-size: 9px;
          letter-spacing: 0.13em;
        }
        .founderCopy > p,
        .leadCopy > p {
          margin: 28px 0;
          color: rgba(220, 250, 255, 0.58);
          font-size: 13px;
          line-height: 1.9;
          max-width: 560px;
        }
        .signal,
        .selection {
          padding: 11px 13px;
          border: 1px solid rgba(83, 232, 255, 0.1);
          border-radius: 7px;
          color: rgba(220, 252, 255, 0.45);
          font-size: 8px;
          letter-spacing: 0.14em;
          background: rgba(6, 25, 32, 0.45);
        }
        .signal b,
        .selection b {
          margin-left: auto;
          color: #8ef6d3;
        }
        .meta {
          gap: 18px;
          flex-wrap: wrap;
          margin-top: 26px;
          color: rgba(220, 252, 255, 0.28);
          font-size: 8px;
          letter-spacing: 0.12em;
        }
        .coSection {
          padding-top: 115px;
        }
        .coGrid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 13px;
        }
        .coCard {
          text-align: left;
          min-height: 300px;
          padding: 18px;
          border: 1px solid rgba(107, 233, 255, 0.1);
          border-radius: 12px;
          background: linear-gradient(
            145deg,
            rgba(8, 28, 36, 0.8),
            rgba(2, 12, 17, 0.92)
          );
          color: inherit;
          cursor: pointer;
          transition:
            transform 0.35s,
            border-color 0.35s,
            box-shadow 0.35s;
          position: relative;
          overflow: hidden;
        }
        .coCard:hover,
        .coCard.active {
          transform: translateY(-7px);
          border-color: rgba(89, 232, 255, 0.3);
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
        }
        .coCard.active {
          box-shadow:
            0 0 0 1px rgba(89, 232, 255, 0.06),
            0 24px 60px rgba(0, 0, 0, 0.25),
            inset 0 0 40px rgba(46, 218, 245, 0.035);
        }
        .coVisual {
          height: 150px;
          margin-top: 13px;
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
        .coVisual .stickAvatar {
          transform: scale(0.58);
        }
        .coGlow {
          position: absolute;
          width: 100px;
          height: 100px;
          border-radius: 50%;
          background: rgba(63, 226, 255, 0.09);
          filter: blur(25px);
        }
        .cn1 {
          top: 18%;
          left: 13%;
        }
        .cn2 {
          bottom: 16%;
          right: 15%;
        }
        .scanLine {
          position: absolute;
          left: 0;
          right: 0;
          top: -20px;
          height: 1px;
          background: rgba(99, 236, 255, 0.6);
          box-shadow: 0 0 14px rgba(99, 236, 255, 0.5);
          animation: scanWide 3s linear infinite;
        }
        @keyframes scanWide {
          to {
            transform: translateY(190px);
            opacity: 0;
          }
        }
        .coInfo {
          gap: 10px;
          margin-top: 15px;
        }
        .coInfo .identityIcon {
          width: 39px;
          height: 39px;
          flex-basis: 39px;
        }
        .coInfo strong {
          display: block;
          font-size: 14px;
          line-height: 1.3;
        }
        .coInfo small {
          display: block;
          margin-top: 5px;
          font-size: 9px;
          letter-spacing: 0.1em;
          color: rgba(220, 250, 255, 0.42);
        }
        .coFooter {
          justify-content: space-between;
          margin-top: 15px;
          padding-top: 10px;
          border-top: 1px solid rgba(107, 233, 255, 0.07);
          font-size: 8px;
          letter-spacing: 0.12em;
          color: rgba(220, 252, 255, 0.26);
        }
        .coFooter b {
          color: rgba(141, 241, 255, 0.62);
          font-weight: 600;
        }
        .leadSection {
          padding-top: 115px;
        }
        .leadCard {
          grid-template-columns: 0.85fr 1.15fr;
          min-height: 400px;
          border-color: rgba(191, 168, 255, 0.16);
          background: linear-gradient(
            145deg,
            rgba(16, 15, 30, 0.78),
            rgba(5, 10, 17, 0.9)
          );
        }
        .leadVisual {
          min-height: 400px;
          background:
            radial-gradient(
              circle at 50% 48%,
              rgba(170, 129, 255, 0.12),
              transparent 30%
            ),
            rgba(3, 9, 16, 0.72);
        }
        .programGlow {
          width: 270px;
          height: 270px;
          position: absolute;
          border-radius: 50%;
          background: rgba(145, 100, 255, 0.13);
          filter: blur(50px);
        }
        .codeOrb {
          width: 135px;
          height: 135px;
          border: 1px solid rgba(199, 170, 255, 0.55);
          border-radius: 50%;
          display: grid;
          place-items: center;
          color: #c9b1ff;
          font-size: 25px;
          box-shadow:
            0 0 0 18px rgba(177, 135, 255, 0.025),
            0 0 60px rgba(151, 106, 255, 0.18),
            inset 0 0 35px rgba(151, 106, 255, 0.08);
          animation: codeOrb 3.5s ease-in-out infinite;
          z-index: 4;
        }
        .codeOrb span {
          font-family: monospace;
        }
        @keyframes codeOrb {
          50% {
            transform: scale(1.05);
          }
        }
        .codeOrbit {
          position: absolute;
          border: 1px solid rgba(197, 168, 255, 0.16);
          border-radius: 50%;
        }
        .cA {
          width: 340px;
          height: 110px;
          transform: rotate(20deg);
          animation: cA 10s linear infinite;
        }
        .cB {
          width: 280px;
          height: 92px;
          transform: rotate(-28deg);
          animation: cB 13s linear infinite;
        }
        @keyframes cA {
          to {
            transform: rotate(380deg);
          }
        }
        @keyframes cB {
          to {
            transform: rotate(332deg);
          }
        }
        .programmer {
          color: #c9b1ff;
          border-color: rgba(199, 170, 255, 0.22);
          background: rgba(151, 106, 255, 0.05);
        }
        .cp1 {
          top: 22%;
          left: 18%;
          background: #c9b1ff;
          box-shadow: 0 0 14px rgba(201, 177, 255, 0.8);
        }
        .cp2 {
          top: 32%;
          right: 16%;
          background: #c9b1ff;
          box-shadow: 0 0 14px rgba(201, 177, 255, 0.8);
          animation-delay: 0.6s;
        }
        .cp3 {
          bottom: 20%;
          right: 25%;
          background: #c9b1ff;
          box-shadow: 0 0 14px rgba(201, 177, 255, 0.8);
          animation-delay: 1.2s;
        }
        .constellation {
          width: min(1400px, calc(100% - 64px));
          margin: 0 auto;
          padding: 125px 0 110px;
          display: grid;
          grid-template-columns: 0.75fr 1.25fr;
          gap: 70px;
          align-items: center;
          position: relative;
          z-index: 3;
        }
        .constellationCopy p {
          max-width: 450px;
          margin: 24px 0;
          color: rgba(220, 250, 255, 0.54);
          font-size: 13px;
          line-height: 1.85;
        }
        .textLink {
          display: inline-flex;
          gap: 10px;
          align-items: center;
          color: #8feeff;
          font-size: 9px;
          letter-spacing: 0.16em;
          border-bottom: 1px solid rgba(120, 235, 255, 0.18);
          padding-bottom: 7px;
        }
        .map {
          min-height: 430px;
          position: relative;
          border: 1px solid rgba(107, 233, 255, 0.11);
          border-radius: 16px;
          overflow: hidden;
          background:
            radial-gradient(
              circle at 50% 50%,
              rgba(54, 220, 255, 0.09),
              transparent 27%
            ),
            rgba(2, 11, 16, 0.8);
        }
        .mapCore {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 108px;
          height: 108px;
          border: 1px solid rgba(117, 238, 255, 0.28);
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: rgba(5, 20, 27, 0.8);
          box-shadow:
            0 0 0 18px rgba(67, 225, 255, 0.025),
            0 0 55px rgba(58, 221, 255, 0.12);
          z-index: 5;
        }
        .mapCore img {
          width: 64px;
          height: 64px;
          object-fit: contain;
        }
        .mapLine {
          position: absolute;
          left: 50%;
          top: 50%;
          height: 1px;
          transform-origin: left center;
          background: linear-gradient(
            90deg,
            rgba(90, 231, 255, 0.4),
            transparent
          );
          box-shadow: 0 0 9px rgba(90, 231, 255, 0.2);
        }
        .ml1 {
          width: 230px;
          transform: rotate(-25deg);
        }
        .ml2 {
          width: 245px;
          transform: rotate(150deg);
        }
        .ml3 {
          width: 210px;
          transform: rotate(55deg);
        }
        .mapNode {
          position: absolute;
          display: grid;
          gap: 5px;
          padding: 10px 12px;
          border: 1px solid rgba(107, 233, 255, 0.13);
          background: rgba(3, 15, 21, 0.8);
          font-size: 8px;
          letter-spacing: 0.12em;
        }
        .mapNode b {
          color: #53e8ff;
        }
        .mapNode span {
          color: rgba(220, 252, 255, 0.44);
        }
        .mapFounder {
          top: 17%;
          right: 9%;
        }
        .mapCo {
          left: 8%;
          bottom: 17%;
        }
        .mapLead {
          right: 9%;
          bottom: 12%;
          border-color: rgba(190, 155, 255, 0.14);
        }
        .mapLead b {
          color: #c9b1ff;
        }
        .mapPulse {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 20px;
          height: 20px;
          border: 1px solid rgba(80, 233, 255, 0.45);
          border-radius: 50%;
          transform: translate(-50%, -50%);
          animation: pulseRing 2.5s ease-out infinite;
        }
        @keyframes pulseRing {
          80%,
          100% {
            transform: translate(-50%, -50%) scale(7);
            opacity: 0;
          }
        }
        .footer {
          width: min(1400px, calc(100% - 64px));
          margin: 0 auto;
          padding: 25px 0 35px;
          border-top: 1px solid rgba(107, 233, 255, 0.1);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          color: rgba(220, 252, 255, 0.34);
          font-size: 9px;
          letter-spacing: 0.12em;
          position: relative;
          z-index: 3;
        }
        .footerBrand {
          gap: 10px;
        }
        .footerBrand img {
          width: 28px;
          height: 28px;
          object-fit: contain;
        }
        .footerBrand strong,
        .footerBrand small {
          display: block;
        }
        .footerBrand strong {
          color: rgba(234, 255, 255, 0.8);
          font-size: 12px;
          letter-spacing: 0.14em;
        }
        .footerBrand small {
          margin-top: 4px;
          font-size: 8px;
          letter-spacing: 0.12em;
          color: rgba(220, 252, 255, 0.28);
        }
        .footerLinks {
          gap: 18px;
          flex-wrap: wrap;
        }
        .footerLinks a:hover {
          color: #8feeff;
        }
        [data-reveal] {
          opacity: 0;
          transform: translateY(35px);
          filter: blur(7px);
          transition:
            opacity 0.85s cubic-bezier(0.16, 1, 0.3, 1),
            transform 0.85s cubic-bezier(0.16, 1, 0.3, 1),
            filter 0.85s ease;
        }
        [data-reveal].revealed {
          opacity: 1;
          transform: none;
          filter: none;
        }
        .whoIntro {
          position: fixed;
          inset: 0;
          z-index: 999;
          display: grid;
          place-items: center;
          background: #010609;
          overflow: hidden;
          transition:
            opacity 0.76s ease,
            transform 0.76s cubic-bezier(0.77, 0, 0.18, 1);
        }
        .whoIntro.isExiting {
          opacity: 0;
          transform: scale(1.04);
          pointer-events: none;
        }
        .introNoise,
        .introVignette,
        .introGrid {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .introGrid {
          opacity: 0.25;
          background-image:
            linear-gradient(rgba(67, 226, 255, 0.07) 1px, transparent 1px),
            linear-gradient(
              90deg,
              rgba(67, 226, 255, 0.07) 1px,
              transparent 1px
            );
          background-size: 44px 44px;
          transform: perspective(600px) rotateX(62deg) scale(1.7)
            translateY(18%);
          transform-origin: center bottom;
          animation: gridMove 8s linear infinite;
        }
        @keyframes gridMove {
          to {
            background-position:
              0 44px,
              44px 0;
          }
        }
        .introVignette {
          background: radial-gradient(
            circle at center,
            transparent 20%,
            rgba(0, 0, 0, 0.78) 100%
          );
        }
        .introNoise {
          opacity: 0.05;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E");
        }
        .introOrb {
          position: absolute;
          border-radius: 50%;
          filter: blur(50px);
          opacity: 0.16;
        }
        .orbA {
          width: 420px;
          height: 420px;
          top: -150px;
          right: -90px;
          background: #00d9ff;
        }
        .orbB {
          width: 360px;
          height: 360px;
          bottom: -150px;
          left: -80px;
          background: #007ca8;
        }
        .orbC {
          width: 240px;
          height: 240px;
          top: 35%;
          left: 42%;
          background: #6e4cff;
          opacity: 0.07;
        }
        .introBeam {
          position: absolute;
          top: -30%;
          width: 2px;
          height: 160%;
          background: linear-gradient(
            transparent,
            rgba(92, 239, 255, 0.45),
            transparent
          );
          filter: blur(1px);
          opacity: 0;
          transform: rotate(18deg);
        }
        .beamA {
          left: 22%;
          animation: beam 3.4s ease-in-out infinite;
        }
        .beamB {
          right: 26%;
          animation: beam 4.2s ease-in-out 1s infinite reverse;
        }
        @keyframes beam {
          0%,
          100% {
            opacity: 0;
          }
          50% {
            opacity: 0.9;
          }
        }
        .hud {
          position: absolute;
          font-size: 8px;
          letter-spacing: 0.18em;
          color: rgba(181, 244, 255, 0.32);
        }
        .hud b {
          color: #65f1ff;
          font-weight: 600;
        }
        .hudTL {
          top: 24px;
          left: 26px;
        }
        .hudTR {
          top: 24px;
          right: 26px;
        }
        .hudBL {
          bottom: 24px;
          left: 26px;
        }
        .hudBR {
          bottom: 24px;
          right: 26px;
        }
        .introCenter {
          width: min(720px, calc(100% - 48px));
          text-align: center;
          position: relative;
          z-index: 3;
        }
        .introLogo {
          width: 175px;
          height: 175px;
          margin: 0 auto 24px;
          display: grid;
          place-items: center;
          position: relative;
        }
        .introLogo img {
          width: 105px;
          height: 105px;
          object-fit: contain;
          position: relative;
          z-index: 5;
          filter: drop-shadow(0 0 25px rgba(65, 229, 255, 0.24));
        }
        .logoRing {
          position: absolute;
          border: 1px solid rgba(78, 229, 255, 0.2);
          border-radius: 50%;
        }
        .ringA {
          inset: 8px;
          animation: spin 9s linear infinite;
        }
        .ringB {
          inset: 23px;
          border-color: rgba(189, 158, 255, 0.14);
          animation: spin 13s linear infinite reverse;
        }
        .ringC {
          inset: -4px;
          border-style: dashed;
          opacity: 0.55;
          animation: spin 18s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        .logoHalo {
          position: absolute;
          width: 120px;
          height: 120px;
          border-radius: 50%;
          background: rgba(55, 224, 255, 0.08);
          filter: blur(20px);
        }
        .introKicker {
          font-size: 9px;
          letter-spacing: 0.28em;
          color: rgba(165, 245, 255, 0.48);
        }
        .introCenter h1 {
          margin: 17px 0 13px;
          font-size: clamp(36px, 5.5vw, 70px);
          line-height: 0.9;
          letter-spacing: -0.06em;
        }
        .introCenter h1 span,
        .introCenter h1 strong {
          display: block;
        }
        .introCenter h1 span {
          color: rgba(234, 255, 255, 0.9);
        }
        .introCenter h1 strong {
          color: transparent;
          -webkit-text-stroke: 1px rgba(142, 240, 255, 0.78);
        }
        .introCenter p {
          margin: 0 auto 24px;
          max-width: 520px;
          color: rgba(220, 250, 255, 0.5);
          font-size: 12px;
          line-height: 1.7;
        }
        .boot {
          margin: auto;
          width: min(510px, 100%);
          text-align: left;
          padding: 12px;
          border: 1px solid rgba(98, 232, 255, 0.1);
          background: rgba(4, 19, 25, 0.55);
        }
        .bootTop,
        .bootMeta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          font-size: 8px;
          letter-spacing: 0.14em;
          color: rgba(220, 252, 255, 0.3);
        }
        .bootTop b {
          color: #8ef6d3;
          font-weight: 600;
        }
        .bootTop i {
          display: inline-block;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #4cefc0;
          box-shadow: 0 0 9px #4cefc0;
          margin-right: 6px;
        }
        .bootLine {
          height: 2px;
          margin: 11px 0;
          background: rgba(96, 231, 255, 0.08);
          overflow: hidden;
        }
        .bootLine i {
          display: block;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, #45eaff, #a287ff);
          transform: scaleX(0);
          transform-origin: left;
          animation: bootLoad 3.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes bootLoad {
          to {
            transform: scaleX(1);
          }
        }
        .bootMeta strong {
          color: rgba(144, 244, 255, 0.82);
        }
        .skip {
          position: absolute;
          right: 26px;
          bottom: 24px;
          border: 1px solid rgba(127, 236, 255, 0.16);
          background: rgba(5, 18, 24, 0.6);
          color: rgba(220, 252, 255, 0.58);
          padding: 9px 11px;
          border-radius: 4px;
          font-size: 8px;
          letter-spacing: 0.15em;
          cursor: pointer;
        }
        .phase-0 .introLogo,
        .phase-0 .introKicker,
        .phase-0 .introCenter h1,
        .phase-0 .introCenter p,
        .phase-0 .boot {
          opacity: 0;
          transform: translateY(16px);
        }
        .phase-1 .introLogo {
          animation: appear 0.8s both;
        }
        .phase-2 .introKicker,
        .phase-2 .introCenter h1 {
          animation: appear 0.8s both;
        }
        .phase-3 .introCenter p {
          animation: appear 0.8s both;
        }
        .phase-4 .boot {
          animation: appear 0.8s both;
        }
        @keyframes appear {
          from {
            opacity: 0;
            transform: translateY(18px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        .whoCursorGlow {
          position: fixed;
          left: var(--who-mx, 50%);
          top: var(--who-my, 50%);
          width: 360px;
          height: 360px;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          background: radial-gradient(
            circle,
            rgba(53, 226, 255, 0.07),
            transparent 68%
          );
          pointer-events: none;
          z-index: 1;
          mix-blend-mode: screen;
        }
        .peopleTicker {
          position: relative;
          z-index: 3;
          overflow: hidden;
          border-top: 1px solid rgba(107, 233, 255, 0.08);
          border-bottom: 1px solid rgba(107, 233, 255, 0.08);
          background: rgba(2, 11, 16, 0.65);
          white-space: nowrap;
        }
        .peopleTickerTrack {
          display: flex;
          gap: 18px;
          align-items: center;
          width: max-content;
          padding: 11px 0;
          color: rgba(212, 249, 255, 0.25);
          font-size: 8px;
          letter-spacing: 0.2em;
          animation: peopleTicker 32s linear infinite;
        }
        .peopleTickerTrack i {
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: #59eaff;
          box-shadow: 0 0 10px rgba(89, 234, 255, 0.8);
        }
        @keyframes peopleTicker {
          to {
            transform: translateX(-50%);
          }
        }
        .peopleCta {
          width: min(1400px, calc(100% - 64px));
          margin: 25px auto 95px;
          padding: 62px 68px;
          border: 1px solid rgba(105, 232, 255, 0.11);
          border-radius: 16px;
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 45px;
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(
              circle at 80% 30%,
              rgba(112, 75, 255, 0.1),
              transparent 30%
            ),
            rgba(3, 13, 19, 0.78);
        }
        .ctaGrid {
          position: absolute;
          inset: 0;
          opacity: 0.22;
          background-image:
            linear-gradient(rgba(80, 231, 255, 0.06) 1px, transparent 1px),
            linear-gradient(
              90deg,
              rgba(80, 231, 255, 0.06) 1px,
              transparent 1px
            );
          background-size: 42px 42px;
        }
        .peopleCta > div:not(.ctaGrid) {
          position: relative;
          z-index: 2;
        }
        .peopleCta span {
          font-size: 8px;
          letter-spacing: 0.18em;
          color: rgba(160, 242, 255, 0.4);
        }
        .peopleCta h3 {
          font-size: clamp(46px, 6vw, 76px);
          line-height: 0.92;
          letter-spacing: -0.06em;
          margin: 14px 0 18px;
        }
        .peopleCta h3 em {
          font-style: normal;
          color: transparent;
          -webkit-text-stroke: 1px rgba(201, 177, 255, 0.75);
        }
        .peopleCta p {
          max-width: 560px;
          color: rgba(220, 250, 255, 0.48);
          font-size: 12px;
          line-height: 1.8;
          margin: 0;
        }
        .ctaButton {
          position: relative;
          z-index: 2;
          flex: 0 0 auto;
          padding: 15px 18px;
          border: 1px solid rgba(102, 231, 255, 0.2);
          background: rgba(5, 22, 29, 0.72);
          font-size: 9px;
          letter-spacing: 0.14em;
          color: #9af2ff;
          transition:
            transform 0.3s ease,
            border-color 0.3s ease,
            background 0.3s ease;
        }
        .ctaButton:hover {
          transform: translateY(-4px);
          border-color: rgba(102, 231, 255, 0.48);
          background: rgba(8, 30, 39, 0.9);
        }
        .menuButton,
        .mobileMenu {
          display: none;
        }
        @media (max-width: 980px) {
          .links,
          .navRight .live {
            display: none;
          }
          .nav,
          .hero,
          .teamSection,
          .constellation,
          .footer,
          .peopleCta {
            width: min(100% - 34px, 760px);
          }
          .navRight {
            margin-left: auto;
          }
          .menuButton {
            display: flex;
            width: 42px;
            height: 42px;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            gap: 6px;
            border: 1px solid rgba(106, 231, 255, 0.14);
            background: rgba(4, 17, 23, 0.72);
            color: #a9f6ff;
            border-radius: 7px;
            cursor: pointer;
          }
          .menuButton span {
            width: 15px;
            height: 1px;
            background: currentColor;
            transition: transform 0.3s ease;
          }
          .menuButton.open span:first-child {
            transform: translateY(3.5px) rotate(45deg);
          }
          .menuButton.open span:last-child {
            transform: translateY(-3.5px) rotate(-45deg);
          }
          .mobileMenu {
            display: grid;
            position: absolute;
            left: 0;
            right: 0;
            top: calc(100% + 10px);
            padding: 8px;
            border: 1px solid rgba(105, 231, 255, 0.12);
            background: rgba(2, 10, 15, 0.95);
            backdrop-filter: blur(22px);
            transform: translateY(-10px);
            opacity: 0;
            pointer-events: none;
            transition:
              opacity 0.3s ease,
              transform 0.3s ease;
          }
          .mobileMenu.open {
            opacity: 1;
            transform: none;
            pointer-events: auto;
          }
          .mobileMenu a {
            display: flex;
            justify-content: space-between;
            padding: 16px 14px;
            border-bottom: 1px solid rgba(105, 231, 255, 0.07);
            font-size: 9px;
            letter-spacing: 0.18em;
            color: rgba(226, 253, 255, 0.68);
          }
          .mobileMenu a:last-child {
            border: 0;
            color: #86efff;
          }
          .mobileMenu b {
            font-weight: 500;
            color: rgba(126, 238, 255, 0.35);
          }
          .hero {
            grid-template-columns: 1fr;
            min-height: auto;
          }
          .heroCopy {
            padding: 70px 0 35px;
          }
          .heroVisual {
            min-height: 480px;
          }
          .sectionHeader {
            display: grid;
            grid-template-columns: 1fr;
            gap: 20px;
          }
          .founderCard,
          .leadCard {
            grid-template-columns: 1fr;
          }
          .founderVisual {
            min-height: 390px;
          }
          .founderCopy,
          .leadCopy {
            padding: 38px 28px;
          }
          .coGrid {
            grid-template-columns: 1fr 1fr;
          }
          .constellation {
            grid-template-columns: 1fr;
            gap: 35px;
          }
          .navRight .live {
            display: none;
          }
        }
        @media (max-width: 620px) {
          .nav {
            height: 72px;
          }
          .brand strong {
            font-size: 15px;
          }
          .enter {
            padding: 10px 11px;
            font-size: 8px;
          }
          .hero h2 {
            font-size: clamp(45px, 13vw, 66px);
          }
          .heroMeta {
            align-items: flex-start;
            flex-wrap: wrap;
          }
          .heroMeta b {
            margin-left: 0;
          }
          .heroVisual {
            min-height: 390px;
          }
          .orbit1 {
            width: 330px;
            height: 130px;
          }
          .orbit2 {
            width: 260px;
            height: 100px;
          }
          .coGrid {
            grid-template-columns: 1fr;
          }
          .coCard {
            min-height: 285px;
          }
          .sectionHeader h3,
          .constellation h3 {
            font-size: 44px;
          }
          .map {
            min-height: 380px;
          }
          .mapNode {
            transform: scale(0.9);
          }
          .mapFounder {
            top: 12%;
            right: 4%;
          }
          .mapCo {
            left: 4%;
            bottom: 12%;
          }
          .mapLead {
            right: 4%;
            bottom: 5%;
          }
          .footer {
            align-items: flex-start;
            flex-direction: column;
          }
          .footerLinks {
            gap: 12px;
          }
          .hud {
            font-size: 6px;
          }
          .hudTR,
          .hudBR {
            right: 14px;
          }
          .hudTL,
          .hudBL {
            left: 14px;
          }
          .skip {
            right: 14px;
            bottom: 14px;
          }
          .introCenter {
            width: calc(100% - 28px);
          }
          .introLogo {
            width: 140px;
            height: 140px;
          }
          .introLogo img {
            width: 82px;
            height: 82px;
          }
          .bootMeta span:nth-child(2) {
            display: none;
          }
        }
        @media (max-width: 620px) {
          .whoCursorGlow {
            display: none;
          }
          .peopleTickerTrack {
            animation-duration: 27s;
          }
          .peopleCta {
            margin: 10px auto 65px;
            padding: 40px 22px;
          }
          .peopleCta h3 {
            font-size: clamp(43px, 12vw, 62px);
          }
          .ctaButton {
            width: 100%;
            text-align: center;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
            transition-duration: 0.001ms !important;
          }
          [data-reveal] {
            opacity: 1;
            transform: none;
            filter: none;
          }
        }
      `}</style>
    </main>
  );
}
