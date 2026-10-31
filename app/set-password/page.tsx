'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabaseClient'
import { homeForUser } from '@/lib/homeForRole'
import { PkcLoader } from '../components/PkcLoader'
import s from '../login/login.module.css'

/* eslint-disable @next/next/no-html-link-for-pages */
/* Same dark, clean card as the login page. Password logic unchanged. */

export default function SetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()

  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [email, setEmail] = useState('')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let cancelled = false
    let settled = false

    function settle(sessionFound: boolean, userEmail?: string) {
      if (cancelled || settled) return
      settled = true
      setHasSession(sessionFound)
      if (userEmail) setEmail(userEmail)
      setChecking(false)
    }

    /*
      If the URL still has an unprocessed access_token in it, Supabase
      is in the middle of turning that into a session — a getSession()
      call that races ahead of that process will come back empty even
      though a real session is about to land. In that case we wait for
      the auth-state event (or a short fallback timeout) instead of
      declaring the link invalid on the first empty result.
    */
    const hasPendingAuthTokens =
      typeof window !== 'undefined' &&
      window.location.hash.includes('access_token')

    async function check() {
      const { data } = await supabase.auth.getSession()

      if (cancelled) return

      if (data.session) {
        settle(true, data.session.user.email || '')
        return
      }

      if (!hasPendingAuthTokens) {
        settle(false)
      }
      // else: still waiting on onAuthStateChange or the fallback below.
    }

    check()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        settle(true, session.user.email || '')
      }
    })

    const fallback = hasPendingAuthTokens
      ? window.setTimeout(() => settle(false), 5000)
      : null

    return () => {
      cancelled = true
      subscription.unsubscribe()
      if (fallback) window.clearTimeout(fallback)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSaving(true)

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    })

    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    // First sign-in with a temporary password: clear the flag on the server,
    // then sign out so the normal login (and 2-step check for staff) runs with
    // the new password.
    const firstLogin = new URLSearchParams(window.location.search).get('first')
    if (firstLogin) {
      const { data: sessionData } = await supabase.auth.getSession()
      const done = await fetch('/api/auth/password-changed', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      }).catch(() => null)
      if (!done?.ok) {
        setError('Your password was saved, but we could not finish the setup. Please try again.')
        return
      }
      await supabase.auth.signOut()
      setSuccess(true)
      window.setTimeout(() => router.replace('/login?changed=1'), 1500)
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    const destination = user ? await homeForUser(supabase, user.id) : '/clients'

    setSuccess(true)
    window.setTimeout(() => router.replace(destination), 1500)
  }

  // First sign-in with the default password an admin generated: the person may
  // also decide to simply keep it. The flag is cleared either way.
  async function keepDefault() {
    setError('')
    setSaving(true)
    const { data: sessionData } = await supabase.auth.getSession()
    const done = await fetch('/api/auth/password-changed', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
    }).catch(() => null)
    if (!done?.ok) {
      setSaving(false)
      setError('We could not save your choice. Please try again.')
      return
    }
    await supabase.auth.signOut()
    setSuccess(true)
    window.setTimeout(() => router.replace('/login?changed=kept'), 1500)
  }

  const isFirstLogin =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('first') === '1'

  if (checking) {
    return (
      <PkcLoader label="Checking your invite link" steps={['Checking your invite link', 'Preparing your account']} />
    )
  }

  const shell = (title: string, lead: React.ReactNode, body?: React.ReactNode) => (
    <div className={s.page}>
      <header className={s.header}>
        <nav className={s.nav} aria-label="Primary navigation">
          <a className={s.brand} href="/" aria-label="PKC BIZOFT home">
            <img src="/pkc-logo.webp" alt="" width={32} height={32} />
            <span>PKC BIZOFT</span>
          </a>
        </nav>
      </header>
      <main className={s.main}>
        <section className={s.card} aria-labelledby="setpw-title">
          <p className={s.kicker}>PKC BIZOFT</p>
          <h1 id="setpw-title" className={s.title}>{title}</h1>
          <p className={s.lead}>{lead}</p>
          {body}
        </section>
      </main>
      <footer className={s.footer}>
        <span>© 2026 PKC BIZOFT</span>
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
        <a href="/cookies">Cookies</a>
      </footer>
    </div>
  )

  if (!hasSession) {
    return shell(
      "This link isn't valid",
      'This invite link may have expired or already been used. Ask your admin to send a new invite.',
      <p className={s.signup}>
        Have a password already?
        <a href="/login">Sign in</a>
      </p>,
    )
  }

  const eye = (shown: boolean, toggle: () => void, what: string) => (
    <button type="button" className={s.toggle} onClick={toggle} aria-pressed={shown}
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
  )

  return shell(
    'Set your password',
    <>For <b>{email}</b>. Use at least 8 characters.</>,
    success ? (
      <p className={`${s.message} ${s.ok}`} role="status">
        {isFirstLogin
          ? 'Password saved. Taking you to sign in with your new password. Staff will then be asked for their 2-step code.'
          : 'Password set. Taking you to your dashboard…'}
      </p>
    ) : (
      <form className={s.form} onSubmit={handleSubmit}>
        <label className={s.label}>
          New password
          <span className={s.inputWrap}>
            <input className={`${s.input} ${s.withToggle}`} type={showPassword ? 'text' : 'password'}
                   value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
            {eye(showPassword, () => setShowPassword((v) => !v), 'password')}
          </span>
        </label>
        <label className={s.label}>
          Confirm password
          <span className={s.inputWrap}>
            <input className={`${s.input} ${s.withToggle}`} type={showConfirmPassword ? 'text' : 'password'}
                   value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                   autoComplete="new-password" required
                   aria-invalid={confirmPassword.length > 0 && confirmPassword !== password} />
            {eye(showConfirmPassword, () => setShowConfirmPassword((v) => !v), 'confirmation password')}
          </span>
        </label>

        {error && <p className={s.message} role="alert">{error}</p>}

        <button className={s.btn} type="submit" disabled={saving} aria-busy={saving}>
          {saving ? 'Saving…' : 'Set password and continue'}
        </button>
        {isFirstLogin && (
          <button type="button" className={s.textButton} disabled={saving} onClick={() => void keepDefault()}>
            Keep the default password instead
          </button>
        )}
      </form>
    ),
  )
}
