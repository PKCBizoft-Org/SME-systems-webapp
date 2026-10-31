"use client";

/* Sign up, in the same dark, clean look as the login page (shares login.module.css).
   The sign-up steps are unchanged: PSGC address dropdowns, password checks with the
   keep-or-strengthen choice, terms consent, then supabase.auth.signUp. */
/* eslint-disable @next/next/no-html-link-for-pages */

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import s from "../login.module.css";
import sx from "./signup.module.css";

type LocationType = "region" | "province" | "city_municipality" | "barangay";
type Location = {
  code: string;
  name: string;
  location_type: LocationType;
  parent_code: string | null;
};

export default function SignupPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [purok, setPurok] = useState("");
  const [regionCode, setRegionCode] = useState("");
  const [provinceCode, setProvinceCode] = useState("");
  const [cityCode, setCityCode] = useState("");
  const [barangayCode, setBarangayCode] = useState("");
  const [regions, setRegions] = useState<Location[]>([]);
  const [provinces, setProvinces] = useState<Location[]>([]);
  const [cities, setCities] = useState<Location[]>([]);
  const [barangays, setBarangays] = useState<Location[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  // Weak-password flow: the warning only appears once the user has left the
  // password field, and it needs an explicit choice (keep it or strengthen it).
  const [pwTouched, setPwTouched] = useState(false);
  const [keepWeak, setKeepWeak] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // The dropdowns are backed by the full Philippine geographic hierarchy stored in
  // public.ph_locations. The hierarchy is: Region -> Province -> City/Municipality -> Barangay.
  // Run the supplied PSGC importer once to populate the table with the complete dataset
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingLocations(true);
      setError("");
      const { data, error } = await supabase
        .from("ph_locations")
        .select("code,name,location_type,parent_code")
        .eq("location_type", "region")
        .eq("is_active", true)
        .order("name");

      if (cancelled) return;
      if (error) {
        setError(`Unable to load Philippine regions: ${error.message}`);
        setRegions([]);
      } else {
        setRegions((data || []) as Location[]);
      }
      setLoadingLocations(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    if (!regionCode) return;
    (async () => {
      const { data, error } = await supabase
        .from("ph_locations")
        .select("code,name,location_type,parent_code")
        .eq("location_type", "province")
        .eq("parent_code", regionCode)
        .eq("is_active", true)
        .order("name");

      if (cancelled) return;
      if (error)
        setError(
          `Unable to load provinces for the selected region: ${error.message}`,
        );
      else setProvinces((data || []) as Location[]);
    })();

    return () => {
      cancelled = true;
    };
  }, [regionCode, supabase]);

  useEffect(() => {
    let cancelled = false;

    if (!provinceCode) return;
    (async () => {
      const { data, error } = await supabase
        .from("ph_locations")
        .select("code,name,location_type,parent_code")
        .eq("location_type", "city_municipality")
        .eq("parent_code", provinceCode)
        .eq("is_active", true)
        .order("name");

      if (cancelled) return;
      if (error)
        setError(
          `Unable to load cities/municipalities for the selected province: ${error.message}`,
        );
      else setCities((data || []) as Location[]);
    })();

    return () => {
      cancelled = true;
    };
  }, [provinceCode, supabase]);

  useEffect(() => {
    let cancelled = false;

    if (!cityCode) return;
    (async () => {
      const { data, error } = await supabase
        .from("ph_locations")
        .select("code,name,location_type,parent_code")
        .eq("location_type", "barangay")
        .eq("parent_code", cityCode)
        .eq("is_active", true)
        .order("name");

      if (cancelled) return;
      if (error)
        setError(
          `Unable to load barangays for the selected city/municipality: ${error.message}`,
        );
      else setBarangays((data || []) as Location[]);
    })();

    return () => {
      cancelled = true;
    };
  }, [cityCode, supabase]);

  const selectedRegion = regions.find((x) => x.code === regionCode),
    selectedProvince = provinces.find((x) => x.code === provinceCode),
    selectedCity = cities.find((x) => x.code === cityCode),
    selectedBarangay = barangays.find((x) => x.code === barangayCode);
  const addressPreview = [
    purok.trim(),
    selectedBarangay?.name,
    selectedCity?.name,
    selectedProvince?.name,
    selectedRegion?.name,
  ]
    .filter(Boolean)
    .join(", ");

  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordChecks = {
    length: password.length >= 8,
    mixed: /[a-z]/.test(password) && /[A-Z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
  const allChecksPass = Object.values(passwordChecks).every(Boolean);
  const passwordWeak = password.length > 0 && !allChecksPass;
  const missingChecks = [
    !passwordChecks.length && "at least 8 characters",
    !passwordChecks.mixed && "upper and lowercase letters",
    !passwordChecks.number && "a number",
    !passwordChecks.special && "a special character",
  ].filter(Boolean) as string[];
  const showWeakWarning = passwordWeak && pwTouched && !keepWeak;

  function suggestStrongPassword() {
    const sets = [
      "abcdefghijkmnopqrstuvwxyz",
      "ABCDEFGHJKLMNPQRSTUVWXYZ",
      "23456789",
      "!@#$%^&*-_+=",
    ];
    const all = sets.join("");
    const rand = (max: number) => crypto.getRandomValues(new Uint32Array(1))[0] % max;
    const pick = (chars: string) => chars[rand(chars.length)];
    // One of each kind guaranteed, the rest random, then shuffled.
    const out = sets.map(pick);
    while (out.length < 14) out.push(pick(all));
    for (let i = out.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    const next = out.join("");
    setPassword(next);
    setConfirmPassword(next);
    setShowPassword(true);
    setShowConfirmPassword(true);
    setKeepWeak(false);
    setPwTouched(true);
    setGenerated(true);
    setCopied(false);
    setError("");
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      // Clipboard can be unavailable (insecure context); the password is visible to copy by hand.
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    const name = fullName.trim(),
      mail = email.trim().toLowerCase(),
      p = purok.trim();
    if (!name) return setError("Please enter your full name.");
    if (!mail) return setError("Please enter your email address.");
    if (password.length < 8)
      return setError("Password must be at least 8 characters.");
    if (password !== confirmPassword)
      return setError("Passwords do not match.");
    if (passwordWeak && !keepWeak) {
      setPwTouched(true);
      return setError(
        "Your password does not meet all the recommended standards. Choose \"Keep my password\" or \"Make it stronger\" under Password.",
      );
    }
    if (!regionCode || !provinceCode || !cityCode || !barangayCode)
      return setError(
        "Please complete your Region, Province, City/Municipality, and Barangay.",
      );
    if (!p) return setError("Please enter your Purok or street.");
    if (!agreed)
      return setError("Please accept the Terms and Conditions and the Privacy Policy to continue.");
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: mail,
        password,
        options: {
          emailRedirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/login`
              : undefined,
          data: {
            full_name: name,
            purok: p,
            barangay_code: barangayCode,
            city_municipality_code: cityCode,
            province_code: provinceCode,
            region_code: regionCode,
            terms_accepted_at: new Date().toISOString(),
            terms_version: "2026-10-15",
          },
        },
      });
      if (error) throw error;
      if (data.session) {
        setSuccess(
          "Account created successfully. Your account is pending organization approval.",
        );
        window.setTimeout(() => router.replace("/login"), 1800);
      } else
        setSuccess(
          "Account created. Please check your email to confirm your account, then sign in.",
        );
    } catch (err) {
      const rawMessage =
        err instanceof Error ? err.message.toLowerCase() : "";
      const friendlyMessage = rawMessage.includes("already registered")
        ? "An account with this email already exists. Try signing in instead."
        : rawMessage.includes("password")
          ? "Please choose a stronger password and try again."
          : rawMessage.includes("email")
            ? "Please enter a valid email address."
            : "We couldn't create your account right now. Please check your details and try again.";
      setError(friendlyMessage);
    } finally {
      setSubmitting(false);
    }
  }


  const matchState = password && confirmPassword ? (password === confirmPassword ? "good" : "bad") : "";
  const check = (ok: boolean, label: string) => (
    <li className={ok ? sx.good : ""}>{ok ? "✓" : "○"} {label}</li>
  );

  return (
    <div className={s.page}>
      <header className={s.header}>
        <nav className={s.nav} aria-label="Primary navigation">
          <a className={s.brand} href="/" aria-label="PKC BIZOFT home">
            <img src="/pkc-logo.webp" alt="" width={32} height={32} />
            <span>PKC BIZOFT</span>
          </a>
          <div className={s.navLinks}>
            <a href="/">Home</a>
            <a href="/login">Sign in</a>
          </div>
        </nav>
      </header>

      <main className={`${s.main} ${sx.main}`}>
        <section className={`${s.card} ${sx.card}`} aria-labelledby="signup-title">
          <div className={sx.top}>
            <div>
              <p className={s.kicker}>PKC BIZOFT</p>
              <h1 id="signup-title" className={`${s.title} ${sx.title}`}>Create your account</h1>
            </div>
            <p className={sx.already}>Already have an account? <a href="/login">Sign in</a></p>
          </div>

          <form className={sx.form} onSubmit={handleSubmit} noValidate>
           <div className={sx.cols}>
            <div className={sx.section}>
              <h2 className={sx.sectionTitle}>Your details</h2>
              <label className={s.label}>
                Full name
                <input className={s.input} value={fullName} placeholder="Juan Dela Cruz" autoComplete="name"
                       onChange={(e) => { setFullName(e.target.value); setError(""); }} />
              </label>
              <label className={s.label}>
                Email
                <input className={s.input} type="email" value={email} placeholder="name@company.com"
                       autoComplete="email" inputMode="email" spellCheck={false}
                       aria-invalid={email.length > 0 && !emailLooksValid}
                       onChange={(e) => { setEmail(e.target.value); setError(""); }} />
              </label>
              {email.length > 0 && !emailLooksValid && (
                <p className={s.hint} role="status">Enter a complete email, like name@gmail.com.</p>
              )}
            </div>

            <div className={sx.section}>
              <h2 className={sx.sectionTitle}>Password</h2>
              <div className={sx.stack}>
                <label className={s.label}>
                  Password
                  <span className={s.inputWrap}>
                    <input className={`${s.input} ${s.withToggle}`} type={showPassword ? "text" : "password"}
                           value={password} placeholder="Create a password" autoComplete="new-password"
                           onBlur={() => setPwTouched(true)}
                           onChange={(e) => {
                             setPassword(e.target.value);
                             setKeepWeak(false);
                             setGenerated(false);
                             setCopied(false);
                             setError("");
                           }} />
                    <EyeButton shown={showPassword} onClick={() => setShowPassword((v) => !v)} what="password" />
                  </span>
                </label>
                <label className={s.label}>
                  Confirm password
                  <span className={s.inputWrap}>
                    <input className={`${s.input} ${s.withToggle}`} type={showConfirmPassword ? "text" : "password"}
                           value={confirmPassword} placeholder="Repeat it" autoComplete="new-password"
                           aria-invalid={matchState === "bad"}
                           onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }} />
                    <EyeButton shown={showConfirmPassword} onClick={() => setShowConfirmPassword((v) => !v)}
                               what="confirmation password" />
                  </span>
                </label>
              </div>
              <ul className={sx.checks} aria-label="Password checklist">
                {check(passwordChecks.length, "8+ characters")}
                {check(passwordChecks.mixed, "Upper and lowercase")}
                {check(passwordChecks.number, "Number")}
                {check(passwordChecks.special, "Special character")}
                <li className={matchState === "good" ? sx.good : matchState === "bad" ? sx.bad : ""}>
                  {matchState === "good" ? "✓" : matchState === "bad" ? "!" : "○"} Passwords match
                </li>
              </ul>

              {showWeakWarning && (
                <div className={sx.warn} role="alert">
                  <p><strong>Your password is weak.</strong> It is missing {missingChecks.join(", ")}. A stronger
                    password better protects your account and billing details.</p>
                  <div className={sx.actions}>
                    <button type="button" className={`${s.btn} ${sx.small}`} onClick={suggestStrongPassword}>
                      Make it stronger
                    </button>
                    <button type="button" className={sx.ghost} onClick={() => setKeepWeak(true)}>
                      Keep my password
                    </button>
                  </div>
                </div>
              )}
              {passwordWeak && keepWeak && (
                <p className={s.note} role="status">
                  Keeping your current password. You can reset it any time with Forgot password in the app.
                </p>
              )}
              {generated && allChecksPass && (
                <div className={`${s.note} ${sx.inline}`} role="status">
                  <span>Strong password filled in. Save it somewhere safe.</span>
                  <button type="button" className={sx.ghost} onClick={copyPassword}>
                    {copied ? "Copied ✓" : "Copy"}
                  </button>
                </div>
              )}
            </div>

            <div className={sx.section}>
              <h2 className={sx.sectionTitle}>Address</h2>
              <label className={s.label}>
                Purok / street
                <input className={s.input} value={purok} placeholder="Purok 5, Rizal Street" autoComplete="street-address"
                       onChange={(e) => { setPurok(e.target.value); setError(""); }} />
              </label>
              <div className={sx.two}>
                <label className={s.label}>
                  Region
                  <select className={`${s.input} ${sx.select}`} value={regionCode} disabled={loadingLocations}
                          onChange={(e) => {
                            setRegionCode(e.target.value);
                            setProvinceCode("");
                            setCityCode("");
                            setBarangayCode("");
                            setProvinces([]);
                            setCities([]);
                            setBarangays([]);
                            setError("");
                          }}>
                    <option value="">{loadingLocations ? "Loading…" : regions.length ? "Select region" : "No regions loaded"}</option>
                    {regions.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
                  </select>
                </label>
                <label className={s.label}>
                  Province
                  <select className={`${s.input} ${sx.select}`} value={provinceCode} disabled={!regionCode}
                          onChange={(e) => {
                            setProvinceCode(e.target.value);
                            setCityCode("");
                            setBarangayCode("");
                            setCities([]);
                            setBarangays([]);
                            setError("");
                          }}>
                    <option value="">{regionCode ? (provinces.length ? "Select province" : "No provinces found") : "Pick a region first"}</option>
                    {provinces.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
                  </select>
                </label>
                <label className={s.label}>
                  City / municipality
                  <select className={`${s.input} ${sx.select}`} value={cityCode} disabled={!provinceCode}
                          onChange={(e) => {
                            setCityCode(e.target.value);
                            setBarangayCode("");
                            setBarangays([]);
                            setError("");
                          }}>
                    <option value="">{provinceCode ? (cities.length ? "Select city" : "None found") : "Pick a province first"}</option>
                    {cities.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
                  </select>
                </label>
                <label className={s.label}>
                  Barangay
                  <select className={`${s.input} ${sx.select}`} value={barangayCode} disabled={!cityCode}
                          onChange={(e) => { setBarangayCode(e.target.value); setError(""); }}>
                    <option value="">{cityCode ? (barangays.length ? "Select barangay" : "None found") : "Pick a city first"}</option>
                    {barangays.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
                  </select>
                </label>
              </div>
              {addressPreview && (
                <p className={sx.preview}>Address: <b>{addressPreview}</b></p>
              )}
            </div>
           </div>

            {error && <p className={s.message} role="alert">{error}</p>}
            {success && <p className={`${s.message} ${s.ok}`} role="status">{success}</p>}

            <div className={sx.bottom}>

            <label className={sx.agree}>
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>
                I am at least 18 and I agree to the{" "}
                <a href="/terms" target="_blank" rel="noreferrer">Terms and Conditions</a> and the{" "}
                <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>, including how my details,
                location and photos are used to provide the service.
              </span>
            </label>

              <div className={sx.submit}>
                <button className={s.btn} type="submit" disabled={submitting || loadingLocations} aria-busy={submitting}>
                  {submitting ? "Creating account…" : "Create account"}
                </button>
                <p className={sx.fine}>
                  You get access to a business&apos;s data once that business adds you.
                </p>
              </div>
            </div>
          </form>
        </section>
      </main>

      <footer className={s.footer}>
        <span>© 2026 PKC BIZOFT</span>
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
        <a href="/cookies">Cookies</a>
      </footer>
    </div>
  );
}

function EyeButton({ shown, onClick, what }: { shown: boolean; onClick: () => void; what: string }) {
  return (
    <button type="button" className={s.toggle} onClick={onClick} aria-pressed={shown}
            aria-label={shown ? `Hide ${what}` : `Show ${what}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {shown ? (
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
  );
}
