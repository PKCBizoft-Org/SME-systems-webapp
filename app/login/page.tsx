"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

const PKC_LOGO = "data:image/webp;base64,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";


export default function LoginPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightMode, setLightMode] = useState(false);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      const raw = error.message?.toLowerCase() || "";
      if (raw.includes("invalid login") || raw.includes("invalid credentials")) {
        setMessage("The email or password is incorrect.");
      } else if (raw.includes("email not confirmed")) {
        setMessage("Please confirm your email address before signing in.");
      } else {
        setMessage("We couldn't sign you in right now. Please try again.");
      }
      setLoading(false);
      return;
    }

    window.location.href = "/clients";
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <main className={`page ${lightMode ? "lightMode" : ""}`}>
      <div className="background" aria-hidden="true">
        <div className="shape shapeOne" />
        <div className="shape shapeTwo" />
        <div className="shape shapeThree" />
        <div className="arc arcOne" />
        <div className="arc arcTwo" />
        <div className="grid" />
        <div className="scanline" />
      </div>

      <header className="header">
        <a className="brand" href="#home" aria-label="PKC BIZOFT home" onClick={closeMenu}>
          <img src={PKC_LOGO} alt="" />
          <span className="brandText">
            PKC <strong>BIZOFT</strong>
          </span>
        </a>

        <nav className={`nav ${menuOpen ? "navOpen" : ""}`} aria-label="Main navigation">
          <a className="active" href="#home" onClick={closeMenu}>Home</a>
          <a href="#features" onClick={closeMenu}>Features</a>
          <a href="#services" onClick={closeMenu}>Services</a>
          <a href="#about" onClick={closeMenu}>About</a>
          <a href="#contact" onClick={closeMenu}>Contact</a>
        </nav>

        <div className="headerActions">
          <button
            className="modeButton"
            type="button"
            onClick={() => setLightMode((value) => !value)}
            aria-label={lightMode ? "Switch to dark mode" : "Switch to light mode"}
          >
            <span className="sunIcon">☼</span>
            {lightMode ? "DARK" : "LIGHT"}
          </button>

          <button className="langButton" type="button" aria-label="Language">
            <span>◉</span> EN <b>⌄</b>
          </button>

          <button className="iconButton searchButton" type="button" aria-label="Search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.8" cy="10.8" r="6.7" />
              <path d="m16 16 5 5" />
            </svg>
          </button>

          <button
            className={`iconButton menuButton ${menuOpen ? "menuActive" : ""}`}
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>

      <section className="hero" id="home">
        <div className="heroCopy">
          <div className="valuePills">
            <span>ϟ SMART</span>
            <i />
            <span>SECURE</span>
            <i />
            <span>SCALABLE</span>
          </div>

          <p className="eyebrow">INTERNET SOLUTIONS FOR A SMARTER TOMORROW</p>

          <h1>
            CONNECTING YOUR
            <strong> BUSINESS.</strong>
            <br />
            POWERING YOUR
            <strong> NETWORK.</strong>
          </h1>

          <p className="description">
            PKC BIZOFT provides fast, reliable, and secure internet solutions designed to
            keep your business connected, productive, and ahead.
          </p>

          <div className="heroActions">
            <a className="learnButton" href="#features">
              <span>Explore platform</span>
              <b>→</b>
            </a>

            <a className="whyButton" href="#about">
              <span className="playCircle">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9 7 8 5-8 5Z" />
                </svg>
              </span>
              <span>Why PKC BIZOFT</span>
            </a>
          </div>

          <div className="statusBar">
            <div className="statusItem">
              <span className="statusDot" />
              <span>Network Online</span>
            </div>
            <span className="statusDivider" />
            <div className="statusItem">
              <span className="signalIcon" aria-hidden="true">
                <i /><i /><i /><i />
              </span>
              <span>Stable Connection</span>
            </div>
          </div>
        </div>

        <div className="networkStage" aria-label="PKC BIZOFT network overview">
          <div className="networkGlow" />
          <div className="orbit orbitA" />
          <div className="orbit orbitB" />
          <div className="orbit orbitC" />
          <div className="globeCore">
            <div className="globeLatitude latOne" />
            <div className="globeLatitude latTwo" />
            <div className="globeLongitude longOne" />
            <div className="globeLongitude longTwo" />
            <div className="globeLongitude longThree" />
            <div className="globeMesh" />
            <div className="coreNode">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="6" y="4" width="12" height="6" rx="1.5" />
                <rect x="6" y="14" width="12" height="6" rx="1.5" />
                <path d="M9 7h.01M9 17h.01" />
              </svg>
              <span>SERVER</span>
            </div>
          </div>

          <div className="networkLine lineOne" />
          <div className="networkLine lineTwo" />
          <div className="networkLine lineThree" />

          <div className="node nodeWifi">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 9.5a13.5 13.5 0 0 1 18 0" />
              <path d="M6.5 13a8.2 8.2 0 0 1 11 0" />
              <path d="M10 16.5a3.1 3.1 0 0 1 4 0" />
              <circle cx="12" cy="19" r="1" />
            </svg>
            <span>WI-FI</span>
          </div>

          <div className="node nodeCloud">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6.5 18h10.2a3.8 3.8 0 0 0 .5-7.6A5.6 5.6 0 0 0 6.5 12a3 3 0 0 0 0 6Z" />
            </svg>
            <span>CLOUD</span>
          </div>

          <div className="node nodeSecure">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3.5 19 6v5.3c0 4.4-2.9 7.9-7 9.2-4.1-1.3-7-4.8-7-9.2V6l7-2.5Z" />
              <path d="m9.5 12 1.7 1.7 3.5-3.8" />
            </svg>
            <span>SECURE</span>
          </div>

          <div className="node nodeUplink">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 20v-4M10 20v-7M15 20v-11M20 20V5" />
            </svg>
            <span>UPLINK</span>
          </div>

          <span className="dataPoint pointOne" />
          <span className="dataPoint pointTwo" />
          <span className="dataPoint pointThree" />
          <span className="dataPoint pointFour" />
          <span className="dataPoint pointFive" />
        </div>

        <section className="loginCard" aria-label="Login">
          <div className="cardTopLine" />

          <div className="cardHeading">
            <h2>Welcome back</h2>
            <p>Sign in to your account to continue.</p>
          </div>

          <div className="securityRow">
            <span className="check">✓</span>
            <span>Protected business access</span>
            <i />
            <span>Fast sign-in</span>
          </div>

          <form onSubmit={handleLogin}>
            <label className="field">
              <span className="fieldIcon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
                  <path d="m4.5 7 7.5 6 7.5-6" />
                </svg>
              </span>
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                inputMode="email"
                spellCheck={false}
                required
              />
            </label>

            <label className="field">
              <span className="fieldIcon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="5" y="10" width="14" height="10" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                  <circle cx="12" cy="15" r="1" />
                </svg>
              </span>

              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />

              <button
                type="button"
                className="passwordToggle"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 3l18 18" />
                    <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
                    <path d="M9.9 5.2A11.6 11.6 0 0 1 12 5c5.2 0 8.7 4.8 9.7 7-.4.8-1.2 2-2.4 3.1" />
                    <path d="M6.4 6.4C4.4 7.7 3.2 9.6 2.3 12c1 2.3 4.4 7 9.7 7 1.2 0 2.3-.2 3.3-.6" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
                    <circle cx="12" cy="12" r="2.8" />
                  </svg>
                )}
              </button>
            </label>

            <div className="formMeta">
              <label className="remember">
                <input type="checkbox" />
                <span>Remember me</span>
              </label>
              <a href="/forgot-password">Forgot password?</a>
            </div>

            {message && (
              <div className="message" role="alert" aria-live="polite">
                {message}
              </div>
            )}

            <button className="loginButton" type="submit" disabled={loading} aria-busy={loading}>
              {loading ? (
                <>
                  <span className="spinner" />
                  Signing in...
                </>
              ) : (
                <>
                  <span>Sign in</span>
                  <span className="loginArrow">→</span>
                </>
              )}
            </button>
          </form>

          <div className="orDivider">
            <span />
            <em>SECURE SIGN-IN</em>
            <span />
          </div>

          <div className="secureNote">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3.5 19 6v5.3c0 4.4-2.9 7.9-7 9.2-4.1-1.3-7-4.8-7-9.2V6l7-2.5Z" />
              <path d="m9.4 12 1.7 1.7 3.6-3.8" />
            </svg>
            <span>Secure access to PKC BIZOFT</span>
          </div>
        </section>
      </section>

      <div className="sideLabel" aria-hidden="true">
        <span>STAY CONNECTED</span>
        <i />
      </div>

      <footer className="footer" id="contact">
        <span>PKC BIZOFT</span>
        <i />
        <span>BUSINESS INTERNET SOLUTIONS</span>
      </footer>

      <section className="anchorTarget" id="features" aria-hidden="true" />
      <section className="anchorTarget" id="services" aria-hidden="true" />
      <section className="anchorTarget" id="about" aria-hidden="true" />

      <style jsx>{`
        :global(*) {
          box-sizing: border-box;
        }

        :global(html) {
          scroll-behavior: smooth;
          background: #030b14;
        }

        :global(body) {
          margin: 0;
          min-width: 320px;
          background: #030b14;
          font-family: Arial, Helvetica, sans-serif;
        }

        :global(button),
        :global(input) {
          font: inherit;
        }

        .page {
          --bg: #03101d;
          --bg2: #061b30;
          --panel: rgba(5, 24, 43, .94);
          --panelSoft: rgba(8, 31, 54, .74);
          --line: rgba(79, 157, 215, .26);
          --blue: #149cff;
          --blue2: #21b7ff;
          --text: #f1f6fc;
          --muted: #91abc3;
          --dim: #66829c;
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          color: var(--text);
          background:
            radial-gradient(circle at 52% 49%, rgba(0, 140, 255, .08), transparent 28%),
            linear-gradient(120deg, var(--bg) 0%, #04182a 52%, #061a2e 100%);
        }

        .background {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        }

        .grid {
          position: absolute;
          inset: 0;
          opacity: .18;
          background-image:
            linear-gradient(rgba(92, 154, 199, .13) 1px, transparent 1px),
            linear-gradient(90deg, rgba(92, 154, 199, .13) 1px, transparent 1px);
          background-size: 46px 46px;
          mask-image: linear-gradient(to bottom, transparent 0%, #000 12%, #000 88%, transparent 100%);
        }

        .scanline {
          position: absolute;
          inset: 0;
          opacity: .08;
          background: repeating-linear-gradient(
            to bottom,
            transparent 0,
            transparent 5px,
            rgba(255,255,255,.03) 6px
          );
        }

        .shape {
          position: absolute;
          border: 1px solid rgba(44, 141, 222, .16);
          border-radius: 50%;
        }

        .shapeOne {
          width: 900px;
          height: 900px;
          left: -380px;
          top: 110px;
          background: radial-gradient(circle at 60% 45%, rgba(0, 123, 255, .15), transparent 62%);
        }

        .shapeTwo {
          width: 700px;
          height: 700px;
          right: -470px;
          top: -210px;
          border-color: rgba(38, 140, 230, .13);
        }

        .shapeThree {
          width: 620px;
          height: 620px;
          right: -270px;
          bottom: -420px;
          border-color: rgba(38, 140, 230, .12);
        }

        .arc {
          position: absolute;
          width: 920px;
          height: 420px;
          border: 1px solid rgba(52, 157, 231, .13);
          border-radius: 50%;
          transform: rotate(-28deg);
        }

        .arcOne {
          left: -300px;
          bottom: -170px;
        }

        .arcTwo {
          right: -350px;
          bottom: -180px;
          transform: rotate(22deg);
        }

        .header {
          position: relative;
          z-index: 20;
          width: calc(100% - 64px);
          max-width: 1295px;
          height: 82px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          padding: 0 18px;
          border: 1px solid rgba(48, 144, 219, .38);
          border-top: 0;
          border-radius: 0 0 28px 28px;
          background:
            linear-gradient(105deg, rgba(7, 32, 56, .96), rgba(4, 22, 39, .91) 58%, rgba(8, 38, 66, .95));
          box-shadow:
            0 16px 35px rgba(0,0,0,.22),
            0 1px 0 rgba(24, 173, 255, .75);
        }

        .header::after {
          content: "";
          position: absolute;
          left: 18%;
          right: 18%;
          bottom: -2px;
          height: 3px;
          border-radius: 50%;
          background: linear-gradient(90deg, transparent, rgba(0, 176, 255, .9), transparent);
          filter: blur(2px);
        }

        .brand {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          color: var(--text);
          text-decoration: none;
          flex: 0 0 auto;
        }

        .brand img {
          width: 58px;
          height: 58px;
          object-fit: contain;
          border-radius: 16px;
          box-shadow: 0 0 28px rgba(0, 119, 255, .22);
        }

        .brandText {
          font-size: 18px;
          letter-spacing: -.02em;
        }

        .brandText strong {
          color: #149eff;
        }

        .nav {
          display: flex;
          align-items: stretch;
          gap: 38px;
          height: 100%;
          margin-left: auto;
          margin-right: 34px;
        }

        .nav a {
          position: relative;
          display: flex;
          align-items: center;
          color: #9eb2c8;
          text-decoration: none;
          font-size: 12px;
          transition: color .2s ease;
        }

        .nav a:hover,
        .nav a.active {
          color: #fff;
        }

        .nav a.active::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: 13px;
          height: 2px;
          background: #159fff;
          box-shadow: 0 0 11px rgba(21,159,255,.9);
        }

        .headerActions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .modeButton,
        .langButton {
          height: 34px;
          padding: 0 13px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: #c6d8e9;
          border: 1px solid rgba(50, 141, 214, .34);
          border-radius: 999px;
          background: rgba(4, 22, 38, .56);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .08em;
          cursor: pointer;
        }

        .modeButton:hover,
        .langButton:hover {
          border-color: rgba(39, 169, 255, .72);
          color: #fff;
        }

        .sunIcon {
          font-size: 17px;
          line-height: 1;
          color: #1cb5ff;
        }

        .langButton b {
          font-size: 11px;
          color: #5fa7d8;
        }

        .iconButton {
          width: 34px;
          height: 34px;
          padding: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          background: transparent;
          color: #e1edf7;
          cursor: pointer;
        }

        .searchButton svg {
          width: 22px;
          height: 22px;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.6;
        }

        .menuButton {
          flex-direction: column;
          gap: 5px;
        }

        .menuButton span {
          width: 22px;
          height: 2px;
          border-radius: 3px;
          background: #eaf5ff;
          transition: transform .22s ease, opacity .22s ease;
        }

        .menuButton.menuActive span:nth-child(1) {
          transform: translateY(7px) rotate(45deg);
        }

        .menuButton.menuActive span:nth-child(2) {
          opacity: 0;
        }

        .menuButton.menuActive span:nth-child(3) {
          transform: translateY(-7px) rotate(-45deg);
        }

        .hero {
          position: relative;
          z-index: 5;
          width: calc(100% - 64px);
          max-width: 1295px;
          min-height: calc(100vh - 82px);
          margin: 0 auto;
          display: grid;
          grid-template-columns: minmax(0, 43%) minmax(360px, 35%) minmax(330px, 1fr);
          align-items: center;
          column-gap: 0;
          padding: 20px 0 62px;
        }

        .heroCopy {
          position: relative;
          z-index: 8;
          padding: 0 0 8px;
        }

        .valuePills {
          width: fit-content;
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 0 0 27px;
          padding: 8px 13px;
          border: 1px solid rgba(26, 166, 255, .52);
          border-radius: 999px;
          background: rgba(3, 25, 44, .64);
          box-shadow: inset 0 0 16px rgba(0, 150, 255, .05);
        }

        .valuePills span {
          font-size: 10px;
          letter-spacing: .13em;
          font-weight: 800;
          color: #b7d5ea;
        }

        .valuePills span:first-child {
          color: #d5ebf9;
        }

        .valuePills span:first-child::first-letter {
          color: #ff9d2d;
        }

        .valuePills i {
          width: 1px;
          height: 14px;
          background: rgba(137, 177, 206, .38);
        }

        .eyebrow {
          margin: 0 0 16px;
          color: #eaf4fb;
          font-size: 11px;
          line-height: 1.3;
          letter-spacing: .13em;
          font-weight: 900;
        }

        h1 {
          margin: 0;
          max-width: 650px;
          font-size: clamp(43px, 4.15vw, 64px);
          line-height: .99;
          font-weight: 300;
          letter-spacing: -.055em;
          color: #f2f6fb;
        }

        h1 strong {
          color: #149eff;
          font-weight: 800;
          text-shadow: 0 0 22px rgba(20, 158, 255, .12);
        }

        .description {
          max-width: 520px;
          margin: 25px 0 0;
          color: #a9c0d5;
          font-size: 14px;
          line-height: 1.65;
        }

        .heroActions {
          display: flex;
          align-items: center;
          gap: 20px;
          margin-top: 26px;
        }

        .learnButton {
          min-width: 199px;
          height: 48px;
          padding: 0 18px 0 24px;
          display: inline-flex;
          align-items: center;
          justify-content: space-between;
          border: 1px solid #20adff;
          border-radius: 999px;
          color: #fff;
          text-decoration: none;
          font-size: 12px;
          font-weight: 800;
          background: linear-gradient(100deg, #0faaf3, #266df4);
          box-shadow: 0 10px 30px rgba(14, 125, 242, .18);
        }

        .learnButton:hover {
          filter: brightness(1.08);
          transform: translateY(-1px);
        }

        .learnButton b {
          font-size: 18px;
          font-weight: 400;
          color: #9fe1ff;
        }

        .whyButton {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          color: #c4d6e5;
          text-decoration: none;
          font-size: 11px;
          font-weight: 800;
        }

        .playCircle {
          width: 33px;
          height: 33px;
          display: grid;
          place-items: center;
          border: 1px solid #159eff;
          border-radius: 50%;
          background: rgba(3, 30, 52, .64);
        }

        .playCircle svg {
          width: 13px;
          fill: #1da7ff;
          stroke: none;
        }

        .statusBar {
          display: flex;
          align-items: center;
          gap: 19px;
          margin-top: 58px;
        }

        .statusItem {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #8da7bd;
          font-size: 11px;
        }

        .statusDot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #14e4a0;
          box-shadow: 0 0 10px rgba(20,228,160,.8);
        }

        .statusDivider {
          width: 1px;
          height: 18px;
          background: rgba(123, 161, 190, .25);
        }

        .signalIcon {
          height: 17px;
          display: flex;
          align-items: end;
          gap: 2px;
        }

        .signalIcon i {
          display: block;
          width: 3px;
          border-radius: 1px;
          background: #1aaaff;
          box-shadow: 0 0 7px rgba(26,170,255,.4);
        }

        .signalIcon i:nth-child(1) { height: 5px; }
        .signalIcon i:nth-child(2) { height: 8px; }
        .signalIcon i:nth-child(3) { height: 12px; }
        .signalIcon i:nth-child(4) { height: 16px; }

        .networkStage {
          position: relative;
          width: min(100%, 510px);
          aspect-ratio: 1 / 1;
          justify-self: center;
          align-self: center;
          transform: translateX(-2%);
        }

        .networkGlow {
          position: absolute;
          inset: 17%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(0, 153, 255, .15), transparent 64%);
          filter: blur(12px);
        }

        .orbit {
          position: absolute;
          border: 1px solid rgba(29, 164, 255, .33);
          border-radius: 50%;
          left: 50%;
          top: 50%;
          transform-style: preserve-3d;
        }

        .orbitA {
          width: 80%;
          height: 49%;
          transform: translate(-50%, -50%) rotate(28deg);
        }

        .orbitB {
          width: 80%;
          height: 49%;
          transform: translate(-50%, -50%) rotate(-28deg);
        }

        .orbitC {
          width: 57%;
          height: 86%;
          transform: translate(-50%, -50%);
        }

        .globeCore {
          position: absolute;
          width: 62%;
          height: 62%;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          border: 1px solid rgba(24, 168, 255, .54);
          border-radius: 50%;
          box-shadow:
            inset 0 0 35px rgba(0, 154, 255, .09),
            0 0 40px rgba(0, 119, 255, .12);
          overflow: hidden;
        }

        .globeMesh {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background:
            radial-gradient(circle at 42% 35%, rgba(23, 179, 255, .13), transparent 34%),
            repeating-linear-gradient(0deg, transparent 0 28px, rgba(27, 167, 255, .26) 29px 30px),
            repeating-linear-gradient(90deg, transparent 0 28px, rgba(27, 167, 255, .22) 29px 30px);
          transform: perspective(280px) rotateX(2deg);
        }

        .globeLatitude,
        .globeLongitude {
          position: absolute;
          left: 50%;
          top: 50%;
          border: 1px solid rgba(36, 172, 255, .45);
          border-radius: 50%;
          transform: translate(-50%, -50%);
        }

        .latOne {
          width: 100%;
          height: 44%;
        }

        .latTwo {
          width: 100%;
          height: 78%;
        }

        .longOne {
          width: 35%;
          height: 100%;
        }

        .longTwo {
          width: 65%;
          height: 100%;
        }

        .longThree {
          width: 92%;
          height: 100%;
        }

        .coreNode {
          position: absolute;
          z-index: 5;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 70px;
          height: 70px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          border: 1px solid rgba(29, 173, 255, .7);
          border-radius: 13px;
          background: rgba(4, 35, 58, .9);
          box-shadow: 0 0 24px rgba(0, 144, 255, .14);
        }

        .coreNode svg {
          width: 25px;
          height: 25px;
          fill: none;
          stroke: #1bb0ff;
          stroke-width: 1.5;
        }

        .coreNode span,
        .node span {
          font-size: 7px;
          letter-spacing: .1em;
          font-weight: 900;
          color: #a7c9df;
        }

        .networkLine {
          position: absolute;
          left: 50%;
          top: 50%;
          height: 1px;
          width: 45%;
          transform-origin: left center;
          background: linear-gradient(90deg, rgba(17, 177, 255, .6), transparent);
        }

        .lineOne { transform: rotate(-25deg); }
        .lineTwo { transform: rotate(25deg); }
        .lineThree { transform: rotate(90deg); }

        .node {
          position: absolute;
          z-index: 8;
          width: 66px;
          height: 66px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          border: 1px solid rgba(30, 170, 255, .7);
          border-radius: 13px;
          background: rgba(5, 31, 53, .94);
          box-shadow:
            0 0 22px rgba(0, 139, 255, .12),
            inset 0 0 18px rgba(0, 139, 255, .05);
        }

        .node svg {
          width: 25px;
          height: 25px;
          fill: none;
          stroke: #17b2ff;
          stroke-width: 1.6;
        }

        .nodeWifi {
          left: 50%;
          top: 4%;
          transform: translateX(-50%);
        }

        .nodeCloud {
          left: 9%;
          top: 27%;
        }

        .nodeSecure {
          right: 5%;
          top: 56%;
        }

        .nodeUplink {
          left: 20%;
          bottom: 9%;
        }

        .dataPoint {
          position: absolute;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #57d7ff;
          box-shadow: 0 0 13px rgba(47, 205, 255, .95);
          animation: pulse 2.2s ease-in-out infinite;
        }

        .pointOne { left: 31%; top: 40%; }
        .pointTwo { left: 72%; top: 38%; animation-delay: -.5s; }
        .pointThree { left: 76%; top: 53%; animation-delay: -.9s; }
        .pointFour { left: 39%; top: 72%; animation-delay: -1.4s; }
        .pointFive { left: 61%; top: 75%; animation-delay: -1.8s; }

        @keyframes pulse {
          0%, 100% { opacity: .45; transform: scale(.8); }
          50% { opacity: 1; transform: scale(1.35); }
        }

        .loginCard {
          position: relative;
          z-index: 10;
          width: min(100%, 405px);
          justify-self: end;
          padding: 29px 32px 26px;
          border: 1px solid rgba(34, 133, 205, .25);
          background:
            linear-gradient(145deg, rgba(7, 30, 52, .97), rgba(3, 19, 34, .95));
          box-shadow:
            0 28px 70px rgba(0,0,0,.25),
            inset 0 1px 0 rgba(111, 188, 236, .035);
        }

        .cardTopLine {
          width: 39px;
          height: 3px;
          margin-bottom: 22px;
          background: #19a8ff;
          box-shadow: 0 0 13px rgba(25,168,255,.6);
        }

        .cardHeading h2 {
          margin: 0;
          color: #f0f6fc;
          font-size: 25px;
          letter-spacing: -.03em;
        }

        .cardHeading p {
          margin: 8px 0 0;
          color: #90a9c0;
          font-size: 12px;
        }

        .securityRow {
          height: 31px;
          margin: 18px 0 12px;
          padding: 0 8px;
          display: flex;
          align-items: center;
          gap: 6px;
          color: #7f9bb2;
          background: rgba(8, 42, 68, .48);
          font-size: 9px;
        }

        .securityRow .check {
          width: 15px;
          height: 15px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #35e0aa;
          border: 1px solid rgba(53, 224, 170, .4);
          background: rgba(53, 224, 170, .08);
          font-size: 9px;
          font-weight: 900;
        }

        .securityRow i {
          width: 2px;
          height: 2px;
          margin: 0 4px;
          border-radius: 50%;
          background: #547088;
        }

        form {
          display: block;
        }

        .field {
          position: relative;
          display: flex;
          align-items: center;
          height: 49px;
          margin-top: 12px;
          border: 1px solid rgba(84, 132, 168, .38);
          border-radius: 7px;
          background: rgba(10, 35, 57, .67);
          transition: border-color .2s ease, box-shadow .2s ease;
        }

        .field:focus-within {
          border-color: rgba(22, 165, 255, .8);
          box-shadow: 0 0 0 2px rgba(22, 165, 255, .08);
        }

        .fieldIcon {
          width: 45px;
          display: grid;
          place-items: center;
          color: #7f9bb2;
        }

        .fieldIcon svg {
          width: 18px;
          height: 18px;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.5;
        }

        .field input {
          min-width: 0;
          width: 100%;
          height: 100%;
          padding: 0 44px 0 0;
          border: 0;
          outline: 0;
          color: #edf6fd;
          background: transparent;
          font-size: 12px;
        }

        .field input::placeholder {
          color: #8199ad;
        }

        .passwordToggle {
          position: absolute;
          right: 10px;
          top: 50%;
          width: 28px;
          height: 28px;
          padding: 0;
          display: grid;
          place-items: center;
          transform: translateY(-50%);
          border: 0;
          color: #d3e3ee;
          background: transparent;
          cursor: pointer;
        }

        .passwordToggle svg {
          width: 18px;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.5;
        }

        .formMeta {
          margin: 10px 0 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: #718da5;
          font-size: 9px;
        }

        .remember {
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
        }

        .remember input {
          width: 12px;
          height: 12px;
          accent-color: #18a9ff;
          margin: 0;
        }

        .formMeta a {
          color: #17a7ff;
          text-decoration: none;
          font-weight: 800;
        }

        .message {
          margin-top: 10px;
          padding: 9px 10px;
          border: 1px solid rgba(255, 105, 105, .25);
          border-radius: 6px;
          color: #ffb6b6;
          background: rgba(150, 38, 38, .13);
          font-size: 10px;
        }

        .loginButton {
          width: 100%;
          height: 47px;
          margin-top: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          border: 0;
          border-radius: 7px;
          color: white;
          font-size: 13px;
          font-weight: 900;
          background: linear-gradient(100deg, #13b4f4, #2c6ff3);
          box-shadow: 0 12px 27px rgba(18, 119, 243, .16);
          cursor: pointer;
          transition: transform .2s ease, filter .2s ease;
        }

        .loginButton:hover:not(:disabled) {
          transform: translateY(-1px);
          filter: brightness(1.06);
        }

        .loginButton:disabled {
          cursor: wait;
          opacity: .72;
        }

        .loginArrow {
          font-size: 17px;
          font-weight: 400;
        }

        .spinner {
          width: 15px;
          height: 15px;
          border: 2px solid rgba(255,255,255,.35);
          border-top-color: white;
          border-radius: 50%;
          animation: spin .75s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .orDivider {
          margin: 24px 0 19px;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 12px;
        }

        .orDivider span {
          height: 1px;
          background: rgba(91, 131, 161, .28);
        }

        .orDivider em {
          color: #7991a5;
          font-size: 9px;
          font-style: normal;
        }

        .secureNote {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          color: #7e97ad;
          font-size: 10px;
        }

        .secureNote svg {
          width: 14px;
          height: 14px;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.5;
        }

        .sideLabel {
          position: absolute;
          z-index: 10;
          right: 13px;
          top: 82%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          color: #5d8cab;
        }

        .sideLabel span {
          writing-mode: vertical-rl;
          font-size: 9px;
          letter-spacing: .25em;
          font-weight: 800;
        }

        .sideLabel i {
          width: 1px;
          height: 72px;
          background: linear-gradient(#149eff, transparent);
        }

        .footer {
          position: absolute;
          z-index: 12;
          left: 48px;
          right: 48px;
          bottom: 13px;
          display: flex;
          align-items: center;
          gap: 12px;
          color: #66859d;
          font-size: 8px;
          letter-spacing: .18em;
          font-weight: 800;
        }

        .footer i {
          width: 1px;
          height: 10px;
          background: rgba(101, 139, 163, .35);
        }

        .anchorTarget {
          position: absolute;
          pointer-events: none;
        }

        .lightMode {
          --bg: #eaf5fb;
          --bg2: #d9eef9;
          --panel: rgba(241, 249, 253, .96);
          --panelSoft: rgba(229, 244, 251, .8);
          --line: rgba(20, 117, 173, .25);
          --text: #0a2236;
          --muted: #47677f;
        }

        .lightMode .background {
          opacity: .72;
        }

        .lightMode .page {
          background:
            radial-gradient(circle at 50% 48%, rgba(28, 164, 255, .13), transparent 29%),
            linear-gradient(120deg, #edf8fd, #dbeef8 55%, #eef8fd);
        }

        .lightMode .header,
        .lightMode .loginCard,
        .lightMode .node,
        .lightMode .coreNode {
          background: rgba(242, 250, 254, .88);
        }

        .lightMode h1,
        .lightMode .cardHeading h2,
        .lightMode .nav a.active {
          color: #0a2439;
        }

        @media (max-width: 1120px) {
          .header,
          .hero {
            width: calc(100% - 40px);
          }

          .nav {
            gap: 24px;
            margin-right: 15px;
          }

          .hero {
            grid-template-columns: minmax(0, 44%) minmax(320px, 34%) minmax(300px, 1fr);
          }

          h1 {
            font-size: clamp(39px, 4.4vw, 55px);
          }

          .loginCard {
            width: min(100%, 365px);
            padding: 26px 27px 24px;
          }
        }

        @media (max-width: 900px) {
          .header {
            width: calc(100% - 24px);
          }

          .nav {
            position: absolute;
            top: 74px;
            right: 10px;
            width: 220px;
            height: auto;
            padding: 10px;
            display: none;
            flex-direction: column;
            gap: 2px;
            border: 1px solid rgba(45, 146, 220, .35);
            border-radius: 14px;
            background: rgba(4, 23, 40, .98);
            box-shadow: 0 20px 50px rgba(0,0,0,.3);
          }

          .nav.navOpen {
            display: flex;
          }

          .nav a {
            min-height: 42px;
            padding: 0 13px;
            border-radius: 8px;
          }

          .nav a.active::after {
            display: none;
          }

          .nav a:hover,
          .nav a.active {
            background: rgba(18, 157, 247, .09);
          }

          .hero {
            width: calc(100% - 24px);
            grid-template-columns: 1fr 1fr;
            min-height: auto;
            padding-top: 32px;
            padding-bottom: 80px;
          }

          .heroCopy {
            grid-column: 1 / 2;
          }

          .networkStage {
            grid-column: 2 / 3;
            width: min(100%, 430px);
          }

          .loginCard {
            grid-column: 1 / -1;
            width: min(500px, 100%);
            justify-self: center;
            margin-top: -8px;
          }

          .sideLabel {
            display: none;
          }
        }

        @media (max-width: 650px) {
          .page {
            overflow-y: auto;
          }

          .header {
            height: 70px;
            border-radius: 0 0 20px 20px;
            padding: 0 9px;
          }

          .brand img {
            width: 49px;
            height: 49px;
          }

          .brandText {
            font-size: 16px;
          }

          .modeButton,
          .langButton {
            display: none;
          }

          .searchButton {
            display: none;
          }

          .hero {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            width: calc(100% - 24px);
            padding-top: 25px;
          }

          .heroCopy {
            padding: 0 6px;
          }

          .valuePills {
            margin-bottom: 21px;
          }

          .eyebrow {
            font-size: 9px;
          }

          h1 {
            font-size: clamp(39px, 12vw, 57px);
            line-height: 1;
          }

          .description {
            font-size: 13px;
          }

          .heroActions {
            gap: 13px;
          }

          .learnButton {
            min-width: 165px;
          }

          .networkStage {
            width: min(100%, 370px);
            margin: 8px auto -2px;
            transform: none;
          }

          .loginCard {
            margin-top: 4px;
            padding: 25px 20px 23px;
          }

          .footer {
            position: relative;
            left: auto;
            right: auto;
            bottom: auto;
            margin: 5px 20px 18px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .dataPoint,
          .spinner {
            animation: none !important;
          }

          .learnButton,
          .loginButton {
            transition: none !important;
          }
        }
      `}</style>
    </main>
  );
}
