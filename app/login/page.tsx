"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

type RobotExpression =
  | "idle"
  | "happy"
  | "curious"
  | "thinking"
  | "surprised"
  | "sad"
  | "loading";

type RobotAvatarProps = {
  size?: number;
  expression?: RobotExpression;
  trackCursor?: boolean;
  className?: string;
};

function RobotAvatar({
  size = 430,
  expression = "idle",
  trackCursor = true,
  className = "",
}: RobotAvatarProps) {
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    if (!trackCursor) {
      setCursor({ x: 0, y: 0 });
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const x = Math.max(
        -1,
        Math.min(1, (event.clientX / window.innerWidth) * 2 - 1),
      );
      const y = Math.max(
        -1,
        Math.min(1, (event.clientY / window.innerHeight) * 2 - 1),
      );
      setCursor({ x, y });
    };

    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [trackCursor]);

  useEffect(() => {
    let timeout: number;
    let stopped = false;

    const scheduleBlink = () => {
      const delay = 2400 + Math.random() * 3600;
      timeout = window.setTimeout(() => {
        if (stopped) return;
        setBlink(true);
        window.setTimeout(() => {
          if (!stopped) setBlink(false);
        }, 120);
        scheduleBlink();
      }, delay);
    };

    scheduleBlink();
    return () => {
      stopped = true;
      window.clearTimeout(timeout);
    };
  }, []);

  const isHappy = expression === "happy";
  const isSad = expression === "sad";
  const isThinking = expression === "thinking";
  const isCurious = expression === "curious";
  const isSurprised = expression === "surprised";
  const isLoading = expression === "loading";

  const pupilX = trackCursor ? cursor.x * 8 : 0;
  const pupilY = trackCursor ? cursor.y * 5 : 0;
  const headTilt = isCurious ? -3.5 : isThinking ? 3 : isSad ? -2 : 0;

  return (
    <div
      className={`robotAvatar robot-${expression} ${className}`}
      style={
        {
          width: size,
          height: size,
          "--head-tilt": `${headTilt}deg`,
        } as any
      }
      role="img"
      aria-label={`PKC assistant: ${expression}`}
    >
      <div className="robotGlow" aria-hidden="true" />
      <div className="robotShadow" aria-hidden="true" />

      <svg
        className="robotSvg"
        viewBox="0 0 430 430"
        width={size}
        height={size}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="shell" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.42" stopColor="#e9f3f7" />
            <stop offset="1" stopColor="#a9c0cb" />
          </linearGradient>
          <linearGradient id="shellEdge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#dff8ff" />
            <stop offset="1" stopColor="#6e94a3" />
          </linearGradient>
          <linearGradient id="face" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#153c4b" />
            <stop offset="0.55" stopColor="#08242f" />
            <stop offset="1" stopColor="#04141b" />
          </linearGradient>
          <linearGradient id="cyan" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#a8f7ff" />
            <stop offset="0.45" stopColor="#4de1f5" />
            <stop offset="1" stopColor="#00a9dc" />
          </linearGradient>
          <radialGradient id="eyeGlow">
            <stop offset="0" stopColor="#d9ffff" />
            <stop offset="0.2" stopColor="#67e8f9" />
            <stop offset="1" stopColor="#00a8d8" stopOpacity="0" />
          </radialGradient>
          <filter id="shadow" x="-30%" y="-30%" width="160%" height="180%">
            <feDropShadow
              dx="0"
              dy="22"
              stdDeviation="17"
              floodColor="#000000"
              floodOpacity=".42"
            />
          </filter>
          <filter id="softGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>

        <ellipse
          cx="215"
          cy="386"
          rx="108"
          ry="15"
          fill="#000"
          opacity=".28"
        />

        <g className="robotBody" filter="url(#shadow)">
          <path
            d="M161 294h108l16 67H145l16-67Z"
            fill="url(#face)"
            stroke="#5c7f8d"
            strokeWidth="3"
          />
          <rect
            x="112"
            y="336"
            width="206"
            height="48"
            rx="24"
            fill="url(#shell)"
            stroke="url(#shellEdge)"
            strokeWidth="3"
          />
          <rect x="148" y="348" width="134" height="17" rx="8.5" fill="#09222c" />
          <circle cx="215" cy="356.5" r="5" fill="url(#cyan)" />

          <g className="antenna">
            <path
              d="M215 86V48"
              stroke="#91adb8"
              strokeWidth="8"
              strokeLinecap="round"
            />
            <circle
              cx="215"
              cy="35"
              r="14"
              fill="url(#cyan)"
              stroke="#d7fbff"
              strokeWidth="3"
            />
            <circle cx="210" cy="30" r="4" fill="#fff" opacity=".8" />
          </g>

          <g className="sideSensor leftSensor">
            <path
              d="M88 176H62"
              stroke="#91adb8"
              strokeWidth="9"
              strokeLinecap="round"
            />
            <circle cx="53" cy="176" r="11" fill="url(#cyan)" />
          </g>
          <g className="sideSensor rightSensor">
            <path
              d="M342 176h26"
              stroke="#91adb8"
              strokeWidth="9"
              strokeLinecap="round"
            />
            <circle cx="377" cy="176" r="11" fill="url(#cyan)" />
          </g>

          <g className="head">
            <rect
              x="69"
              y="105"
              width="292"
              height="205"
              rx="72"
              fill="url(#shell)"
              stroke="url(#shellEdge)"
              strokeWidth="4"
            />
            <rect
              x="89"
              y="124"
              width="252"
              height="166"
              rx="57"
              fill="url(#face)"
              stroke="#2c5563"
              strokeWidth="3"
            />

            <path
              d="M113 142Q215 119 317 142"
              fill="none"
              stroke="#ffffff"
              strokeWidth="3"
              opacity=".28"
            />

            <g className="faceEyes">
              <rect
                x="116"
                y="166"
                width="74"
                height="67"
                rx="26"
                fill="#0b2c38"
                stroke="#3e6876"
                strokeWidth="2"
              />
              <rect
                x="240"
                y="166"
                width="74"
                height="67"
                rx="26"
                fill="#0b2c38"
                stroke="#3e6876"
                strokeWidth="2"
              />

              {blink ? (
                <>
                  <path
                    d="M130 201q23 8 46 0"
                    fill="none"
                    stroke="#67e8f9"
                    strokeWidth="8"
                    strokeLinecap="round"
                  />
                  <path
                    d="M254 201q23 8 46 0"
                    fill="none"
                    stroke="#67e8f9"
                    strokeWidth="8"
                    strokeLinecap="round"
                  />
                </>
              ) : isHappy ? (
                <>
                  <path
                    d="M130 204q23-25 46 0"
                    fill="none"
                    stroke="#67e8f9"
                    strokeWidth="9"
                    strokeLinecap="round"
                  />
                  <path
                    d="M254 204q23-25 46 0"
                    fill="none"
                    stroke="#67e8f9"
                    strokeWidth="9"
                    strokeLinecap="round"
                  />
                </>
              ) : isSad ? (
                <>
                  <path
                    d="M130 201q23 18 46 0"
                    fill="none"
                    stroke="#67e8f9"
                    strokeWidth="8"
                    strokeLinecap="round"
                  />
                  <path
                    d="M254 201q23 18 46 0"
                    fill="none"
                    stroke="#67e8f9"
                    strokeWidth="8"
                    strokeLinecap="round"
                  />
                </>
              ) : (
                <>
                  <circle
                    cx={153 + pupilX}
                    cy={199 + pupilY}
                    r={isSurprised ? 17 : 12}
                    fill="url(#cyan)"
                  />
                  <circle
                    cx={277 + pupilX}
                    cy={199 + pupilY}
                    r={isSurprised ? 17 : 12}
                    fill="url(#cyan)"
                  />
                  <circle
                    cx={149 + pupilX}
                    cy={195 + pupilY}
                    r="4"
                    fill="#fff"
                    opacity=".92"
                  />
                  <circle
                    cx={273 + pupilX}
                    cy={195 + pupilY}
                    r="4"
                    fill="#fff"
                    opacity=".92"
                  />
                </>
              )}
            </g>

            {isCurious && (
              <>
                <path
                  d="M125 157q25-15 55-3"
                  fill="none"
                  stroke="#9ab8c2"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <path
                  d="M250 153q26-10 53 6"
                  fill="none"
                  stroke="#9ab8c2"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
              </>
            )}

            {isThinking && (
              <>
                <path
                  d="M125 154q27-8 55 2"
                  fill="none"
                  stroke="#9ab8c2"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <path
                  d="M250 157q27-16 54-4"
                  fill="none"
                  stroke="#9ab8c2"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
              </>
            )}

            {isSad && (
              <path
                d="M142 246q18-13 36-2"
                fill="none"
                stroke="#5fcfe2"
                strokeWidth="4"
                strokeLinecap="round"
                opacity=".7"
              />
            )}

            <path
              className="mouth"
              d={
                isSad
                  ? "M180 260q35-23 70 0"
                  : isHappy
                    ? "M179 250q36 29 72 0"
                    : isSurprised
                      ? "M207 251a10 10 0 1 0 16 0a10 10 0 1 0-16 0"
                      : isThinking
                        ? "M192 258q23 7 46 0"
                        : "M187 257q28 10 56 0"
              }
              fill="none"
              stroke="#67e8f9"
              strokeWidth="7"
              strokeLinecap="round"
            />

            {isLoading && (
              <g className="scanRing">
                <circle
                  cx="215"
                  cy="255"
                  r="28"
                  fill="none"
                  stroke="#67e8f9"
                  strokeWidth="4"
                  strokeDasharray="11 9"
                  opacity=".85"
                />
                <circle cx="215" cy="255" r="42" fill="url(#eyeGlow)" opacity=".12" />
              </g>
            )}

            <rect
              x="169"
              y="91"
              width="92"
              height="24"
              rx="12"
              fill="#f2fdff"
              opacity=".92"
            />
            <circle cx="190" cy="103" r="4" fill="#00a8d8" />
            <circle cx="215" cy="103" r="4" fill="#00a8d8" />
            <circle cx="240" cy="103" r="4" fill="#00a8d8" />
          </g>
        </g>
      </svg>

      <div className="robotSpark sparkOne" aria-hidden="true" />
      <div className="robotSpark sparkTwo" aria-hidden="true" />
      <div className="robotSpark sparkThree" aria-hidden="true" />
    </div>
  );
}

