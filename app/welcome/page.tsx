"use client";

/* Where a customer lands after signing in on the website. Customer accounts live
   in the Android app (bills, payments, repairs); the website is for staff, so
   instead of an error this page says so and hands them to the app. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "../../lib/supabaseClient";
import { homeForUser } from "@/lib/homeForRole";
import s from "../login/login.module.css";

const supabase = createClient();

export default function WelcomePage() {
  const [name, setName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const user = data.session?.user;
      if (!user) {
        window.location.replace("/login");
        return;
      }
      // Staff who end up here belong on their own page.
      const home = await homeForUser(supabase, user.id);
      if (cancelled) return;
      if (home !== "/welcome") {
        window.location.replace(home);
        return;
      }
      const { data: client } = await supabase.from("clients").select("customer_name").eq("user_id", user.id).maybeSingle();
      if (cancelled) return;
      const fullName = (client?.customer_name || (user.user_metadata?.full_name as string | undefined) || "").trim();
      setName(fullName ? fullName.split(/\s+/)[0] : null);
      setReady(true);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    window.location.replace("/");
  }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <nav className={s.nav} aria-label="Primary navigation">
          <Link className={s.brand} href="/" aria-label="PKC BIZOFT home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pkc-logo.webp" alt="" width={32} height={32} />
            <span>PKC BIZOFT</span>
          </Link>
        </nav>
      </header>

      <main className={s.main}>
        <section className={s.card} aria-labelledby="welcome-title" aria-busy={!ready}>
          <p className={s.kicker}>PKC NetLink</p>
          <h1 id="welcome-title" className={s.title}>
            {ready ? `Hi${name ? ` ${name}` : ""}, your account is ready` : "One moment…"}
          </h1>
          {ready && (
            <>
              <p className={s.lead}>
                Your bills, payments, repair requests and chat with your technician are in the PKC NetLink app. This website is for PKC staff.
              </p>
              <div className={s.form}>
                <a className={s.btn} href="/open-app" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
                  Open the app
                </a>
                <a className={s.btn} href="/download" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", background: "transparent", color: "inherit", border: "1px solid currentColor" }}>
                  Download the app (Android)
                </a>
                <p className={s.note}>Sign in to the app with the same email and password you just used.</p>
                <button type="button" className={s.textButton} onClick={() => void signOut()} disabled={signingOut}>
                  {signingOut ? "Signing out…" : "Sign out of the website"}
                </button>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
