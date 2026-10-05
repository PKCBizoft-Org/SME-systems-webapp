"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

type LocationType = "region" | "province" | "city_municipality" | "barangay";
type Location = {
  code: string;
  name: string;
  location_type: LocationType;
  parent_code: string | null;
};

const PKC_LOGO = "data:image/png;base64,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";

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
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // The dropdowns are backed by the full Philippine geographic hierarchy stored in
  // public.ph_locations. The hierarchy is: Region -> Province -> City/Municipality -> Barangay.
  // Run the supplied PSGC importer once to populate the table with the complete dataset
  // (mana nanig import HAHHAHAHA).
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
  // A weak password the user has chosen to keep still completes the step, as
  // long as it meets the hard minimum (8+ characters) and the fields match.
  const securityStrong = allChecksPass && password.length > 0 && password === confirmPassword;
  // The user chose to keep a password that misses some recommendations: the
  // step is done, but shown in yellow as "semi-secured" instead of green.
  const securitySemi = !securityStrong && keepWeak && passwordWeak && passwordChecks.length;
  const securityDone = securityStrong || securitySemi;

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
  const accountComplete = fullName.trim().length > 1 && emailLooksValid;
  const locationComplete = Boolean(purok.trim() && regionCode && provinceCode && cityCode && barangayCode);
  const completedSteps = [accountComplete, securityDone, locationComplete].filter(Boolean).length;
  const progress = Math.round((completedSteps / 3) * 100);

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
        "Your password does not meet all the recommended standards. Choose \"Keep my password\" or \"Make it stronger\" in Registration status.",
      );
    }
    if (!regionCode || !provinceCode || !cityCode || !barangayCode)
      return setError(
        "Please complete your Region, Province, City/Municipality, and Barangay.",
      );
    if (!p) return setError("Please enter your Purok or street.");
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

  return (
    <main className="signupPage">
      <div className="ambient ambientOne" />
      <div className="ambient ambientTwo" />
      <div className="pageGrid" />

      <nav className="topbar">
        <Link href="/login" className="brand" aria-label="PKC BIZOFT">
          <span className="brandIcon">
            <img src={PKC_LOGO} alt="" />
          </span>
          <span className="brandText">
            <strong>PKC <em>BIZOFT</em></strong>
            <small>BUSINESS OPERATIONS PLATFORM</small>
          </span>
        </Link>

        <div className="topbarRight">
          <span className="securePill"><i /> SECURE REGISTRATION</span>
          <span className="already">Already have an account?</span>
          <Link href="/login" className="signIn">Sign in <b>→</b></Link>
        </div>
      </nav>

      <section className="registrationLayout">
        <aside className="overview">
          <div className="eyebrow"><i /> ACCOUNT PROVISIONING</div>

          <h1>
            Build your
            <br />
            <span>BIZOFT</span> account.
          </h1>

          <p className="overviewCopy">
            Create your secure business profile and register the service
            location that will be associated with your account.
          </p>

          <div className="progressPanel">
            <div className="progressHeader">
              <div>
                <span>REGISTRATION STATUS</span>
                <strong>{progress}% COMPLETE</strong>
              </div>
              <b>{completedSteps}/3</b>
            </div>

            <div className="progressTrack">
              <i style={{ width: `${progress}%` }} />
            </div>

            <div className="steps">
              <div className={accountComplete ? "step complete" : "step"}>
                <span>{accountComplete ? "✓" : "01"}</span>
                <div>
                  <b>Account identity</b>
                  <small>Name and email</small>
                </div>
              </div>

              <div
                className={securityStrong ? "step complete" : securitySemi ? "step semi" : "step"}
              >
                <span>{securityStrong ? "✓" : securitySemi ? "!" : "02"}</span>
                <div>
                  <b>Account security</b>
                  <small>
                    {securitySemi
                      ? password === confirmPassword
                        ? "Semi-secured password"
                        : "Semi-secured · repeat it to confirm"
                      : "Password protection"}
                  </small>
                </div>
              </div>

              <div className={locationComplete ? "step complete" : "step"}>
                <span>{locationComplete ? "✓" : "03"}</span>
                <div>
                  <b>Service location</b>
                  <small>Philippine PSGC hierarchy</small>
                </div>
              </div>
            </div>

            {showWeakWarning && (
              <div className="pwWarning" role="alert">
                <div className="pwWarningHead">
                  <b aria-hidden="true">!</b>
                  <strong>Your password is weak</strong>
                </div>
                <p>
                  It is missing {missingChecks.join(", ")}. A stronger password better protects your
                  account and billing details.
                </p>
                <div className="pwWarningActions">
                  <button type="button" className="pwStrong" onClick={suggestStrongPassword}>
                    Make it stronger
                  </button>
                  <button type="button" className="pwKeep" onClick={() => setKeepWeak(true)}>
                    Keep my password
                  </button>
                </div>
              </div>
            )}

            {passwordWeak && keepWeak && (
              <div className="pwNote" role="status">
                Keeping your current password. You can reset it any time with &quot;Forgot password&quot;.
              </div>
            )}

            {generated && allChecksPass && (
              <div className="pwNote pwNoteGood" role="status">
                <span>Strong password filled in. Save it somewhere safe.</span>
                <button type="button" onClick={copyPassword}>
                  {copied ? "Copied ✓" : "Copy"}
                </button>
              </div>
            )}
          </div>

          <div className="overviewStats">
            <div>
              <b>01</b>
              <span>Secure<br />authentication</span>
            </div>
            <div>
              <b>02</b>
              <span>Verified<br />location data</span>
            </div>
            <div>
              <b>03</b>
              <span>Workspace<br />ready</span>
            </div>
          </div>
        </aside>

        <section className="registrationCard">
          <header className="cardHeader">
            <div>
              <span className="cardKicker">NEW BUSINESS PROFILE</span>
              <h2>Create your account</h2>
              <p>Enter your details below to provision your PKC BIZOFT account.</p>
            </div>
            <div className="online">
              <i />
              ONLINE
            </div>
          </header>

          <form onSubmit={handleSubmit} noValidate>
            <div className="formColumns">
              <section className="column">
                <div className="sectionTitle">
                  <span>01</span>
                  <div>
                    <h3>Account identity</h3>
                    <p>How BIZOFT will identify you.</p>
                  </div>
                </div>

                <label className="field">
                  <span>Full name <b>*</b></span>
                  <input
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      setError("");
                    }}
                    className="fieldInput"
                    placeholder="Juan Dela Cruz"
                    autoComplete="name"
                  />
                </label>

                <label className="field">
                  <span>Email address <b>*</b></span>
                  <div className="statusInput">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setError("");
                      }}
                      className="fieldInput"
                      placeholder="you@example.com"
                      autoComplete="email"
                      inputMode="email"
                    />
                    {email && (
                      <i className={emailLooksValid ? "valid" : "invalid"}>
                        {emailLooksValid ? "✓" : "!"}
                      </i>
                    )}
                  </div>
                  <small className={!email || emailLooksValid ? "hint" : "hint danger"}>
                    {!email || emailLooksValid
                      ? "Used for account confirmation and sign in."
                      : "Enter a valid email address."}
                  </small>
                </label>

                <div className="securityTitle">
                  <div className="sectionTitle">
                    <span>02</span>
                    <div>
                      <h3>Account security</h3>
                      <p>Protect access with a strong password.</p>
                    </div>
                  </div>
                  {securityStrong && <b className="ready">✓ READY</b>}
                  {securitySemi && <b className="ready semiReady">! SEMI-SECURED</b>}
                </div>

                <div className="twoFields">
                  <label className="field">
                    <span>Password <b>*</b></span>
                    <div className="passwordInput">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setKeepWeak(false);
                          setGenerated(false);
                          setCopied(false);
                          setError("");
                        }}
                        onBlur={() => setPwTouched(true)}
                        className="fieldInput"
                        placeholder="Create a password"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? "HIDE" : "SHOW"}
                      </button>
                    </div>
                  </label>

                  <label className="field">
                    <span>Confirm password <b>*</b></span>
                    <div className="passwordInput">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          setError("");
                        }}
                        className="fieldInput"
                        placeholder="Repeat password"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        aria-label={
                          showConfirmPassword
                            ? "Hide confirmation password"
                            : "Show confirmation password"
                        }
                      >
                        {showConfirmPassword ? "HIDE" : "SHOW"}
                      </button>
                    </div>
                  </label>
                </div>

                <div className="requirements">
                  <span className={passwordChecks.length ? "good" : ""}>
                    {passwordChecks.length ? "✓" : "○"} 8+ characters
                  </span>
                  <span className={passwordChecks.mixed ? "good" : ""}>
                    {passwordChecks.mixed ? "✓" : "○"} Upper + lowercase
                  </span>
                  <span className={passwordChecks.number ? "good" : ""}>
                    {passwordChecks.number ? "✓" : "○"} Number
                  </span>
                  <span className={passwordChecks.special ? "good" : ""}>
                    {passwordChecks.special ? "✓" : "○"} Special character
                  </span>
                  <span
                    className={
                      password && confirmPassword
                        ? password === confirmPassword
                          ? "good"
                          : "bad"
                        : ""
                    }
                  >
                    {password && confirmPassword
                      ? password === confirmPassword
                        ? "✓"
                        : "!"
                      : "○"}{" "}
                    Passwords match
                  </span>
                </div>
              </section>

              <section className="column locationColumn">
                <div className="sectionTitle">
                  <span>03</span>
                  <div>
                    <h3>Service location</h3>
                    <p>Establish the geographic service area.</p>
                  </div>
                  {locationComplete && <b className="ready">✓ VERIFIED</b>}
                </div>

                <label className="field">
                  <span>Purok / Street <b>*</b></span>
                  <input
                    value={purok}
                    onChange={(e) => {
                      setPurok(e.target.value);
                      setError("");
                    }}
                    className="fieldInput"
                    placeholder="Purok 5, Rizal Street, etc."
                    autoComplete="street-address"
                  />
                </label>

                <div className="locationGrid">
                  <label className="field">
                    <span>Region <b>*</b></span>
                    <div className="selectWrap">
                      <select
                        value={regionCode}
                        onChange={(e) => {
                          setRegionCode(e.target.value);
                          setProvinceCode("");
                          setCityCode("");
                          setBarangayCode("");
                          setProvinces([]);
                          setCities([]);
                          setBarangays([]);
                          setError("");
                        }}
                        className="fieldInput selectInput"
                        disabled={loadingLocations}
                      >
                        <option value="">
                          {loadingLocations
                            ? "Loading regions..."
                            : regions.length
                              ? "Select region"
                              : "No regions loaded"}
                        </option>
                        {regions.map((x) => (
                          <option key={x.code} value={x.code}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>

                  <label className="field">
                    <span>Province <b>*</b></span>
                    <div className="selectWrap">
                      <select
                        value={provinceCode}
                        onChange={(e) => {
                          setProvinceCode(e.target.value);
                          setCityCode("");
                          setBarangayCode("");
                          setCities([]);
                          setBarangays([]);
                          setError("");
                        }}
                        className="fieldInput selectInput"
                        disabled={!regionCode}
                      >
                        <option value="">
                          {regionCode
                            ? provinces.length
                              ? "Select province"
                              : "No provinces found"
                            : "Select a region first"}
                        </option>
                        {provinces.map((x) => (
                          <option key={x.code} value={x.code}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>

                  <label className="field">
                    <span>City / Municipality <b>*</b></span>
                    <div className="selectWrap">
                      <select
                        value={cityCode}
                        onChange={(e) => {
                          setCityCode(e.target.value);
                          setBarangayCode("");
                          setBarangays([]);
                          setError("");
                        }}
                        className="fieldInput selectInput"
                        disabled={!provinceCode}
                      >
                        <option value="">
                          {provinceCode
                            ? cities.length
                              ? "Select city/municipality"
                              : "No cities/municipalities found"
                            : "Select a province first"}
                        </option>
                        {cities.map((x) => (
                          <option key={x.code} value={x.code}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>

                  <label className="field">
                    <span>Barangay <b>*</b></span>
                    <div className="selectWrap">
                      <select
                        value={barangayCode}
                        onChange={(e) => {
                          setBarangayCode(e.target.value);
                          setError("");
                        }}
                        className="fieldInput selectInput"
                        disabled={!cityCode}
                      >
                        <option value="">
                          {cityCode
                            ? barangays.length
                              ? "Select barangay"
                              : "No barangays found"
                            : "Select a city/municipality first"}
                        </option>
                        {barangays.map((x) => (
                          <option key={x.code} value={x.code}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>
                </div>

                <div className={addressPreview ? "addressPreview active" : "addressPreview"}>
                  <div className="addressTop">
                    <span>ADDRESS PREVIEW</span>
                    <b>{locationComplete ? "VERIFIED" : "PENDING"}</b>
                  </div>
                  <div className="addressBody">
                    <strong>⌖</strong>
                    <p>
                      {addressPreview ||
                        "Complete your location selections to preview the service address."}
                    </p>
                  </div>
                  <small>Region → Province → City/Municipality → Barangay</small>
                </div>

                <div className="locationInfo">
                  <span>i</span>
                  <p>
                    Location data is loaded from the Philippine PSGC hierarchy
                    in <b>public.ph_locations</b>.
                  </p>
                </div>
              </section>
            </div>

            {error && (
              <div className="message error" role="alert">
                <span>!</span>
                <p>{error}</p>
              </div>
            )}

            {success && (
              <div className="message success" role="status">
                <span>✓</span>
                <p>{success}</p>
              </div>
            )}

            <div className="submitBar">
              <div className="submitTrust">
                <span>🔒</span>
                <div>
                  <b>Secure account creation</b>
                  <small>Authentication is handled through Supabase.</small>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || loadingLocations}
                className="submitButton"
              >
                {submitting ? "Creating account..." : "Create BIZOFT account"}
                {submitting ? (
                  <i className="spinner" />
                ) : (
                  <b>→</b>
                )}
              </button>
            </div>

            <p className="tenantNote">
              Creating an account does not automatically grant organization or
              tenant access. Tenant membership is assigned separately.
            </p>
          </form>
        </section>
      </section>

      <footer className="footer">
        <span>PKC BIZOFT • BUSINESS OPERATIONS PLATFORM</span>
        <span>ACCOUNT REGISTRATION • v1.0</span>
      </footer>

      <style jsx>{`
        :global(*) { box-sizing: border-box; }
        :global(html), :global(body) { min-height: 100%; }
        :global(body) { margin: 0; background: #03070c; }
        :global(button), :global(input), :global(select) { font: inherit; }

        .signupPage {
          min-height: 100vh;
          position: relative;
          overflow-x: hidden;
          background:
            radial-gradient(circle at 75% 20%, rgba(23, 206, 255, .07), transparent 29%),
            radial-gradient(circle at 12% 82%, rgba(45, 104, 255, .06), transparent 27%),
            #03070c;
          color: #fff;
          padding-bottom: 18px;
        }

        .pageGrid {
          position: fixed;
          inset: 0;
          pointer-events: none;
          opacity: .16;
          background-image:
            linear-gradient(rgba(75, 215, 255, .035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(75, 215, 255, .035) 1px, transparent 1px);
          background-size: 44px 44px;
          mask-image: linear-gradient(to bottom, black, transparent 88%);
        }

        .ambient {
          position: fixed;
          width: 420px;
          height: 420px;
          border-radius: 50%;
          filter: blur(125px);
          opacity: .08;
          pointer-events: none;
        }
        .ambientOne { top: -180px; right: -80px; background: #19d9ff; }
        .ambientTwo { bottom: -240px; left: -130px; background: #2d68ff; }

        .topbar {
          position: relative;
          z-index: 5;
          width: min(1480px, calc(100% - 48px));
          height: 68px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          border-bottom: 1px solid rgba(120, 230, 255, .09);
        }

        /* next/link renders without styled-jsx's scope class, so selectors that
           target a <Link> itself must be :global(). Descendants stay scoped. */
        :global(.brand) {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #fff;
          text-decoration: none;
        }

        .brandIcon {
          width: 35px;
          height: 35px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(83, 229, 255, .18);
          border-radius: 10px;
          background: rgba(255,255,255,.035);
        }
        .brandIcon img { width: 24px; height: 24px; object-fit: contain; }

        .brandText strong {
          display: block;
          font-size: 15px;
          letter-spacing: .08em;
        }
        .brandText em { color: #58e7ff; font-style: normal; }
        .brandText small {
          display: block;
          margin-top: 3px;
          color: rgba(215, 246, 253, 0.52);
          font-size: 9px;
          letter-spacing: .18em;
        }

        .topbarRight {
          display: flex;
          align-items: center;
          gap: 14px;
          color: rgba(220, 248, 255, 0.52);
          font-size: 10px;
        }
        .securePill {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 9px;
          border: 1px solid rgba(83,234,199,.14);
          border-radius: 999px;
          color: rgba(142,244,211,.62);
          font-size: 9px;
          letter-spacing: .13em;
        }
        .securePill i,
        .online i {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #57e7bd;
          box-shadow: 0 0 9px #57e7bd;
        }
        :global(.signIn) {
          color: #6eeaff;
          text-decoration: none;
          font-weight: 700;
        }
        :global(.signIn) b {
          display: inline-block;
          margin-left: 3px;
          transition: transform .2s;
        }
        :global(.signIn):hover b { transform: translateX(3px); }

        .registrationLayout {
          position: relative;
          z-index: 2;
          width: min(1480px, calc(100% - 48px));
          min-height: calc(100vh - 99px);
          margin: 0 auto;
          display: grid;
          grid-template-columns: minmax(280px, .68fr) minmax(720px, 1.85fr);
          align-items: center;
          gap: 30px;
          padding: 28px 0 18px;
        }

        .overview { padding: 4px 8px 4px 2px; }

        .eyebrow {
          display: flex;
          align-items: center;
          gap: 8px;
          color: rgba(93,229,255,.62);
          font-size: 9px;
          font-weight: 700;
          letter-spacing: .2em;
        }
        .eyebrow i {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #55e7ff;
          box-shadow: 0 0 12px #55e7ff;
        }

        .overview h1 {
          margin: 17px 0 0;
          font-size: clamp(39px, 4vw, 60px);
          line-height: .98;
          letter-spacing: -.05em;
          font-weight: 750;
        }
        .overview h1 span {
          color: #55e7ff;
          text-shadow: 0 0 32px rgba(70,225,255,.18);
        }
        .overviewCopy {
          max-width: 420px;
          margin: 17px 0 22px;
          color: rgba(218, 244, 250, 0.5);
          font-size: 12px;
          line-height: 1.7;
        }

        .progressPanel {
          max-width: 430px;
          padding: 16px;
          border: 1px solid rgba(114,229,255,.1);
          border-radius: 17px;
          background: linear-gradient(145deg, rgba(10,27,35,.68), rgba(4,12,18,.72));
          box-shadow: 0 22px 65px rgba(0,0,0,.2);
          backdrop-filter: blur(12px);
        }
        .progressHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .progressHeader span {
          display: block;
          color: rgba(205, 242, 250, 0.53);
          font-size: 9px;
          letter-spacing: .16em;
        }
        .progressHeader strong {
          display: block;
          margin-top: 4px;
          color: rgba(226,253,255,.72);
          font-size: 9px;
          letter-spacing: .1em;
        }
        .progressHeader > b { color: #55e7ff; font-size: 12px; }
        .progressTrack {
          height: 3px;
          margin: 13px 0 14px;
          overflow: hidden;
          border-radius: 99px;
          background: rgba(89,225,255,.07);
        }
        .progressTrack i {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #3cdfff, #77f3c6);
          box-shadow: 0 0 12px rgba(55,222,255,.65);
          transition: width .35s ease;
        }
        .steps { display: grid; gap: 9px; }
        .step {
          display: flex;
          align-items: center;
          gap: 9px;
          opacity: .43;
          transition: opacity .2s;
        }
        .step.complete { opacity: 1; }
        .step > span {
          width: 26px;
          height: 26px;
          flex: 0 0 26px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(109,229,255,.13);
          border-radius: 8px;
          color: rgba(215, 248, 255, 0.52);
          font-size: 9px;
        }
        .step.complete > span {
          color: #7af3d0;
          border-color: rgba(92,239,198,.28);
          background: rgba(80,239,199,.06);
        }
        .step b, .step small { display: block; }
        .step b { color: rgba(236,252,255,.68); font-size: 9px; }
        .step small {
          margin-top: 2px;
          color: rgba(209, 241, 249, 0.53);
          font-size: 9px;
        }

        .overviewStats {
          display: flex;
          gap: 22px;
          margin-top: 19px;
        }
        .overviewStats div {
          display: flex;
          gap: 6px;
          align-items: flex-start;
        }
        .overviewStats b {
          color: rgba(80, 226, 255, 0.61);
          font-size: 9px;
        }
        .overviewStats span {
          color: rgba(214, 244, 250, 0.52);
          font-size: 9px;
          line-height: 1.35;
        }

        .registrationCard {
          min-width: 0;
          overflow: hidden;
          border: 1px solid rgba(117,229,255,.13);
          border-radius: 23px;
          background: linear-gradient(145deg, rgba(8,24,32,.93), rgba(3,10,16,.97));
          box-shadow: 0 28px 90px rgba(0,0,0,.42), 0 0 55px rgba(40,205,255,.04);
          backdrop-filter: blur(18px);
        }

        .cardHeader {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          padding: 20px 23px;
          border-bottom: 1px solid rgba(120,229,255,.07);
          background: linear-gradient(180deg, rgba(255,255,255,.025), transparent);
        }
        .cardKicker {
          color: rgba(91,229,255,.62);
          font-size: 9px;
          letter-spacing: .2em;
          font-weight: 700;
        }
        .cardHeader h2 {
          margin: 5px 0 0;
          font-size: 22px;
          letter-spacing: -.02em;
        }
        .cardHeader p {
          margin: 5px 0 0;
          color: rgba(216, 244, 250, 0.52);
          font-size: 9px;
        }
        .online {
          display: flex;
          align-items: center;
          gap: 6px;
          color: rgba(120,240,207,.58);
          font-size: 9px;
          letter-spacing: .16em;
        }

        form { padding: 20px 23px 17px; }

        .formColumns {
          display: grid;
          grid-template-columns: 1fr 1.04fr;
          gap: 24px;
        }
        .column { min-width: 0; }
        .locationColumn {
          padding-left: 24px;
          border-left: 1px solid rgba(118,229,255,.075);
        }

        .sectionTitle {
          position: relative;
          display: flex;
          align-items: flex-start;
          gap: 9px;
          margin-bottom: 15px;
        }
        .sectionTitle > span {
          width: 27px;
          height: 27px;
          flex: 0 0 27px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(83,228,255,.15);
          border-radius: 8px;
          color: #59e7ff;
          font-size: 9px;
          background: rgba(76,226,255,.035);
        }
        .sectionTitle h3 {
          margin: 1px 0 2px;
          color: rgba(238,253,255,.8);
          font-size: 10px;
          letter-spacing: .03em;
        }
        .sectionTitle p {
          margin: 0;
          color: rgba(207, 240, 248, 0.54);
          font-size: 9px;
        }
        .sectionTitle .ready {
          margin-left: auto;
        }

        .field { display: block; min-width: 0; margin-bottom: 10px; }
        .field > span {
          display: block;
          margin-bottom: 5px;
          color: rgba(229,249,253,.6);
          font-size: 9px;
          font-weight: 600;
        }
        .field > span b { color: #59e7ff; }

        .fieldInput {
          width: 100%;
          height: 38px;
          border: 1px solid rgba(136,229,250,.1);
          border-radius: 10px;
          outline: none;
          color: #fff;
          background: rgba(255,255,255,.035);
          padding: 0 11px;
          font-size: 10px;
          transition: border-color .2s, background .2s, box-shadow .2s;
        }
        .fieldInput::placeholder { color: rgba(224, 247, 252, 0.49); }
        .fieldInput:focus {
          border-color: rgba(82,224,255,.43);
          background: rgba(255,255,255,.05);
          box-shadow: 0 0 0 3px rgba(60,218,255,.04);
        }
        .fieldInput:disabled { cursor: not-allowed; opacity: .38; }

        .statusInput, .passwordInput, .selectWrap { position: relative; }
        .statusInput .fieldInput { padding-right: 34px; }
        .statusInput > i {
          position: absolute;
          top: 50%;
          right: 11px;
          transform: translateY(-50%);
          font-style: normal;
          font-size: 10px;
        }
        .statusInput .valid { color: #65edc5; }
        .statusInput .invalid { color: #ff8585; }

        .hint {
          display: block;
          margin-top: 4px;
          color: rgba(206, 239, 247, 0.54);
          font-size: 9px;
        }
        .hint.danger { color: rgba(255,135,135,.7); }

        .securityTitle {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin: 17px 0 11px;
        }
        .securityTitle .sectionTitle { margin: 0; }
        .ready {
          white-space: nowrap;
          padding: 5px 7px;
          border: 1px solid rgba(86,239,198,.18);
          border-radius: 999px;
          background: rgba(76,238,193,.045);
          color: #6ef0ca;
          font-size: 9px;
          letter-spacing: .12em;
        }

        .twoFields {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 9px;
        }
        .passwordInput .fieldInput { padding-right: 51px; }
        .passwordInput button {
          position: absolute;
          top: 50%;
          right: 7px;
          transform: translateY(-50%);
          border: 0;
          background: none;
          color: rgba(218, 248, 255, 0.52);
          cursor: pointer;
          font-size: 9px;
          letter-spacing: .08em;
        }
        .passwordInput button:hover { color: #6ceaff; }

        .requirements {
          display: flex;
          flex-wrap: wrap;
          gap: 4px 10px;
          margin-top: 1px;
        }
        .requirements span {
          color: rgba(202, 234, 242, 0.54);
          font-size: 9px;
        }
        .requirements .good { color: rgba(110,239,202,.72); }
        .requirements .bad { color: rgba(255,135,135,.72); }

        .locationGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0 9px;
        }
        .selectInput {
          appearance: none;
          -webkit-appearance: none;
          padding-right: 29px;
          background: #0a151d;
        }
        .selectWrap::after {
          content: "⌄";
          position: absolute;
          top: 50%;
          right: 11px;
          transform: translateY(-55%);
          color: rgba(104, 226, 255, 0.6);
          pointer-events: none;
          font-size: 10px;
        }

        .addressPreview {
          min-height: 82px;
          margin-top: 2px;
          padding: 10px 12px;
          border: 1px solid rgba(119,227,250,.08);
          border-radius: 12px;
          background: rgba(255,255,255,.02);
        }
        .addressPreview.active {
          border-color: rgba(78,230,255,.17);
          background: rgba(54,216,255,.03);
        }
        .addressTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .addressTop span {
          color: rgba(209, 244, 251, 0.53);
          font-size: 9px;
          letter-spacing: .15em;
        }
        .addressTop b {
          color: rgba(103,239,202,.62);
          font-size: 9px;
          letter-spacing: .11em;
        }
        .addressBody {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-top: 7px;
        }
        .addressBody strong {
          color: #59e7ff;
          font-size: 17px;
          text-shadow: 0 0 14px rgba(78,225,255,.35);
        }
        .addressBody p {
          margin: 0;
          color: rgba(232,251,255,.66);
          font-size: 9px;
          line-height: 1.4;
        }
        .addressPreview > small {
          display: block;
          margin-top: 4px;
          color: rgba(202, 236, 245, 0.54);
          font-size: 9px;
        }

        .locationInfo {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          margin-top: 8px;
        }
        .locationInfo > span {
          width: 14px;
          height: 14px;
          flex: 0 0 14px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(85,224,255,.14);
          border-radius: 50%;
          color: rgba(90, 227, 255, 0.6);
          font-size: 9px;
        }
        .locationInfo p {
          margin: 0;
          color: rgba(204, 237, 245, 0.55);
          font-size: 9px;
          line-height: 1.45;
        }
        .locationInfo b {
          color: rgba(213, 246, 253, 0.48);
          font-weight: 500;
        }

        .message {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          margin-top: 12px;
          padding: 9px 11px;
          border-radius: 10px;
          font-size: 9px;
          line-height: 1.5;
        }
        .message > span {
          width: 16px;
          height: 16px;
          flex: 0 0 16px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          font-weight: 800;
        }
        .message p { margin: 1px 0 0; }
        .message.error {
          border: 1px solid rgba(255,102,102,.16);
          background: rgba(255,70,70,.05);
          color: rgba(255,193,193,.78);
        }
        .message.error > span { color: #ff8585; background: rgba(255,82,82,.12); }
        .message.success {
          border: 1px solid rgba(81,235,186,.16);
          background: rgba(62,230,176,.045);
          color: rgba(181,255,229,.75);
        }
        .message.success > span { color: #69edc5; background: rgba(69,233,182,.1); }

        .submitBar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          margin-top: 15px;
          padding-top: 14px;
          border-top: 1px solid rgba(118,229,255,.07);
        }
        .submitTrust {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .submitTrust > span { font-size: 13px; opacity: .62; }
        .submitTrust b,
        .submitTrust small { display: block; }
        .submitTrust b { color: rgba(225,249,254,.58); font-size: 9px; }
        .submitTrust small {
          margin-top: 2px;
          color: rgba(202, 235, 244, 0.54);
          font-size: 9px;
        }

        .submitButton {
          min-width: 205px;
          height: 41px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          border: 1px solid rgba(112,237,255,.15);
          border-radius: 10px;
          color: #031016;
          background: linear-gradient(135deg, #e9fcff, #a6efff);
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .05em;
          cursor: pointer;
          box-shadow: 0 10px 35px rgba(41,211,255,.11);
          transition: transform .2s, box-shadow .2s, filter .2s;
        }
        .submitButton:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 14px 40px rgba(41,211,255,.19);
          filter: brightness(1.03);
        }
        .submitButton:disabled {
          cursor: not-allowed;
          opacity: .5;
        }
        .submitButton > b { font-size: 14px; }

        .spinner {
          width: 12px;
          height: 12px;
          border: 2px solid rgba(3,16,22,.25);
          border-top-color: #031016;
          border-radius: 50%;
          animation: spin .7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .tenantNote {
          margin: 10px 0 0;
          color: rgba(199, 233, 242, 0.56);
          text-align: right;
          font-size: 9px;
          line-height: 1.4;
        }

        .footer {
          position: relative;
          z-index: 2;
          width: min(1480px, calc(100% - 48px));
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          color: rgba(194, 229, 238, 0.56);
          font-size: 9px;
          letter-spacing: .13em;
        }

        @media (max-width: 1180px) {
          .registrationLayout {
            grid-template-columns: 1fr;
            max-width: 900px;
          }
          .overview { display: none; }
          .registrationCard { width: 100%; }
        }

        @media (max-width: 760px) {
          .topbar,
          .registrationLayout,
          .footer {
            width: min(100% - 28px, 620px);
          }
          .topbar { height: 62px; }
          .already,
          .securePill { display: none; }
          .registrationLayout {
            min-height: auto;
            padding: 18px 0;
          }
          .cardHeader { padding: 17px; }
          form { padding: 17px; }
          .formColumns { grid-template-columns: 1fr; gap: 19px; }
          .locationColumn {
            padding-left: 0;
            padding-top: 19px;
            border-left: 0;
            border-top: 1px solid rgba(118,229,255,.075);
          }
          .twoFields,
          .locationGrid { grid-template-columns: 1fr; }
          .submitBar {
            align-items: stretch;
            flex-direction: column;
          }
          .submitButton { width: 100%; }
          .tenantNote { text-align: center; }
          .footer {
            flex-direction: column;
            gap: 5px;
            padding-bottom: 12px;
          }
        }

        @media (max-height: 820px) and (min-width: 1181px) {
          .topbar { height: 60px; }
          .registrationLayout {
            min-height: calc(100vh - 91px);
            padding: 15px 0 10px;
            gap: 24px;
          }
          .overview h1 { font-size: 45px; }
          .overviewCopy { margin: 12px 0 16px; }
          .progressPanel { padding: 13px; }
          .cardHeader { padding: 16px 20px; }
          form { padding: 16px 20px 13px; }
          .field { margin-bottom: 8px; }
          .fieldInput { height: 35px; }
          .sectionTitle { margin-bottom: 11px; }
          .securityTitle { margin: 13px 0 8px; }
          .addressPreview { min-height: 76px; }
        }


        /* Readability pass — desktop enterprise scale */
        @media (min-width: 1181px) {
          .topbar { height: 76px; }
          .brandIcon { width: 42px; height: 42px; border-radius: 11px; }
          .brandIcon img { width: 29px; height: 29px; }
          .brandText strong { font-size: 18px; }
          .brandText small { font-size: 9px; }
          .topbarRight { font-size: 12px; }
          .securePill { padding: 8px 12px; font-size: 9px; }

          .registrationLayout {
            min-height: calc(100vh - 108px);
            grid-template-columns: minmax(340px, .72fr) minmax(780px, 1.9fr);
            gap: 42px;
            padding: 34px 0 24px;
          }

          .eyebrow { font-size: 9px; }
          .eyebrow i { width: 7px; height: 7px; }
          .overview h1 {
            font-size: clamp(52px, 4.5vw, 72px);
            line-height: .99;
          }
          .overviewCopy {
            max-width: 500px;
            margin: 20px 0 27px;
            font-size: 15px;
            line-height: 1.65;
          }

          .progressPanel {
            max-width: 500px;
            padding: 20px;
            border-radius: 19px;
          }
          .progressHeader span { font-size: 9px; }
          .progressHeader strong { font-size: 11px; }
          .progressHeader > b { font-size: 15px; }
          .progressTrack { height: 4px; margin: 15px 0 17px; }
          .steps { gap: 12px; }
          .step { gap: 11px; }
          .step > span {
            width: 32px;
            height: 32px;
            flex-basis: 32px;
            border-radius: 9px;
            font-size: 9px;
          }
          .step b { font-size: 12px; }
          .step small { font-size: 9px; }
          .overviewStats { gap: 28px; margin-top: 23px; }
          .overviewStats b { font-size: 9px; }
          .overviewStats span { font-size: 9px; }

          .registrationCard { border-radius: 25px; }
          .cardHeader { padding: 25px 29px; }
          .cardKicker { font-size: 9px; }
          .cardHeader h2 { font-size: 30px; }
          .cardHeader p { font-size: 12px; }
          .online { font-size: 9px; }

          form { padding: 27px 29px 22px; }
          .formColumns { gap: 34px; }
          .locationColumn { padding-left: 34px; }

          .sectionTitle { gap: 12px; margin-bottom: 18px; }
          .sectionTitle > span {
            width: 34px;
            height: 34px;
            flex-basis: 34px;
            border-radius: 9px;
            font-size: 9px;
          }
          .sectionTitle h3 { font-size: 14px; }
          .sectionTitle p { font-size: 9px; }
          .ready { font-size: 9px; padding: 6px 9px; }

          .field { margin-bottom: 14px; }
          .field > span { margin-bottom: 7px; font-size: 11px; }
          .fieldInput {
            height: 48px;
            border-radius: 11px;
            padding: 0 14px;
            font-size: 14px;
          }
          .statusInput .fieldInput { padding-right: 40px; }
          .statusInput > i { right: 14px; font-size: 13px; }
          .hint { margin-top: 5px; font-size: 9px; }

          .securityTitle { margin: 23px 0 14px; }
          .twoFields { gap: 12px; }
          .passwordInput .fieldInput { padding-right: 63px; }
          .passwordInput button { right: 10px; font-size: 9px; }
          .requirements { gap: 7px 14px; }
          .requirements span { font-size: 9px; }

          .locationGrid { gap: 0 12px; }
          .selectInput { padding-right: 36px; }
          .selectWrap::after { right: 14px; font-size: 13px; }

          .addressPreview {
            min-height: 100px;
            margin-top: 5px;
            padding: 13px 15px;
            border-radius: 13px;
          }
          .addressTop span,
          .addressTop b { font-size: 9px; }
          .addressBody { gap: 11px; margin-top: 9px; }
          .addressBody strong { font-size: 21px; }
          .addressBody p { font-size: 12px; }
          .addressPreview > small { margin-top: 7px; font-size: 9px; }

          .locationInfo { gap: 8px; margin-top: 10px; }
          .locationInfo > span {
            width: 18px;
            height: 18px;
            flex-basis: 18px;
            font-size: 9px;
          }
          .locationInfo p { font-size: 9px; }

          .submitBar {
            gap: 24px;
            margin-top: 21px;
            padding-top: 18px;
          }
          .submitTrust { gap: 10px; }
          .submitTrust > span { font-size: 16px; }
          .submitTrust b { font-size: 10px; }
          .submitTrust small { font-size: 9px; }
          .submitButton {
            min-width: 260px;
            height: 50px;
            border-radius: 11px;
            font-size: 12px;
          }
          .submitButton > b { font-size: 17px; }
          .tenantNote { margin-top: 12px; font-size: 9px; }

          .footer { font-size: 9px; }
        }

        @media (min-width: 1181px) and (max-height: 820px) {
          .topbar { height: 68px; }
          .registrationLayout {
            min-height: calc(100vh - 99px);
            padding-top: 20px;
            padding-bottom: 14px;
            gap: 30px;
          }
          .overview h1 { font-size: 54px; }
          .overviewCopy { font-size: 13px; margin: 15px 0 19px; }
          .progressPanel { padding: 16px; }
          .step > span { width: 29px; height: 29px; flex-basis: 29px; }
          .step b { font-size: 10px; }
          .step small { font-size: 9px; }
          .cardHeader { padding: 20px 24px; }
          .cardHeader h2 { font-size: 27px; }
          .cardHeader p { font-size: 10px; }
          form { padding: 20px 24px 16px; }
          .formColumns { gap: 27px; }
          .locationColumn { padding-left: 27px; }
          .sectionTitle h3 { font-size: 12px; }
          .field > span { font-size: 10px; }
          .fieldInput { height: 42px; font-size: 12px; }
          .field { margin-bottom: 10px; }
          .requirements span { font-size: 9px; }
          .addressPreview { min-height: 86px; padding: 11px 13px; }
          .addressBody p { font-size: 10px; }
          .submitButton { height: 45px; min-width: 235px; font-size: 10px; }
        }

        @media (max-width: 1180px) {
          .cardHeader h2 { font-size: 27px; }
          .cardHeader p { font-size: 11px; }
          .sectionTitle h3 { font-size: 13px; }
          .sectionTitle p { font-size: 9px; }
          .field > span { font-size: 10px; }
          .fieldInput { height: 45px; font-size: 13px; }
          .requirements span { font-size: 9px; }
          .addressBody p { font-size: 11px; }
          .submitButton { height: 48px; font-size: 11px; }
        }

        @media (max-width: 760px) {
          .cardHeader h2 { font-size: 24px; }
          .cardHeader p { font-size: 10px; line-height: 1.5; }
          .sectionTitle h3 { font-size: 12px; }
          .field > span { font-size: 10px; }
          .fieldInput { height: 46px; font-size: 13px; }
          .requirements span { font-size: 9px; }
          .addressBody p { font-size: 10px; }
        }


        /* ---- card polish: rise-in, living border, CTA ring, field focus ---- */
        .registrationCard {
          animation:
            fxCardRise 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) 0.1s both,
            fxBorderBreathe 5s ease-in-out 1.6s infinite;
        }

        .submitButton:not(:disabled) {
          animation: fxCtaRing 3.2s ease-out 1.8s infinite;
        }

        .fieldInput {
          transition: border-color 0.2s, box-shadow 0.25s, background 0.2s, transform 0.25s;
        }

        .fieldInput:focus {
          transform: translateY(-1px);
        }

        @keyframes fxCardRise {
          from { opacity: 0; transform: translateY(26px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes fxBorderBreathe {
          50% { border-color: rgba(117, 229, 255, 0.36); }
        }

        @keyframes fxCtaRing {
          0% { outline: 2px solid rgba(112, 237, 255, 0.5); outline-offset: 0; }
          70%, 100% { outline: 2px solid rgba(112, 237, 255, 0); outline-offset: 14px; }
        }


        /* ---- weak password warning (Registration status) ---- */
        .pwWarning {
          margin-top: 14px;
          padding: 14px;
          border: 1px solid rgba(255, 200, 87, 0.45);
          border-radius: 14px;
          background: rgba(255, 200, 87, 0.08);
          animation: fxCardRise 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }

        .pwWarningHead {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 6px;
          color: #ffd98a;
          font-size: 13px;
        }

        .pwWarningHead b {
          width: 20px;
          height: 20px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: #ffc857;
          color: #2a1b00;
          font-size: 12px;
        }

        .pwWarning p {
          margin: 0 0 12px;
          color: rgba(255, 236, 200, 0.85);
          font-size: 12px;
          line-height: 1.55;
        }

        .pwWarningActions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .pwStrong,
        .pwKeep,
        .pwNote button {
          padding: 8px 12px;
          border-radius: 9px;
          font: inherit;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
        }

        .pwStrong {
          border: 1px solid rgba(112, 237, 255, 0.5);
          background: linear-gradient(135deg, #e9fcff, #a6efff);
          color: #031016;
        }

        .pwKeep,
        .pwNote button {
          border: 1px solid rgba(255, 200, 87, 0.5);
          background: transparent;
          color: #ffd98a;
        }

        .pwStrong:hover,
        .pwKeep:hover,
        .pwNote button:hover {
          transform: translateY(-1px);
        }

        .pwKeep:hover,
        .pwNote button:hover {
          background: rgba(255, 200, 87, 0.12);
        }

        .pwNote {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 12px;
          padding: 10px 12px;
          border: 1px solid rgba(255, 200, 87, 0.3);
          border-radius: 12px;
          background: rgba(255, 200, 87, 0.05);
          color: rgba(255, 236, 200, 0.85);
          font-size: 11.5px;
          line-height: 1.5;
        }

        .pwNoteGood {
          border-color: rgba(54, 224, 161, 0.4);
          background: rgba(54, 224, 161, 0.07);
          color: #b9f5dd;
        }

        .pwNoteGood button {
          border-color: rgba(54, 224, 161, 0.5);
          color: #7df0c0;
        }


        /* ---- semi-secured (kept weak password): yellow, counts as done ---- */
        .step.semi { opacity: 1; }
        .step.semi > span {
          color: #ffd98a;
          border-color: rgba(255, 200, 87, 0.5);
          background: rgba(255, 200, 87, 0.1);
          font-weight: 800;
        }
        .step.semi b { color: #ffe7b3; }
        .step.semi small { color: #ffd98a; }
        .semiReady {
          color: #ffd98a;
        }

        @media (prefers-reduced-motion: reduce) {
          .progressTrack i,
          .submitButton,
          .spinner { animation: none; transition: none; }
        }
      `}</style>
    </main>
  );
}