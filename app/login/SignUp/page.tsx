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
    setProvinceCode("");
    setCityCode("");
    setBarangayCode("");
    setProvinces([]);
    setCities([]);
    setBarangays([]);

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
    setCityCode("");
    setBarangayCode("");
    setCities([]);
    setBarangays([]);

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
    setBarangayCode("");
    setBarangays([]);

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

  const input =
    "w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-sky-400/60 focus:bg-white/[0.07]";
  const select =
    "w-full appearance-none rounded-2xl border border-white/10 bg-[#101722] px-4 py-3.5 text-sm text-white outline-none transition focus:border-sky-400/60 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <main className="min-h-screen bg-[#06090f] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[-15%] h-[500px] w-[500px] rounded-full bg-sky-500/10 blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[-10%] h-[500px] w-[500px] rounded-full bg-blue-600/10 blur-[120px]" />
      </div>
      <nav className="relative z-10 flex h-16 items-center justify-between border-b border-white/10 px-6 md:px-10">
        <Link href="/login" className="flex items-center gap-2.5">
          <img
            src={PKC_LOGO}
            alt="PKC BIZOFT"
            className="h-8 w-8 drop-shadow-[0_0_10px_rgba(56,189,248,0.35)]"
          />
          <span className="text-xl font-black tracking-tight">
            PKC <span className="text-sky-400">BIZOFT</span>
          </span>
        </Link>
        <div className="text-sm text-white/50">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-sky-400 hover:text-sky-300"
          >
            Sign in
          </Link>
        </div>
      </nav>
      <section className="relative z-10 mx-auto flex w-full max-w-6xl justify-center px-4 py-10 md:px-8 md:py-14">
        <div className="w-full max-w-2xl">
          <div className="mb-7 text-center">
            <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center">
              <div className="absolute inset-0 rounded-2xl bg-sky-400/20 blur-xl" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-sky-400/25 bg-white/[0.04] backdrop-blur-sm">
                <img
                  src={PKC_LOGO}
                  alt=""
                  className="h-10 w-10 drop-shadow-[0_0_12px_rgba(56,189,248,0.45)]"
                />
              </div>
            </div>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
              Create your account
            </h1>
            <p className="mt-2 text-sm text-white/50">
              Set up your PKC BIZOFT account and service location.
            </p>
          </div>
          <form
            onSubmit={handleSubmit}
            className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/30 backdrop-blur-xl md:p-8"
          >
            <div className="space-y-6">
              <section>
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">
                  Account
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="md:col-span-2">
                    <span className="mb-2 block text-sm font-medium text-white/75">
                      Full name
                    </span>
                    <input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className={input}
                      placeholder="Juan Dela Cruz"
                      autoComplete="name"
                    />
                  </label>
                  <label className="md:col-span-2">
                    <span className="mb-2 block text-sm font-medium text-white/75">
                      Email address
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={input}
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                  </label>
                  <label>
                    <span className="mb-2 block text-sm font-medium text-white/75">
                      Password
                    </span>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`${input} pr-12`}
                        placeholder="At least 8 characters"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/45 hover:text-white"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </label>
                  <label>
                    <span className="mb-2 block text-sm font-medium text-white/75">
                      Confirm password
                    </span>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={`${input} pr-12`}
                        placeholder="Repeat your password"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/45 hover:text-white"
                      >
                        {showConfirmPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </label>
                </div>
              </section>
              <div className="h-px bg-white/10" />
              <section>
                <div className="mb-4">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">
                    Service location
                  </h2>
                  <p className="mt-1 text-xs text-white/40">
                    Purok/street is free text. Region, province,
                    city/municipality, and barangay are filtered from the
                    complete Philippine PSGC hierarchy.
                  </p>
                </div>
                <div className="grid gap-4">
                  <label>
                    <span className="mb-2 block text-sm font-medium text-white/75">
                      Purok / Street
                    </span>
                    <input
                      value={purok}
                      onChange={(e) => setPurok(e.target.value)}
                      className={input}
                      placeholder="Purok 5, Rizal Street, etc."
                    />
                  </label>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label>
                      <span className="mb-2 block text-sm font-medium text-white/75">
                        Region
                      </span>
                      <select
                        value={regionCode}
                        onChange={(e) => setRegionCode(e.target.value)}
                        className={select}
                        disabled={loadingLocations}
                      >
                        <option value="">
                          {loadingLocations
                            ? "Loading Philippine regions..."
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
                    </label>
                    <label>
                      <span className="mb-2 block text-sm font-medium text-white/75">
                        Province
                      </span>
                      <select
                        value={provinceCode}
                        onChange={(e) => setProvinceCode(e.target.value)}
                        className={select}
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
                    </label>
                    <label>
                      <span className="mb-2 block text-sm font-medium text-white/75">
                        City / Municipality
                      </span>
                      <select
                        value={cityCode}
                        onChange={(e) => setCityCode(e.target.value)}
                        className={select}
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
                    </label>
                    <label>
                      <span className="mb-2 block text-sm font-medium text-white/75">
                        Barangay
                      </span>
                      <select
                        value={barangayCode}
                        onChange={(e) => setBarangayCode(e.target.value)}
                        className={select}
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
                    </label>
                  </div>
                </div>
                {addressPreview && (
                  <div className="mt-5 rounded-2xl border border-sky-400/15 bg-sky-400/[0.045] p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-400">
                      Address preview
                    </div>
                    <div className="mt-1 text-sm leading-6 text-white/75">
                      {addressPreview}
                    </div>
                  </div>
                )}
              </section>
              {error && (
                <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}
              {success && (
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                  {success}
                </div>
              )}
              <button
                type="submit"
                disabled={submitting || loadingLocations}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-sm font-bold text-[#071019] transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Creating account..." : "Create account"}
                {!submitting && <span>→</span>}
              </button>
              <p className="text-center text-xs leading-5 text-white/35">
                Creating an account does not automatically grant
                organization/tenant access. Tenant membership is assigned
                separately.
              </p>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}