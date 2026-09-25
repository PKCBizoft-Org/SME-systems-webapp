'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabaseClient'

export default function SetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()

  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [email, setEmail] = useState('')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function check() {
      /*
        The invite link's tokens are in the URL when this page first
        loads. The Supabase client (with detectSessionInUrl enabled,
        which is the default) reads them and creates a session
        automatically — we just need to wait a moment and check.
      */
      const { data } = await supabase.auth.getSession()

      if (cancelled) return

      if (data.session) {
        setHasSession(true)
        setEmail(data.session.user.email || '')
      }

      setChecking(false)
    }

    check()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setHasSession(true)
        setEmail(session.user.email || '')
        setChecking(false)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
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

    setSuccess(true)
    window.setTimeout(() => router.replace('/clients'), 1500)
  }

  if (checking) {
    return (
      <main className="setPasswordPage">
        <div className="card">
          <p className="checking">Checking your invite link...</p>
        </div>
        <style jsx>{styles}</style>
      </main>
    )
  }

  if (!hasSession) {
    return (
      <main className="setPasswordPage">
        <div className="card">
          <h1>This link isn't valid</h1>
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
          You're setting a password for <strong>{email}</strong>.
        </p>

        {success ? (
          <div className="successBox">
            Password set. Taking you to your dashboard...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="form">
            <label>
              <span>New password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>

            <label>
              <span>Confirm password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
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
    font-family: Inter, ui-sans-serif, system-ui, -apple-system,
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

  .form input {
    height: 44px;
    padding: 0 12px;
    border-radius: 9px;
    border: 1px solid rgba(255,255,255,0.1);
    background: #05090d;
    color: #eef7ff;
    font: inherit;
    font-size: 14px;
  }

  .form input:focus {
    outline: none;
    border-color: rgba(21,153,255,0.5);
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