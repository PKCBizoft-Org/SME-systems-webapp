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
      setError(
        err instanceof Error ? err.message : "Unable to create your account.",
      );
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
        <Link href="/login" className="text-xl font-black tracking-tight">
          PKC <span className="text-sky-400">BIZOFT</span>
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
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-400/20 bg-sky-400/10 text-2xl">
              ✦
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