const PKC_LOGO =
  "data:image/webp;base64,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";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [emailTouched, setEmailTouched] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [passwordToggleMessage, setPasswordToggleMessage] = useState("");
  const [loginErrorMessage, setLoginErrorMessage] = useState("");
  const [robotInteraction, setRobotInteraction] = useState<
    "none" | "email" | "password" | "passwordToggle" | "remember" | "forgot" | "signin"
  >("none");
  const [robotStatus, setRobotStatus] = useState<
    "idle" | "email" | "password" | "loading" | "error" | "success"
  >("idle");

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  useEffect(() => {
    document.title = "PKC BIZOFT | Business Technology Platform";

    const bootTimer = window.setTimeout(() => {
      setBooting(false);
    }, 1350);

    return () => window.clearTimeout(bootTimer);
  }, []);

  const robotExpression: RobotExpression =
    robotStatus === "loading"
      ? "loading"
      : robotStatus === "error"
        ? "sad"
        : robotStatus === "success"
          ? "happy"
          : robotInteraction === "signin"
            ? "happy"
            : robotInteraction === "remember" || robotInteraction === "forgot"
              ? "curious"
              : robotStatus === "password"
                ? "thinking"
                : robotStatus === "email"
                  ? "curious"
                  : "idle";

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setMessage("");
    setLoginErrorMessage("");
    setRobotStatus("loading");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      const friendlyMessage = error.message
        .toLowerCase()
        .includes("invalid login credentials")
        ? "The email or password is incorrect. Please try again."
        : error.message.toLowerCase().includes("email not confirmed")
          ? "Please confirm your email address before signing in."
          : "We couldn't sign you in right now. Please check your details and try again.";

      setMessage(friendlyMessage);
      setLoginErrorMessage(
        error.message.toLowerCase().includes("email not confirmed")
          ? "Your email still needs to be confirmed."
          : "Those email and password details don't match an account. Let's check them and try again.",
      );
      setRobotStatus("error");
      setLoading(false);
      return;
    }

    setRobotStatus("success");
    window.setTimeout(() => {
      window.location.href = "/clients";
    }, 850);
  };

  return (
    <main className={`page ${booting ? "isBooting" : "isOnline"}`}>
      <div className="background" aria-hidden="true">
        <div className="shape shapeOne" />
        <div className="shape shapeTwo" />
        <div className="shape shapeThree" />
        <div className="arc arcOne" />
        <div className="arc arcTwo" />
        <div className="grid" />
        <div className="scanline" />
        <div className="scanline scanlineSecond" />
        <div className="backgroundGlow backgroundGlowOne" />
        <div className="backgroundGlow backgroundGlowTwo" />
        <div className="particles">
          {Array.from({ length: 18 }, (_, index) => (
            <span key={index} className={`particle particle${index + 1}`} />
          ))}
        </div>
      </div>

      <div className={`systemBoot ${booting ? "visible" : "hidden"}`} aria-hidden={!booting}>
        <div className="bootLogo">
          <img src={PKC_LOGO} alt="" />
        </div>
        <div className="bootLine" />
        <div className="bootTitle">PKC <strong>BIZOFT</strong></div>
        <div className="bootStatus"><span /> AUTHENTICATION SYSTEM ONLINE</div>
      </div>

      <header className="header">
        <a className="brand" href="/" aria-label="PKC BIZOFT home">
          <img src={PKC_LOGO} alt="" />
          <span className="brandText">
            PKC <strong>BIZOFT</strong>
          </span>
        </a>

        <nav className="headerNav" aria-label="Primary navigation">
          <a href="/" className="headerNavLink homeLink" aria-label="Go to PKC BIZOFT home">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 10.8 12 3l9 7.8" />
              <path d="M5.5 9.5V21h13V9.5" />
              <path d="M9.5 21v-6.5h5V21" />
            </svg>
            <span>Home</span>
          </a>
          <a href="#login" className="headerNavLink active" aria-current="page">
            <span>Sign in</span>
            <i aria-hidden="true">→</i>
          </a>
        </nav>
      </header>

      <section className="hero">
        <div
          className={`robotArea ${passwordFocused && !showPassword ? "privacyMode" : ""}`}
          id="robot"
          aria-label="PKC BIZOFT assistant"
        >
          <div className="robotAura" aria-hidden="true" />
          <RobotAvatar
            size={500}
            expression={robotExpression}
            trackCursor={!passwordFocused && robotStatus !== "loading"}
            className={`pkcRobot ${robotInteraction !== "none" ? `robotInteraction-${robotInteraction}` : ""}`}
          />

          <div className="privacyHands" aria-hidden="true">
            <span className="privacyHand left" />
            <span className="privacyHand right" />
          </div>

          <div className="robotReaction" aria-live="polite">
            {robotStatus === "loading"
              ? "Checking everything…"
              : robotStatus === "error"
                ? loginErrorMessage || "Those credentials don't match. Let's try again."
                : robotStatus === "success"
                  ? "Welcome back!"
                  : passwordToggleMessage
                    ? passwordToggleMessage
                    : robotInteraction === "remember"
                    ? rememberMe
                      ? "I won't forget you!"
                      : "Okay, I won't remember you this time."
                    : robotInteraction === "forgot"
                      ? "Forgot something? I've got you."
                      : robotInteraction === "signin"
                        ? "Ready when you are!"
                        : robotInteraction === "email"
                          ? email.trim().length === 0
                            ? "Your email is empty. Give me an email to get started."
                            : !isEmailValid
                              ? "That email is missing an @ or a domain."
                              : "Nice email. I'm listening."
                          : robotInteraction === "passwordToggle"
                            ? showPassword
                              ? "There you go! The password is visible now."
                              : "Back undercover. Your password is hidden again."
                            : robotInteraction === "password"
                              ? password.length === 0
                                ? "Don't forget your password."
                                : "Shhh… secret stuff goes here."
                              : email.trim().length === 0 && emailTouched
                                ? "Your email is still empty."
                                : emailTouched && email.length > 0 && !isEmailValid
                                  ? "Your email needs an @ and a domain."
                                  : ""}
          </div>
        </div>

        <section
          className="loginCard"
          id="login"
          aria-label="Login"
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            event.currentTarget.style.setProperty("--mouse-x", `${event.clientX - rect.left}px`);
            event.currentTarget.style.setProperty("--mouse-y", `${event.clientY - rect.top}px`);
          }}
        >
          <div className="cardCursorGlow" aria-hidden="true" />
          <div className="cardAccent" />

          <div className="cardHeader">
            <span className="cardKicker">PKC BIZOFT</span>
            <h2>Welcome back.</h2>
            <p>Sign in to continue to your workspace.</p>
          </div>

          <form onSubmit={handleLogin}>
            <label
              className="field"
            >
              <span className="fieldIcon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
                  <path d="m4.5 7 7.5 6 7.5-6" />
                </svg>
              </span>
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (robotStatus === "error") setRobotStatus("email");
                }}
                onFocus={() => {
                  if (!loading && robotStatus !== "success") {
                    setRobotStatus("email");
                    setRobotInteraction("email");
                  }
                }}
                onInvalid={(event) => {
                  event.preventDefault();
                  if (!loading && robotStatus !== "success") {
                    setRobotStatus("email");
                    setRobotInteraction("email");
                  }
                }}
                onBlur={() => {
                  setEmailTouched(true);
                  if (!loading && robotStatus === "email") {
                    if (email.trim().length > 0 && !isEmailValid) {
                      setRobotStatus("email");
                      setRobotInteraction("email");
                    } else {
                      setRobotStatus("idle");
                      setRobotInteraction("none");
                    }
                  }
                }}
                autoComplete="email"
                inputMode="email"
                spellCheck={false}
                aria-invalid={
                  emailTouched && email.length > 0 && !isEmailValid
                }
                required
              />
            </label>

            {emailTouched && email.length > 0 && !isEmailValid && (
              <p className="fieldHint" role="status">
                Enter a complete email, like name@gmail.com.
              </p>
            )}

            <label
              className="field"
            >
              <span className="fieldIcon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <rect x="5" y="10" width="14" height="10" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                  <circle cx="12" cy="15" r="1" />
                </svg>
              </span>

              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (!loading && robotStatus !== "success") {
                    setRobotStatus("password");
                  }
                }}
                onFocus={() => {
                  setPasswordFocused(true);
                  if (!loading && robotStatus !== "success") {
                    setRobotStatus("password");
                    setRobotInteraction("password");
                  }
                }}
                onInvalid={(event) => {
                  event.preventDefault();
                  if (!loading && robotStatus !== "success") {
                    setPasswordFocused(true);
                    setRobotStatus("password");
                    setRobotInteraction("password");
                  }
                }}
                onBlur={(event) => {
                  // Keep the privacy hands up when focus moves from the password
                  // input to the show/hide button inside the same field.
                  // Remove them as soon as focus leaves the password field entirely.
                  const nextFocusedElement = event.relatedTarget as Node | null;
                  const passwordField = event.currentTarget.closest(".field");
                  const focusStaysInPasswordField =
                    !!passwordField &&
                    !!nextFocusedElement &&
                    passwordField.contains(nextFocusedElement);

                  if (!focusStaysInPasswordField) {
                    setPasswordFocused(false);
                    if (!loading && robotStatus === "password") {
                      setRobotInteraction("none");
                      setRobotStatus("idle");
                    }
                  }
                }}
                autoComplete="current-password"
                required
              />

              <button
                type="button"
                className="passwordToggle"
                onMouseDown={(event) => {
                  // Prevent the password input from blurring when the eye is clicked.
                  // This keeps the privacy hands visible while the user toggles visibility.
                  event.preventDefault();
                }}
                onClick={() => {
                  setShowPassword((value) => {
                    const nextValue = !value;
                    if (!loading && robotStatus !== "success") {
                      setPasswordToggleMessage(
                        nextValue
                          ? "There you go! The password is visible now."
                          : "Back undercover. Your password is hidden again.",
                      );
                      setRobotStatus("password");
                      setRobotInteraction("passwordToggle");
                      window.setTimeout(() => {
                        setPasswordToggleMessage("");
                        setRobotInteraction((current) =>
                          current === "passwordToggle" ? "none" : current,
                        );
                      }, 1800);
                    }
                    return nextValue;
                  });
                  setPasswordFocused(true);
                }}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {showPassword ? (
                    <>
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                      <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 8.8 4.1 9.8 7a10.7 10.7 0 0 1-3.1 4.6" />
                      <path d="M6.3 6.3C4.5 7.5 3.3 9.1 2.2 12c1 2.9 4.8 7 9.8 7 1.1 0 2.1-.2 3-.5" />
                    </>
                  ) : (
                    <>
                      <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" />
                      <circle cx="12" cy="12" r="2.5" />
                    </>
                  )}
                </svg>
              </button>
            </label>

            <div className="formMeta">
              <label
                className={`remember ${rememberMe ? "isChecked" : ""}`}
                onMouseEnter={() => {
                  if (!loading && robotStatus !== "success") setRobotInteraction("remember");
                }}
                onMouseLeave={() => {
                  if (!loading && robotStatus !== "success") setRobotInteraction("none");
                }}
              >
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => {
                    setRememberMe(event.target.checked);
                    if (!loading && robotStatus !== "success") {
                      setRobotInteraction("remember");
                      window.setTimeout(() => setRobotInteraction("none"), 650);
                    }
                  }}
                />
                <span className="rememberBox" aria-hidden="true">
                  <svg viewBox="0 0 20 20">
                    <path d="m4.5 10.2 3.4 3.4 7.6-7.4" />
                  </svg>
                </span>
                <span className="rememberText">Remember me</span>
              </label>
              <a
                href="/forgot-password"
                onMouseEnter={() => {
                  if (!loading && robotStatus !== "success") setRobotInteraction("forgot");
                }}
                onMouseLeave={() => setRobotInteraction("none")}
                onFocus={() => {
                  if (!loading && robotStatus !== "success") setRobotInteraction("forgot");
                }}
                onBlur={() => setRobotInteraction("none")}
              >
                Forgot password?
              </a>
            </div>

            {message && (
              <div className="message" role="alert" aria-live="polite">
                {message}
              </div>
            )}

            <button
              className="loginButton"
              type="submit"
              disabled={loading}
              aria-busy={loading}
              onMouseEnter={() => {
                if (!loading && robotStatus !== "success") setRobotInteraction("signin");
              }}
              onMouseLeave={() => setRobotInteraction("none")}
              onFocus={() => {
                if (!loading && robotStatus !== "success") setRobotInteraction("signin");
              }}
              onBlur={() => setRobotInteraction("none")}
            >
              <span>{loading ? "Signing in…" : "Sign in"}</span>
              <span className="buttonArrow">→</span>
            </button>
          </form>

          <div className="secureNote">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3.5 19 6v5.3c0 4.4-2.9 7.9-7 9.2-4.1-1.3-7-4.8-7-9.2V6l7-2.5Z" />
              <path d="m9.4 12 1.7 1.7 3.6-3.8" />
            </svg>
            <span>Secure authentication</span>
          </div>
        </section>
      </section>

      <footer className="footer">
        <span>PKC BIZOFT</span>
        <span className="footerDot" />
        <span>© 2026</span>
      </footer>

      <style jsx>{`
        :global(*) {
          box-sizing: border-box;
        }

        :global(html),
        :global(body) {
          margin: 0;
          min-height: 100%;
          background: #02080c;
        }

        :global(body) {
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        :global(a) {
          color: inherit;
          text-decoration: none;
        }

        .page {
          position: relative;
          min-height: 100vh;
          overflow-x: hidden;
          isolation: isolate;
          color: #eaffff;
          background:
            radial-gradient(
              circle at 53% 43%,
              rgba(0, 172, 220, 0.06),
              transparent 28%
            ),
            #02080c;
        }

        .background {
          position: fixed;
          inset: 0;
          z-index: -2;
          pointer-events: none;
          overflow: hidden;
          background: #02080c;
        }

        .ambient {
          position: absolute;
          border-radius: 50%;
          filter: blur(22px);
          opacity: 0.7;
          animation: ambientDrift 14s ease-in-out infinite alternate;
        }

        .ambientOne {
          width: 680px;
          height: 680px;
          top: -390px;
          right: -180px;
          background: radial-gradient(
            circle,
            rgba(0, 199, 255, 0.14),
            rgba(0, 120, 180, 0.035) 44%,
            transparent 72%
          );
        }

        .ambientTwo {
          width: 580px;
          height: 580px;
          bottom: -350px;
          left: -250px;
          background: radial-gradient(
            circle,
            rgba(0, 117, 170, 0.13),
            rgba(0, 75, 110, 0.035) 45%,
            transparent 72%
          );
          animation-delay: -5s;
        }

        .ambientThree {
          width: 500px;
          height: 500px;
          top: 30%;
          left: 37%;
          background: radial-gradient(
            circle,
            rgba(25, 190, 220, 0.06),
            transparent 68%
          );
          animation-delay: -8s;
        }

        .grid {
          position: absolute;
          inset: 0;
          opacity: 0.08;
          background-image:
            linear-gradient(rgba(70, 210, 235, 0.07) 1px, transparent 1px),
            linear-gradient(
              90deg,
              rgba(70, 210, 235, 0.07) 1px,
              transparent 1px
            );
          background-size: 64px 64px;
          mask-image: linear-gradient(
            to bottom,
            black,
            rgba(0, 0, 0, 0.45) 65%,
            transparent 100%
          );
        }

        .vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(
            circle at center,
            transparent 30%,
            rgba(0, 4, 7, 0.58) 100%
          );
        }

        .header {
          position: relative;
          z-index: 10;
          width: min(1320px, calc(100% - 64px));
          min-height: 84px;
          margin: 0 auto;
          display: flex;
          align-items: center;
        }

        .brand {
          display: inline-flex;
          align-items: center;
          gap: 11px;
        }

        .brandLogo {
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(103, 232, 249, 0.09);
          border-radius: 12px;
          background: rgba(5, 27, 38, 0.38);
          overflow: hidden;
        }

        .brandLogo img {
          width: 32px;
          height: 32px;
          object-fit: contain;
        }

        .brandText {
          color: #eaffff;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.08em;
        }

        .brandText strong {
          color: #67e8f9;
        }

        .headerSignIn {
          margin-left: auto;
          display: inline-flex;
          align-items: center;
          gap: 9px;
          padding: 9px 13px;
          border: 1px solid rgba(103, 232, 249, 0.13);
          border-radius: 10px;
          color: #8da9b2;
          font-size: 11px;
          font-weight: 750;
          transition:
            color 0.2s ease,
            border-color 0.2s ease,
            background 0.2s ease;
        }

        .headerSignIn span {
          color: #67e8f9;
          transition: transform 0.2s ease;
        }

        .headerSignIn:hover {
          color: #eaffff;
          border-color: rgba(103, 232, 249, 0.3);
          background: rgba(103, 232, 249, 0.045);
        }

        .headerSignIn:hover span {
          transform: translateX(3px);
        }

        .hero {
          position: relative;
          z-index: 2;
          width: min(1320px, calc(100% - 64px));
          min-height: calc(100vh - 118px);
          margin: 0 auto;
          display: grid;
          grid-template-columns: minmax(520px, 1.05fr) minmax(380px, 0.82fr);
          align-items: center;
          gap: clamp(28px, 4vw, 64px);
          padding: 28px 0 48px;
        }

        .heroCopy {
          align-self: center;
          max-width: 390px;
          animation: enterLeft 0.75s cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }

        .heroKicker {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          margin: 0 0 20px;
          color: #67e8f9;
          font-size: 10px;
          font-weight: 850;
          letter-spacing: 0.18em;
        }

        .heroKicker::before {
          content: "";
          width: 24px;
          height: 1px;
          background: #67e8f9;
          box-shadow: 0 0 10px rgba(103, 232, 249, 0.7);
        }

        .heroCopy h1 {
          margin: 0;
          max-width: 380px;
          color: #ecfeff;
          font-size: clamp(42px, 4.4vw, 66px);
          line-height: 0.98;
          letter-spacing: -0.055em;
          font-weight: 320;
        }

        .heroCopy h1 strong {
          display: block;
          color: #baf7ff;
          font-weight: 700;
        }

        .heroLead {
          max-width: 330px;
          margin: 22px 0 0;
          color: #79939d;
          font-size: 14px;
          line-height: 1.7;
        }

        .robotArea {
          position: relative;
          min-height: 560px;
          display: grid;
          place-items: center;
          overflow: visible;
          animation: enterUp 0.85s cubic-bezier(0.2, 0.8, 0.2, 1) both 0.04s;
        }

        .robotAura {
          position: absolute;
          width: 590px;
          height: 590px;
          border-radius: 50%;
          background: radial-gradient(
            circle,
            rgba(0, 191, 230, 0.105),
            rgba(0, 105, 145, 0.035) 43%,
            transparent 71%
          );
          filter: blur(4px);
        }

        .robotAvatar {
          position: relative;
          z-index: 3;
          display: grid;
          place-items: center;
          transform-origin: 50% 60%;
          animation: robotFloat 5.2s ease-in-out infinite;
          transition: transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .robotSvg {
          position: relative;
          z-index: 2;
          display: block;
          overflow: visible;
        }

        .robotGlow {
          position: absolute;
          z-index: 0;
          width: 300px;
          height: 300px;
          border-radius: 50%;
          background: rgba(0, 205, 240, 0.13);
          filter: blur(58px);
          opacity: 0.75;
        }

        .robotShadow {
          position: absolute;
          z-index: 1;
          bottom: 15px;
          width: 210px;
          height: 28px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.3);
          filter: blur(14px);
        }

        .robotBody {
          transform-origin: 215px 210px;
        }

        .head {
          transform-origin: 215px 205px;
          transform: rotate(var(--head-tilt));
          transition: transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .antenna {
          transform-origin: 215px 80px;
          animation: antennaFloat 3.4s ease-in-out infinite;
        }

        .robot-loading .antenna {
          animation-duration: 0.9s;
        }

        .robot-loading .robotGlow {
          opacity: 1;
          transform: scale(1.12);
        }

        .robot-success .robotSvg {
          animation: celebrate 0.72s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        /* The robot reacts to the controls the user is interacting with. */
        .robotInteraction-email .robotSvg {
          animation: robotReactEmail 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) infinite;
        }

        .robotInteraction-password .robotSvg {
          animation: robotReactPassword 1.1s ease-in-out infinite;
        }

        .robotInteraction-remember .robotSvg {
          animation: robotReactRemember 0.65s cubic-bezier(0.2, 0.9, 0.2, 1);
        }

        .robotInteraction-forgot .robotSvg {
          animation: robotReactForgot 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) infinite;
        }

        .robotInteraction-signin .robotSvg {
          animation: robotReactSignin 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) infinite;
        }

        .robotInteraction-email .robotGlow,
        .robotInteraction-password .robotGlow,
        .robotInteraction-remember .robotGlow,
        .robotInteraction-forgot .robotGlow,
        .robotInteraction-signin .robotGlow {
          opacity: 0.95;
          transform: scale(1.08);
          transition: opacity 0.25s ease, transform 0.35s ease;
        }

        .robotInteraction-email .leftSensor,
        .robotInteraction-email .rightSensor,
        .robotInteraction-password .leftSensor,
        .robotInteraction-password .rightSensor {
          animation: sensorPulse 1.1s ease-in-out infinite;
        }

        .robotInteraction-remember .antenna {
          animation: antennaExcited 0.65s ease-in-out;
        }

        .robotInteraction-forgot .leftSensor,
        .robotInteraction-forgot .rightSensor {
          animation: sensorPulse 1s ease-in-out infinite;
        }

        .robotInteraction-signin .leftSensor,
        .robotInteraction-signin .rightSensor {
          animation: sensorPulse 0.75s ease-in-out infinite;
        }

        .robot-error .robotGlow {
          opacity: 0.55;
          transform: scale(0.9);
        }

        .robot-thinking .head {
          transform: rotate(3deg) translateY(-2px);
        }

        .robot-curious .head {
          transform: rotate(-3.5deg) translateY(-1px);
        }

        .scanRing {
          transform-origin: 215px 255px;
          animation: scan 1s linear infinite;
        }

        .robotSpark {
          position: absolute;
          z-index: 4;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #67e8f9;
          box-shadow: 0 0 14px rgba(103, 232, 249, 0.95);
          opacity: 0.45;
        }

        .sparkOne {
          top: 31%;
          left: 20%;
          animation: spark 3.8s ease-in-out infinite;
        }

        .sparkTwo {
          top: 63%;
          right: 18%;
          animation: spark 4.6s ease-in-out infinite -1.5s;
        }

        .sparkThree {
          top: 20%;
          right: 27%;
          animation: spark 4.2s ease-in-out infinite -2.6s;
        }

        .robotReaction {
          position: absolute;
          z-index: 8;
          top: 30px;
          right: -10px;
          min-width: 245px;
          max-width: 300px;
          padding: 16px 20px;
          transform: translateY(6px) scale(0.96);
          color: #c8f8ff;
          font-size: 13px;
          font-weight: 750;
          letter-spacing: 0.035em;
          text-transform: none;
          text-align: center;
          line-height: 1.45;
          background: rgba(5, 23, 31, 0.88);
          border: 1px solid rgba(103, 232, 249, 0.2);
          border-radius: 16px;
          box-shadow: 0 14px 35px rgba(0, 0, 0, 0.28), 0 0 24px rgba(0, 190, 230, 0.08);
          backdrop-filter: blur(14px);
          opacity: 0;
          transition: opacity 0.2s ease, transform 0.25s ease;
        }

        .robotReaction:not(:empty) {
          opacity: 1;
          transform: translateY(0) scale(1);
          animation: reactionFloat 3.2s ease-in-out infinite;
        }

        .robotReaction::after {
          content: "";
          position: absolute;
          left: 28px;
          bottom: -7px;
          width: 16px;
          height: 16px;
          background: rgba(5, 23, 31, 0.94);
          border-right: 1px solid rgba(103, 232, 249, 0.2);
          border-bottom: 1px solid rgba(103, 232, 249, 0.2);
          transform: rotate(45deg);
        }

        @keyframes reactionFloat {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-5px) scale(1.01); }
        }

        .privacyHands {
          position: absolute;
          z-index: 7;
          left: 50%;
          top: 50%;
          width: 410px;
          height: 410px;
          pointer-events: none;
          opacity: 0;
          transform: translate(-50%, -45%) scale(0.72);
          transition:
            opacity 0.22s ease,
            transform 0.42s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .privacyMode .privacyHands {
          opacity: 1;
          transform: translate(-50%, -45%) scale(1);
        }

        .privacyHand {
          position: absolute;
          top: 155px;
          width: 72px;
          height: 115px;
          border-radius: 38px 38px 27px 27px;
          background: linear-gradient(145deg, #ffffff, #dcebf2 65%, #aec6d1);
          border: 2px solid rgba(120, 160, 183, 0.55);
          box-shadow:
            0 16px 28px rgba(0, 0, 0, 0.28),
            inset 0 2px 0 rgba(255, 255, 255, 0.9);
        }

        .privacyHand::before {
          content: "";
          position: absolute;
          top: -34px;
          left: 7px;
          width: 57px;
          height: 68px;
          border-radius: 30px 30px 17px 17px;
          background: linear-gradient(145deg, #ffffff, #dcebf2 70%, #b7ced9);
          border: 2px solid rgba(120, 160, 183, 0.5);
          box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.75);
        }

        .privacyHand::after {
          content: "";
          position: absolute;
          top: -20px;
          left: 18px;
          width: 8px;
          height: 52px;
          border-radius: 8px;
          background: rgba(126, 164, 181, 0.25);
          box-shadow:
            11px 2px 0 rgba(126, 164, 181, 0.2),
            22px 1px 0 rgba(126, 164, 181, 0.18),
            33px -1px 0 rgba(126, 164, 181, 0.15);
        }

        .privacyHand.left {
          left: 84px;
          transform: rotate(16deg);
          transform-origin: 50% 100%;
        }

        .privacyHand.right {
          right: 84px;
          transform: rotate(-16deg);
          transform-origin: 50% 100%;
        }

        .privacyHand.right::after {
          left: auto;
          right: 18px;
          box-shadow:
            -11px 2px 0 rgba(126, 164, 181, 0.2),
            -22px 1px 0 rgba(126, 164, 181, 0.18),
            -33px -1px 0 rgba(126, 164, 181, 0.15);
        }

        .loginCard {
          position: relative;
          z-index: 5;
          width: 100%;
          max-width: 380px;
          justify-self: center;
          padding: 30px;
          border: 1px solid rgba(103, 232, 249, 0.14);
          border-radius: 20px;
          background: linear-gradient(
            145deg,
            rgba(7, 25, 34, 0.95),
            rgba(3, 13, 19, 0.96)
          );
          box-shadow:
            0 32px 90px rgba(0, 0, 0, 0.38),
            0 0 55px rgba(0, 145, 190, 0.055),
            inset 0 1px 0 rgba(255, 255, 255, 0.035);
          backdrop-filter: blur(18px);
          animation: enterRight 0.75s cubic-bezier(0.2, 0.8, 0.2, 1) both 0.08s;
          overflow: hidden;
        }

        .loginCard::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            135deg,
            rgba(103, 232, 249, 0.04),
            transparent 35%,
            transparent 70%,
            rgba(0, 150, 200, 0.025)
          );
          pointer-events: none;
        }

        .cardAccent {
          position: absolute;
          top: 0;
          left: 28px;
          right: 28px;
          height: 2px;
          background: linear-gradient(
            90deg,
            transparent,
            #67e8f9,
            transparent
          );
          box-shadow: 0 0 15px rgba(103, 232, 249, 0.6);
        }

        .cardHeader {
          position: relative;
        }

        .cardKicker {
          color: #67e8f9;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: 0.16em;
        }

        .cardHeader h2 {
          margin: 10px 0 7px;
          color: #ecfeff;
          font-size: 29px;
          line-height: 1.1;
          letter-spacing: -0.035em;
        }

        .cardHeader p {
          margin: 0;
          color: #809ca6;
          font-size: 13px;
          line-height: 1.6;
        }

        form {
          position: relative;
          margin-top: 20px;
        }

        .field {
          position: relative;
          display: flex;
          align-items: center;
          margin-top: 12px;
          border: 1px solid rgba(103, 232, 249, 0.11);
          border-radius: 11px;
          background: rgba(1, 11, 16, 0.72);
          transition:
            border-color 0.2s ease,
            box-shadow 0.2s ease,
            background 0.2s ease;
        }

        .field:focus-within {
          border-color: rgba(103, 232, 249, 0.42);
          background: rgba(2, 18, 25, 0.88);
          box-shadow:
            0 0 0 3px rgba(103, 232, 249, 0.05),
            0 0 22px rgba(103, 232, 249, 0.035);
        }

        .fieldIcon {
          width: 46px;
          display: grid;
          place-items: center;
          color: #5c8793;
        }

        .fieldIcon svg {
          width: 18px;
          height: 18px;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.6;
        }

        .field input {
          width: 100%;
          min-width: 0;
          padding: 14px 44px 14px 0;
          border: 0;
          outline: 0;
          background: transparent;
          color: #e8fdff;
          font: inherit;
          font-size: 14px;
        }

        .field input::placeholder {
          color: #55727d;
        }

        .passwordToggle {
          position: absolute;
          right: 9px;
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: #6c8b96;
          cursor: pointer;
        }

        .passwordToggle:hover {
          color: #67e8f9;
          background: rgba(103, 232, 249, 0.05);
        }

        .passwordToggle svg {
          width: 17px;
          height: 17px;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.6;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .fieldHint {
          margin: 6px 4px 0;
          color: #fca5a5;
          font-size: 11px;
        }

        .formMeta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin: 14px 2px 18px;
          color: #718d97;
          font-size: 11px;
        }

        .remember {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          user-select: none;
        }

        .remember input {
          position: absolute;
          width: 1px;
          height: 1px;
          opacity: 0;
          pointer-events: none;
        }

        .rememberBox {
          width: 17px;
          height: 17px;
          display: grid;
          place-items: center;
          flex: 0 0 17px;
          border: 1px solid rgba(103, 232, 249, 0.28);
          border-radius: 5px;
          background: rgba(8, 28, 36, 0.72);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
          transition: background .22s ease, border-color .22s ease, box-shadow .28s ease, transform .22s cubic-bezier(.2,.9,.2,1);
        }

        .rememberBox svg {
          width: 12px;
          height: 12px;
          fill: none;
          stroke: #06212b;
          stroke-width: 2.5;
          stroke-linecap: round;
          stroke-linejoin: round;
          opacity: 0;
          transform: scale(.45) rotate(-12deg);
          transition: opacity .16s ease, transform .28s cubic-bezier(.2,1.4,.3,1);
        }

        .remember:hover .rememberBox {
          border-color: rgba(103, 232, 249, 0.62);
          transform: translateY(-1px);
          box-shadow: 0 0 14px rgba(103, 232, 249, .12);
        }

        .remember:active .rememberBox {
          transform: scale(.9);
        }

        .remember.isChecked .rememberBox {
          background: #67e8f9;
          border-color: #a8f5ff;
          box-shadow: 0 0 0 4px rgba(103, 232, 249, .08), 0 0 18px rgba(103, 232, 249, .28);
          animation: rememberPop .36s cubic-bezier(.2,1.5,.3,1);
        }

        .remember.isChecked .rememberBox svg {
          opacity: 1;
          transform: scale(1) rotate(0);
        }

        .rememberText {
          transition: color .2s ease, transform .2s ease;
        }

        .remember:hover .rememberText,
        .remember.isChecked .rememberText {
          color: #a8eaf2;
        }

        .formMeta a {
          position: relative;
          display: inline-flex;
          align-items: center;
          color: #67cfe2;
          text-decoration: none;
          transition: color .2s ease, transform .2s ease;
        }

        .formMeta a::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: -4px;
          height: 1px;
          background: #67e8f9;
          transform: scaleX(0);
          transform-origin: right;
          transition: transform .25s ease;
          box-shadow: 0 0 8px rgba(103,232,249,.65);
        }

        .formMeta a:hover {
          color: #c5faff;
          transform: translateY(-1px);
        }

        .formMeta a:hover::after,
        .formMeta a:focus-visible::after {
          transform: scaleX(1);
          transform-origin: left;
        }

        .message {
          margin-bottom: 14px;
          padding: 10px 12px;
          border: 1px solid rgba(248, 113, 113, 0.2);
          border-radius: 9px;
          background: rgba(127, 29, 29, 0.16);
          color: #fecaca;
          font-size: 12px;
          line-height: 1.45;
        }

        .loginButton {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          border: 1px solid rgba(103, 232, 249, 0.38);
          border-radius: 11px;
          background: linear-gradient(100deg, #0788ad, #0b6e94);
          color: #efffff;
          box-shadow: 0 12px 28px rgba(0, 119, 160, 0.17);
          cursor: pointer;
          font: inherit;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.04em;
          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease,
            filter 0.2s ease;
        }

        .loginButton {
          position: relative;
          overflow: hidden;
        }

        .loginButton::before {
          content: "";
          position: absolute;
          top: 0;
          bottom: 0;
          left: -35%;
          width: 28%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent);
          transform: skewX(-18deg);
          opacity: 0;
        }

        .loginButton:hover:not(:disabled) {
          transform: translateY(-2px) scale(1.012);
          box-shadow: 0 18px 38px rgba(0, 150, 200, 0.25), 0 0 0 1px rgba(103,232,249,.08);
          filter: brightness(1.08);
        }

        .loginButton:hover:not(:disabled)::before {
          opacity: 1;
          animation: buttonSweep .72s ease-out;
        }

        .loginButton:active:not(:disabled) {
          transform: translateY(0) scale(.985);
        }

        .loginButton:disabled {
          opacity: 0.62;
          cursor: wait;
        }

        .buttonArrow {
          transition: transform 0.2s ease;
        }

        .loginButton:hover:not(:disabled) .buttonArrow {
          transform: translateX(3px);
        }

        .secureNote {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 18px;
          padding-top: 16px;
          border-top: 1px solid rgba(103, 232, 249, 0.07);
          color: #5e7984;
          font-size: 10px;
        }

        .secureNote svg {
          width: 16px;
          height: 16px;
          fill: none;
          stroke: #67e8f9;
          stroke-width: 1.5;
        }

        .footer {
          position: relative;
          z-index: 4;
          width: min(1320px, calc(100% - 64px));
          min-height: 54px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          gap: 9px;
          border-top: 1px solid rgba(103, 232, 249, 0.07);
          color: #49636d;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.13em;
        }

        .footerDot {
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: #67e8f9;
          opacity: 0.45;
        }

        @keyframes rememberPop {
          0% { transform: scale(.72); }
          55% { transform: scale(1.16); }
          100% { transform: scale(1); }
        }

        @keyframes buttonSweep {
          from { left: -35%; }
          to { left: 125%; }
        }

        @keyframes robotFloat {
          0%,
          100% {
            transform: translateY(0) rotate(0deg);
          }
          50% {
            transform: translateY(-8px) rotate(0.35deg);
          }
        }

        @keyframes antennaFloat {
          0%,
          100% {
            transform: rotate(-2deg);
          }
          50% {
            transform: rotate(2deg);
          }
        }

        @keyframes scan {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes celebrate {
          0% {
            transform: translateY(0) scale(1);
          }
          35% {
            transform: translateY(-11px) scale(1.025);
          }
          68% {
            transform: translateY(2px) scale(0.992);
          }
          100% {
            transform: translateY(0) scale(1);
          }
        }

        @keyframes spark {
          0%,
          100% {
            opacity: 0.15;
            transform: translate3d(0, 4px, 0) scale(0.8);
          }
          50% {
            opacity: 0.7;
            transform: translate3d(5px, -9px, 0) scale(1);
          }
        }

        @keyframes robotReactEmail {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          35% { transform: translateY(-3px) rotate(-1.2deg); }
          70% { transform: translateY(0) rotate(1.2deg); }
        }

        @keyframes robotReactPassword {
          0%, 100% { transform: translateY(0) scale(1); }
          45% { transform: translateY(-3px) scale(1.012); }
          70% { transform: translateY(0) scale(1); }
        }

        @keyframes robotReactRemember {
          0% { transform: translateY(0) scale(1); }
          28% { transform: translateY(-7px) scale(1.025); }
          55% { transform: translateY(2px) scale(.995); }
          78% { transform: translateY(-3px) scale(1.01); }
          100% { transform: translateY(0) scale(1); }
        }

        @keyframes robotReactForgot {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          35% { transform: translateY(-3px) rotate(-1deg); }
          70% { transform: translateY(0) rotate(1deg); }
        }

        @keyframes robotReactSignin {
          0%, 100% { transform: translateY(0) scale(1); }
          35% { transform: translateY(-5px) scale(1.018); }
          65% { transform: translateY(-2px) scale(1.008); }
        }

        @keyframes antennaExcited {
          0%, 100% { transform: rotate(0); }
          25% { transform: rotate(-9deg); }
          50% { transform: rotate(8deg); }
          75% { transform: rotate(-5deg); }
        }

        @keyframes sensorPulse {
          0%, 100% { opacity: .7; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.18); }
        }

        @keyframes ambientDrift {
          from {
            transform: translate3d(0, 0, 0) scale(1);
          }
          to {
            transform: translate3d(18px, -14px, 0) scale(1.05);
          }
        }

        @keyframes enterLeft {
          from {
            opacity: 0;
            transform: translateX(-22px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes enterRight {
          from {
            opacity: 0;
            transform: translateX(22px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes enterUp {
          from {
            opacity: 0;
            transform: translateY(18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Premium visual pass */
        .page {
          background:
            radial-gradient(circle at 28% 46%, rgba(0, 195, 235, 0.085), transparent 27%),
            radial-gradient(circle at 78% 52%, rgba(0, 116, 180, 0.07), transparent 30%),
            #02080c;
        }

        .background::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 50% 50%, transparent 0 22%, rgba(103, 232, 249, 0.025) 48%, transparent 70%),
            linear-gradient(180deg, rgba(255,255,255,0.018), transparent 18%, transparent 82%, rgba(0,0,0,0.22));
          pointer-events: none;
        }

        .grid {
          opacity: 0.045;
          background-size: 72px 72px;
          mask-image: radial-gradient(circle at center, black 15%, rgba(0,0,0,.7) 55%, transparent 92%);
          -webkit-mask-image: radial-gradient(circle at center, black 15%, rgba(0,0,0,.7) 55%, transparent 92%);
        }

        .header {
          min-height: 92px;
        }

        .brandLogo {
          width: 44px;
          height: 44px;
          border-color: rgba(103, 232, 249, 0.16);
          border-radius: 14px;
          background: linear-gradient(145deg, rgba(12, 43, 54, .72), rgba(4, 20, 28, .52));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.05), 0 8px 24px rgba(0,0,0,.18);
        }

        .brandLogo img {
          width: 34px;
          height: 34px;
        }

        .brandText {
          font-size: 13px;
          letter-spacing: .11em;
        }

        .headerSignIn {
          padding: 10px 14px;
          border-radius: 12px;
          background: rgba(6, 28, 37, .32);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.025);
        }

        .hero {
          grid-template-columns: minmax(560px, 1.14fr) minmax(400px, .82fr);
          gap: clamp(22px, 3.2vw, 54px);
          padding-top: 16px;
        }

        .robotArea {
          min-height: 590px;
          border-radius: 40px;
          isolation: isolate;
        }

        .robotArea::before {
          content: "";
          position: absolute;
          width: 530px;
          height: 530px;
          border: 1px solid rgba(103, 232, 249, 0.07);
          border-radius: 50%;
          box-shadow:
            0 0 0 34px rgba(103,232,249,.018),
            0 0 0 68px rgba(103,232,249,.012);
          animation: orbitPulse 5.5s ease-in-out infinite;
          pointer-events: none;
        }

        .robotArea::after {
          content: "PKC AI ASSISTANT";
          position: absolute;
          left: 50%;
          bottom: 30px;
          transform: translateX(-50%);
          padding: 7px 12px;
          border: 1px solid rgba(103,232,249,.11);
          border-radius: 999px;
          background: rgba(4, 21, 29, .48);
          color: rgba(135, 202, 214, .62);
          font-size: 8px;
          font-weight: 850;
          letter-spacing: .2em;
          white-space: nowrap;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.025), 0 10px 30px rgba(0,0,0,.18);
          backdrop-filter: blur(10px);
          pointer-events: none;
        }

        .robotAura {
          width: 650px;
          height: 650px;
          background: radial-gradient(circle, rgba(0, 208, 240, .13), rgba(0, 105, 145, .035) 44%, transparent 71%);
        }

        .robotGlow {
          width: 340px;
          height: 340px;
          background: rgba(0, 214, 245, .15);
        }

        .robotReaction {
          top: 18px;
          right: 18px;
          min-width: 300px;
          max-width: 350px;
          padding: 19px 24px;
          border: 1px solid rgba(103,232,249,.26);
          border-radius: 19px;
          background: linear-gradient(145deg, rgba(8, 31, 40, .94), rgba(3, 17, 24, .92));
          box-shadow:
            0 20px 55px rgba(0,0,0,.34),
            0 0 38px rgba(0,190,230,.11),
            inset 0 1px 0 rgba(255,255,255,.055);
          backdrop-filter: blur(18px) saturate(125%);
          font-size: 13px;
          line-height: 1.55;
        }

        .robotReaction::before {
          content: "";
          position: absolute;
          top: 0;
          left: 22px;
          right: 22px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(103,232,249,.7), transparent);
          box-shadow: 0 0 10px rgba(103,232,249,.45);
        }

        .robotReaction::after {
          left: 32px;
          bottom: -8px;
          width: 17px;
          height: 17px;
          background: rgba(5, 23, 31, .95);
          border-color: rgba(103,232,249,.24);
        }

        .loginCard {
          max-width: 430px;
          padding: 34px;
          border-color: rgba(103,232,249,.19);
          border-radius: 24px;
          background: linear-gradient(150deg, rgba(8, 29, 39, .96), rgba(2, 13, 19, .98));
          box-shadow:
            0 40px 110px rgba(0,0,0,.46),
            0 0 70px rgba(0,145,190,.075),
            inset 0 1px 0 rgba(255,255,255,.055),
            inset 0 -1px 0 rgba(0,0,0,.35);
        }

        .loginCard::after {
          content: "";
          position: absolute;
          top: 16px;
          right: 17px;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #67e8f9;
          box-shadow: 0 0 0 4px rgba(103,232,249,.07), 0 0 16px rgba(103,232,249,.7);
          animation: statusPulse 2.4s ease-in-out infinite;
          pointer-events: none;
        }

        .cardAccent {
          left: 34px;
          right: 34px;
          height: 2px;
        }

        .cardKicker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 9px;
          border: 1px solid rgba(103,232,249,.12);
          border-radius: 999px;
          background: rgba(103,232,249,.035);
          font-size: 8px;
          letter-spacing: .18em;
        }

        .cardHeader h2 {
          margin-top: 14px;
          font-size: 32px;
          letter-spacing: -.045em;
        }

        .cardHeader p {
          color: #7898a3;
          font-size: 12px;
        }

        form {
          margin-top: 24px;
        }

        .field {
          min-height: 55px;
          margin-top: 13px;
          border-radius: 13px;
          border-color: rgba(103,232,249,.13);
          background: rgba(1, 10, 15, .76);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.018);
        }

        .field:focus-within {
          border-color: rgba(103,232,249,.5);
          box-shadow:
            0 0 0 4px rgba(103,232,249,.045),
            0 12px 30px rgba(0, 0, 0, .16),
            0 0 26px rgba(103,232,249,.055),
            inset 0 1px 0 rgba(255,255,255,.025);
        }

        .fieldIcon {
          width: 50px;
          color: #628c98;
        }

        .field input {
          padding-top: 15px;
          padding-bottom: 15px;
          font-size: 14px;
        }

        .passwordToggle {
          width: 37px;
          height: 37px;
          right: 8px;
          border-radius: 9px;
        }

        .formMeta {
          margin: 16px 3px 20px;
          font-size: 11px;
        }

        .loginButton {
          min-height: 55px;
          padding: 15px 18px;
          border-radius: 13px;
          background: linear-gradient(110deg, #0798bf, #0879a2 58%, #096f96);
          box-shadow:
            0 16px 32px rgba(0,119,160,.2),
            inset 0 1px 0 rgba(255,255,255,.14);
          letter-spacing: .045em;
        }

        .loginButton:hover:not(:disabled) {
          box-shadow:
            0 20px 42px rgba(0,150,200,.28),
            0 0 0 1px rgba(103,232,249,.12),
            inset 0 1px 0 rgba(255,255,255,.16);
        }

        .secureNote {
          margin-top: 20px;
          padding-top: 18px;
          color: #63818b;
        }

        .footer {
          min-height: 58px;
          color: #45636e;
        }

        @keyframes orbitPulse {
          0%, 100% { opacity: .52; transform: scale(1); }
          50% { opacity: .9; transform: scale(1.025); }
        }

        @keyframes statusPulse {
          0%, 100% { opacity: .55; transform: scale(.9); }
          50% { opacity: 1; transform: scale(1.1); }
        }

        /* Premium system environment + micro-interactions */
        .backgroundGlow {
          position: absolute;
          width: 520px;
          height: 520px;
          border-radius: 50%;
          filter: blur(90px);
          pointer-events: none;
          opacity: .28;
          animation: backgroundBreath 8s ease-in-out infinite;
        }
        .backgroundGlowOne { left: 24%; top: 14%; background: rgba(0, 174, 255, .12); }
        .backgroundGlowTwo { right: 8%; bottom: 2%; background: rgba(0, 229, 255, .08); animation-delay: -3s; }
        .grid { animation: gridDrift 18s linear infinite; }
        .scanline { animation: scanlineMove 8s linear infinite; }
        .scanlineSecond { opacity: .035; animation-duration: 13s; animation-direction: reverse; }

        .particles { position: absolute; inset: 0; overflow: hidden; }
        .particle {
          position: absolute;
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: rgba(103, 232, 249, .72);
          box-shadow: 0 0 12px rgba(103, 232, 249, .65);
          opacity: 0;
          animation: particleDrift 7s ease-in-out infinite;
        }
        .particle:nth-child(3n) { width: 2px; height: 2px; animation-duration: 9s; }
        .particle:nth-child(4n) { width: 4px; height: 4px; animation-duration: 11s; }
        .particle1 { left: 8%; top: 72%; animation-delay: -1s; }
        .particle2 { left: 16%; top: 24%; animation-delay: -5s; }
        .particle3 { left: 28%; top: 82%; animation-delay: -2s; }
        .particle4 { left: 38%; top: 15%; animation-delay: -7s; }
        .particle5 { left: 47%; top: 67%; animation-delay: -4s; }
        .particle6 { left: 56%; top: 31%; animation-delay: -6s; }
        .particle7 { left: 64%; top: 77%; animation-delay: -3s; }
        .particle8 { left: 72%; top: 18%; animation-delay: -8s; }
        .particle9 { left: 82%; top: 58%; animation-delay: -2.5s; }
        .particle10 { left: 91%; top: 35%; animation-delay: -6.5s; }
        .particle11 { left: 12%; top: 48%; animation-delay: -4.5s; }
        .particle12 { left: 22%; top: 91%; animation-delay: -1.5s; }
        .particle13 { left: 33%; top: 43%; animation-delay: -7.5s; }
        .particle14 { left: 51%; top: 9%; animation-delay: -3.5s; }
        .particle15 { left: 68%; top: 49%; animation-delay: -9s; }
        .particle16 { left: 77%; top: 88%; animation-delay: -5.5s; }
        .particle17 { left: 87%; top: 76%; animation-delay: -8.5s; }
        .particle18 { left: 96%; top: 13%; animation-delay: -10s; }

        .systemBoot {
          position: fixed;
          z-index: 100;
          inset: 0;
          display: grid;
          place-items: center;
          align-content: center;
          gap: 10px;
          background: rgba(1, 8, 15, .93);
          backdrop-filter: blur(12px);
          transition: opacity .55s ease, visibility .55s ease;
        }
        .systemBoot.visible { opacity: 1; visibility: visible; }
        .systemBoot.hidden { opacity: 0; visibility: hidden; pointer-events: none; }
        .bootLogo {
          width: 72px;
          height: 72px;
          padding: 8px;
          border: 1px solid rgba(103,232,249,.32);
          border-radius: 20px;
          box-shadow: 0 0 55px rgba(0,174,255,.18);
          animation: bootPulse 1.1s ease-in-out infinite;
        }
        .bootLogo img { width: 100%; height: 100%; object-fit: contain; border-radius: 13px; }
        .bootLine {
          width: 160px;
          height: 2px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(103,232,249,.08);
        }
        .bootLine::after {
          content: "";
          display: block;
          width: 48%;
          height: 100%;
          background: #67e8f9;
          box-shadow: 0 0 16px #67e8f9;
          animation: bootProgress 1.15s ease-in-out infinite;
        }
        .bootTitle { color: #eafcff; font-size: 14px; font-weight: 800; letter-spacing: .18em; }
        .bootTitle strong { color: #149eff; }
        .bootStatus { color: #6e9aa6; font-size: 8px; font-weight: 800; letter-spacing: .16em; }
        .bootStatus span { display: inline-block; width: 6px; height: 6px; margin-right: 7px; border-radius: 50%; background: #67e8f9; box-shadow: 0 0 12px #67e8f9; animation: statusPulse 1s ease-in-out infinite; }

        .loginCard {
          --mouse-x: 50%;
          --mouse-y: 50%;
          overflow: hidden;
          animation: cardEntrance .9s cubic-bezier(.2,.8,.2,1) both .18s;
          transform: translateZ(0);
        }
        .cardCursorGlow {
          position: absolute;
          z-index: 0;
          left: var(--mouse-x);
          top: var(--mouse-y);
          width: 260px;
          height: 260px;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle, rgba(103,232,249,.10), transparent 68%);
          pointer-events: none;
          transition: left .16s ease-out, top .16s ease-out;
        }
        .loginCard > *:not(.cardCursorGlow) { position: relative; z-index: 1; }
        .loginCard::before {
          content: "";
          position: absolute;
          z-index: 0;
          top: -2px;
          left: -30%;
          width: 30%;
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(103,232,249,.9), transparent);
          box-shadow: 0 0 18px rgba(103,232,249,.7);
          animation: cardScan 5.5s ease-in-out infinite;
          pointer-events: none;
        }

        @keyframes backgroundBreath { 0%,100% { transform: scale(.92); opacity: .18; } 50% { transform: scale(1.08); opacity: .36; } }
        @keyframes gridDrift { from { background-position: 0 0; } to { background-position: 46px 46px; } }
        @keyframes scanlineMove { from { transform: translateY(-8%); } to { transform: translateY(8%); } }
        @keyframes particleDrift {
          0% { opacity: 0; transform: translate3d(0, 18px, 0) scale(.6); }
          20%,70% { opacity: .45; }
          100% { opacity: 0; transform: translate3d(20px, -70px, 0) scale(1); }
        }
        @keyframes bootPulse { 0%,100% { transform: scale(.96); box-shadow: 0 0 35px rgba(0,174,255,.12); } 50% { transform: scale(1.04); box-shadow: 0 0 65px rgba(0,174,255,.3); } }
        @keyframes bootProgress { 0% { transform: translateX(-110%); } 100% { transform: translateX(320%); } }
        @keyframes cardEntrance { from { opacity: 0; transform: translateY(28px) scale(.975); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes cardScan { 0%,20% { transform: translateX(0); opacity: 0; } 35% { opacity: 1; } 70% { transform: translateX(430%); opacity: 0; } 100% { transform: translateX(430%); opacity: 0; } }

        .isBooting .header, .isBooting .hero, .isBooting .footer { opacity: .25; transform: translateY(4px); }
        .isOnline .header, .isOnline .hero, .isOnline .footer { transition: opacity .55s ease, transform .55s ease; }

        /* Landing-page visual parity */
        .page {
          background:
            radial-gradient(circle at 52% 49%, rgba(0, 140, 255, .08), transparent 28%),
            linear-gradient(120deg, #020b16 0%, #04182a 52%, #061a2e 100%);
        }

        .background {
          background: transparent;
        }

        .shape { position: absolute; border: 1px solid rgba(44, 141, 222, .16); border-radius: 50%; }
        .shapeOne { width: 900px; height: 900px; left: -380px; top: 110px; background: radial-gradient(circle at 60% 45%, rgba(0, 123, 255, .15), transparent 62%); }
        .shapeTwo { width: 700px; height: 700px; right: -470px; top: -210px; border-color: rgba(38, 140, 230, .13); }
        .shapeThree { width: 620px; height: 620px; right: -270px; bottom: -420px; border-color: rgba(38, 140, 230, .12); }
        .arc { position: absolute; width: 920px; height: 420px; border: 1px solid rgba(52, 157, 231, .13); border-radius: 50%; transform: rotate(-28deg); }
        .arcOne { left: -300px; bottom: -170px; }
        .arcTwo { right: -350px; bottom: -180px; transform: rotate(22deg); }
        .ambient { display: none; }
        .grid { opacity: .18; background-image: linear-gradient(rgba(92, 154, 199, .13) 1px, transparent 1px), linear-gradient(90deg, rgba(92, 154, 199, .13) 1px, transparent 1px); background-size: 46px 46px; mask-image: linear-gradient(to bottom, transparent 0%, #000 12%, #000 88%, transparent 100%); -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 12%, #000 88%, transparent 100%); }
        .scanline { position: absolute; inset: 0; opacity: .08; background: repeating-linear-gradient(to bottom, transparent 0, transparent 5px, rgba(255,255,255,.03) 6px); }

        .brand { gap: 12px; }
        .brand > img { width: 58px; height: 58px; object-fit: contain; border-radius: 16px; box-shadow: 0 0 28px rgba(0, 119, 255, .22); }
        .brandText { color: #f1f6fc; font-size: 18px; font-weight: 500; letter-spacing: -.02em; }
        .brandText strong { color: #149eff; }
        .header { width: calc(100% - 64px); max-width: 1295px; height: 82px; min-height: 82px; padding: 0 18px; border: 1px solid rgba(48, 144, 219, .38); border-top: 0; border-radius: 0 0 28px 28px; background: linear-gradient(105deg, rgba(7, 32, 56, .96), rgba(4, 22, 39, .91) 58%, rgba(8, 38, 66, .95)); box-shadow: 0 16px 35px rgba(0,0,0,.22), 0 1px 0 rgba(24, 173, 255, .75); }
        .header::after { content: ""; position: absolute; left: 18%; right: 18%; bottom: -2px; height: 3px; border-radius: 50%; background: linear-gradient(90deg, transparent, rgba(0, 176, 255, .9), transparent); filter: blur(2px); }
        .header {
          isolation: isolate;
          overflow: hidden;
        }
        .header::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 170px;
          height: 100%;
          background: radial-gradient(circle at 20% 45%, rgba(0, 164, 255, .12), transparent 68%);
          pointer-events: none;
          z-index: -1;
        }
        .headerNav {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 5px;
          border: 1px solid rgba(77, 160, 219, .18);
          border-radius: 15px;
          background: rgba(2, 15, 29, .48);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.035), 0 8px 24px rgba(0,0,0,.12);
          backdrop-filter: blur(14px);
        }
        .headerNavLink {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 38px;
          padding: 0 14px;
          border: 1px solid transparent;
          border-radius: 10px;
          color: #7893a4;
          font-size: 11px;
          font-weight: 750;
          letter-spacing: .025em;
          text-decoration: none;
          transition: color .25s ease, border-color .25s ease, background .25s ease, transform .25s ease, box-shadow .25s ease;
        }
        .headerNavLink svg {
          width: 15px;
          height: 15px;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.7;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .headerNavLink i {
          font-style: normal;
          color: #32baff;
          transition: transform .25s ease;
        }
        .headerNavLink:hover {
          color: #e9f8ff;
          border-color: rgba(55, 183, 255, .2);
          background: rgba(42, 157, 224, .08);
          transform: translateY(-1px);
        }
        .headerNavLink:hover i { transform: translateX(3px); }
        .headerNavLink.active {
          color: #eaf8ff;
          border-color: rgba(48, 171, 245, .22);
          background: linear-gradient(135deg, rgba(28, 143, 218, .17), rgba(18, 76, 121, .12));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.045), 0 0 20px rgba(0, 157, 255, .06);
        }
        .headerNavLink.active::after {
          content: "";
          position: absolute;
          left: 22%;
          right: 22%;
          bottom: -6px;
          height: 2px;
          border-radius: 999px;
          background: #20b5ff;
          box-shadow: 0 0 10px rgba(32,181,255,.8);
        }
        .headerSignIn { display: none; }


        @media (prefers-reduced-motion: reduce) {
          .backgroundGlow, .grid, .scanline, .particle, .systemBoot, .robotAvatar, .loginCard, .loginCard::before, .robotReaction:not(:empty), .robotSpark { animation: none !important; transition-duration: .01ms !important; }
          .systemBoot { display: none; }
        }

        @media (max-width: 760px) {
          .hero {
            grid-template-columns: 1fr;
            min-height: auto;
            padding: 36px 0 42px;
            gap: 12px;
          }

          .robotArea {
            min-height: 540px;
          }

          .loginCard {
            width: min(100%, 480px);
            justify-self: center;
          }
        }

        @media (max-width: 820px) {
          .header,
          .hero,
          .footer {
            width: min(100% - 34px, 680px);
          }

          .robotArea {
            width: 100%;
            min-height: 500px;
          }

          .loginCard {
            max-width: 520px;
            margin: 0;
          }
        }

        @media (max-width: 560px) {
          .header {
            min-height: 72px;
          }

          .brandLogo {
            width: 38px;
            height: 38px;
          }

          .brandLogo img {
            width: 30px;
            height: 30px;
          }

          .brandText {
            font-size: 13px;
          }

          .headerNav {
            gap: 3px;
            padding: 4px;
          }

          .headerNavLink {
            min-height: 34px;
            padding: 0 10px;
            font-size: 10px;
          }

          .headerNavLink svg {
            width: 14px;
            height: 14px;
          }

          .hero {
            width: min(100% - 24px, 520px);
            padding-top: 28px;
          }

          .robotReaction {
            top: 4px;
            right: 2px;
            max-width: 250px;
            min-width: 210px;
            padding: 13px 16px;
            font-size: 12px;
          }

          .heroKicker {
            margin-bottom: 16px;
            font-size: 9px;
          }

          .heroCopy h1 {
            font-size: clamp(39px, 11vw, 55px);
          }

          .heroLead {
            font-size: 13px;
          }

          .robotArea {
            min-height: 370px;
          }

          .robotAvatar {
            transform: scale(0.84);
            margin: -44px 0;
          }

          .robotAura {
            width: 390px;
            height: 390px;
          }

          .privacyHands {
            width: 315px;
            height: 315px;
            transform: translate(-50%, -45%) scale(0.65);
          }

          .privacyMode .privacyHands {
            transform: translate(-50%, -45%) scale(0.82);
          }

          .privacyHand {
            top: 120px;
            width: 57px;
            height: 91px;
          }

          .privacyHand::before {
            top: -27px;
            left: 6px;
            width: 45px;
            height: 54px;
          }

          .privacyHand::after {
            top: -16px;
            left: 14px;
            width: 7px;
            height: 41px;
            box-shadow:
              9px 1px 0 rgba(126, 164, 181, 0.2),
              18px 1px 0 rgba(126, 164, 181, 0.18),
              27px 0 0 rgba(126, 164, 181, 0.16);
          }

          .privacyHand.left {
            left: 66px;
          }

          .privacyHand.right {
            right: 66px;
          }

          .privacyHand.right::after {
            left: auto;
            right: 14px;
            box-shadow:
              -9px 1px 0 rgba(126, 164, 181, 0.2),
              -18px 1px 0 rgba(126, 164, 181, 0.18),
              -27px 0 0 rgba(126, 164, 181, 0.16);
          }

          .loginCard {
            padding: 25px 20px 22px;
            border-radius: 16px;
          }

          .cardHeader h2 {
            font-size: 27px;
          }

          .footer {
            width: min(100% - 24px, 520px);
            min-height: 50px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .ambient,
          .robotAvatar,
          .antenna,
          .scanRing,
          .robotSpark,
          .robotInteraction-email .robotSvg,
          .robotInteraction-password .robotSvg,
          .robotInteraction-remember .robotSvg,
          .robotInteraction-forgot .robotSvg,
          .robotInteraction-signin .robotSvg,
          .robotInteraction-remember .antenna,
          .robotInteraction-forgot .leftSensor,
          .robotInteraction-forgot .rightSensor,
          .robotInteraction-signin .leftSensor,
          .robotInteraction-signin .rightSensor,
          .heroCopy,
          .robotArea,
          .loginCard {
            animation: none !important;
          }

          .head {
            transition: none;
          }
        }
      `}</style>
    </main>
  );
}
