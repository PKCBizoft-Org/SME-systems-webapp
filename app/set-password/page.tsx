'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabaseClient'
import { homeForUser } from '@/lib/homeForRole'
import { PkcLoader } from '../components/PkcLoader'

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

  if (checking) {
    return (
      <PkcLoader label="Checking your invite link" steps={['Checking your invite link', 'Preparing your account']} />
    )
  }

  if (!hasSession) {
    return (
      <main className="setPasswordPage">
        <div className="card">
          <h1>This link isn&apos;t valid</h1>
          <p className="subtitle">
            This invite link may have expired or already been used.
            Ask your admin to send a new invite.
          </p>
        </div>
        <style jsx>{styles}</style>
      </main>
    )
  }

  return (
    <main className="setPasswordPage">
      <div className="card">
        <h1>Set your password</h1>
        <p className="subtitle">
          You&apos;re setting a password for <strong>{email}</strong>.
        </p>

        {success ? (
          <div className="successBox">
            Password set. Taking you to your dashboard...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="form">
            <label>
              <span>New password</span>
              <div className="inputRow">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="toggleVisibility"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={
                    showPassword ? 'Hide password' : 'Show password'
                  }
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <span className="fieldHint">At least 8 characters.</span>
            </label>

            <label>
              <span>Confirm password</span>
              <div className="inputRow">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="toggleVisibility"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={
                    showConfirmPassword
                      ? 'Hide password'
                      : 'Show password'
                  }
                >
                  {showConfirmPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            {error && <div className="errorBox">{error}</div>}

            <button type="submit" disabled={saving}>
              {saving ? 'Setting password...' : 'Set password and continue'}
            </button>
          </form>
        )}
      </div>

      <style jsx>{styles}</style>
    </main>
  )
}

const styles = `
  .setPasswordPage {
    min-height: 100vh;
    display: grid;
    place-items: center;
    background: #05090d;
    color: #eef7ff;
    font-family: var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system,
      BlinkMacSystemFont, "Segoe UI", sans-serif;
    padding: 20px;
  }

  .card {
    width: min(420px, 100%);
    padding: 34px;
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.1);
    background: #0a1017;
    box-shadow: 0 30px 80px rgba(0,0,0,0.5);
  }

  h1 {
    margin: 0 0 8px;
    font-size: 24px;
    letter-spacing: -0.03em;
  }

  .subtitle {
    margin: 0 0 24px;
    color: #8ca1b1;
    font-size: 13px;
    line-height: 1.6;
  }

  .subtitle strong {
    color: #eef7ff;
  }

  .checking {
    text-align: center;
    color: #8ca1b1;
    font-size: 14px;
    margin: 0;
  }

  .form {
    display: grid;
    gap: 16px;
  }

  .form label {
    display: grid;
    gap: 7px;
    font-size: 12px;
    font-weight: 700;
    color: #9bb0c0;
  }

  .inputRow {
    position: relative;
    display: flex;
    align-items: center;
  }

  .form input {
    height: 44px;
    padding: 0 60px 0 12px;
    border-radius: 9px;
    border: 1px solid rgba(255,255,255,0.1);
    background: #05090d;
    color: #eef7ff;
    font: inherit;
    font-size: 14px;
    width: 100%;
  }

  .form input:focus {
    outline: none;
    border-color: rgba(21,153,255,0.5);
  }

  .toggleVisibility {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: #1599ff;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    padding: 4px 6px;
    height: auto;
  }

  .toggleVisibility:hover {
    color: #4cb6ff;
  }

  .fieldHint {
    font-size: 11px;
    font-weight: 400;
    color: #6f8497;
  }

  .errorBox {
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid rgba(255,107,107,0.3);
    background: rgba(255,107,107,0.08);
    color: #ff9b9b;
    font-size: 12px;
  }

  .successBox {
    padding: 12px 14px;
    border-radius: 8px;
    border: 1px solid rgba(48,224,139,0.3);
    background: rgba(48,224,139,0.08);
    color: #76eeb0;
    font-size: 13px;
  }

  button {
    height: 46px;
    border-radius: 10px;
    border: 1px solid rgba(21,153,255,0.4);
    background: #1599ff;
    color: #04101c;
    font-weight: 800;
    font-size: 14px;
    cursor: pointer;
    font-family: inherit;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`