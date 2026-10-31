"use client";

/* Sign-in page, in the same dark, clean look as the public pages. The sign-in steps are unchanged:
   lockout check, password sign-in, temporary-password redirect, staff 2-step, then the user's home. */
/* eslint-disable @next/next/no-html-link-for-pages */

import { FormEvent, MouseEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { homeForUser } from "@/lib/homeForRole";
import { attemptsMessage, checkLock, lockMessage, recordAttempt } from "@/lib/loginLockout";
import { StaffVerification } from "../components/StaffVerification";
import { YesNoDialog } from "../components/YesNoDialog";
import s from "./login.module.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageOk, setMessageOk] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [askHome, setAskHome] = useState(false);
  const closeAskHome = useCallback(() => setAskHome(false), []);
  const [pendingDestination, setPendingDestination] = useState("/clients");
  const [emailTouched, setEmailTouched] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  const emailBad = emailTouched && email.length > 0 && !EMAIL_RE.test(email.trim());

  useEffect(() => {
    document.title = "Sign in | PKC BIZOFT";
    // ?changed=... after a password change (read after mount: the URL isn't known while rendering)
    const timer = window.setTimeout(() => {
      const changed = new URLSearchParams(window.location.search).get("changed");
      if (changed) {
        setMessageOk(true);
        setMessage(changed === "kept"
          ? "Okay! Sign in with your default password."
          : "Password updated. Sign in with your new password.");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const fail = (text: string) => {
    setMessageOk(false);
    setMessage(text);
    setLoading(false);
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage("");

    // Too many wrong passwords recently: do not even try.
    const lock = await checkLock(email);
    if (lock.locked) return fail(lockMessage(lock.secondsLeft));

    const { data: signInData, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      const text = error.message.toLowerCase();
      const wrongPassword = text.includes("invalid login credentials");
      const after = wrongPassword ? await recordAttempt(email, false) : null;
      return fail(after?.locked
        ? lockMessage(after.secondsLeft)
        : wrongPassword
          ? `The email or password is incorrect. Please try again.${attemptsMessage(after?.attemptsLeft ?? 5)}`
          : text.includes("email not confirmed")
            ? "Please confirm your email address before signing in."
            : "We couldn't sign you in right now. Please check your details and try again.");
    }

    // Signed in: clear the count. If the address is locked after all (for
    // example another device locked it a moment ago), sign out again.
    const afterSuccess = await recordAttempt(email, true);
    if (afterSuccess.locked) {
      await supabase.auth.signOut();
      return fail(lockMessage(afterSuccess.secondsLeft));
    }

    // A new account (or a re-issued password) starts with a temporary password:
    // it expires after 24 hours and must be replaced before anything else.
    const tempInfo = signInData.user?.app_metadata as
      | { must_change_password?: boolean; temp_expires_at?: string }
      | undefined;
    if (tempInfo?.must_change_password) {
      if (tempInfo.temp_expires_at && new Date(tempInfo.temp_expires_at) < new Date()) {
        await supabase.auth.signOut();
        return fail("Your temporary password has expired. Ask your administrator to issue a new one.");
      }
      window.location.assign("/set-password?first=1");
      return;
    }

    const destination = signInData.user ? await homeForUser(supabase, signInData.user.id) : "/clients";

    // Anyone with a staff role must pass the email code and secondary
    // password before they are let in.
    const statusResponse = await fetch("/api/security/status", {
      headers: { Authorization: `Bearer ${signInData.session?.access_token}` },
    });
    const status = await statusResponse.json().catch(() => ({}));
    if (statusResponse.ok && status.staff && !status.verified) {
      setPendingDestination(destination);
      setVerifying(true);
      setLoading(false);
      return;
    }

    window.location.href = destination;
  };

  const cancelVerification = async () => {
    await supabase.auth.signOut();
    setVerifying(false);
    setPassword("");
    setMessageOk(false);
    setMessage("Sign-in cancelled.");
  };

  // Leaving by accident throws away a half-finished sign-in.
  const guardLeave = (event: MouseEvent<HTMLAnchorElement>) => {
    if (verifying || email || password) {
      event.preventDefault();
      setAskHome(true);
    }
  };

  return (
    <div className={s.page}>
      {verifying ? (
        <StaffVerification
          email={email.trim()}
          mode="login"
          onVerified={() => {
            setVerifying(false);
            window.location.href = pendingDestination;
          }}
          onCancel={() => void cancelVerification()}
        />
      ) : null}

      <YesNoDialog
        open={askHome}
        title="Stop signing in?"
        message="You will go to the home page and lose what you typed here."
        onYes={() => router.push("/")}
        onNo={closeAskHome}
      />

      <header className={s.header}>
        <nav className={s.nav} aria-label="Primary navigation">
          <a className={s.brand} href="/" onClick={guardLeave} aria-label="PKC BIZOFT home">
            <img src="/pkc-logo.webp" alt="" width={32} height={32} />
            <span>PKC BIZOFT</span>
          </a>
          <div className={s.navLinks}>
            <a href="/" onClick={guardLeave}>Home</a>
            <a href="/login/SignUp">Sign up</a>
          </div>
        </nav>
      </header>

      <main className={s.main}>
        <section className={s.card} aria-labelledby="login-title">
          <p className={s.kicker}>PKC BIZOFT</p>
          <h1 id="login-title" className={s.title}>Sign in</h1>
          <p className={s.lead}>Continue to your workspace.</p>

          <form className={s.form} onSubmit={handleLogin}>
            <label className={s.label}>
              Email
              <input
                className={s.input}
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onBlur={() => setEmailTouched(true)}
                autoComplete="email"
                inputMode="email"
                spellCheck={false}
                aria-invalid={emailBad}
                required
              />
            </label>
            {emailBad && (
              <p className={s.hint} role="status">Enter a complete email, like name@gmail.com.</p>
            )}

            <label className={s.label}>
              Password
              <span className={s.inputWrap}>
                <input
                  className={`${s.input} ${s.withToggle}`}
                  type={showPassword ? "text" : "password"}
                  placeholder="Your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className={s.toggle}
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
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
              </span>
            </label>

            <div className={s.row}>
              <button type="button" className={s.textButton} onClick={() => setShowForgot((v) => !v)}
                      aria-expanded={showForgot}>
                Forgot password?
              </button>
            </div>
            {showForgot && (
              <p className={s.note}>
                Customers and technicians: open the PKC BIZOFT app and tap Forgot password on its
                sign-in screen to get a reset code by email. Staff: ask your administrator for a new
                temporary password.
              </p>
            )}

            {message && (
              <p className={`${s.message} ${messageOk ? s.ok : ""}`} role="alert" aria-live="polite">
                {message}
              </p>
            )}

            <button className={s.btn} type="submit" disabled={loading} aria-busy={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className={s.signup}>
            Don&apos;t have an account?
            <a href="/login/SignUp">Create one</a>
          </p>
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
