'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabaseClient'
import styles from './staff-verification.module.css'

type Props = {
  email: string
  // 'login' = email code + secondary password. 'users' = secondary password only.
  mode: 'login' | 'users'
  onVerified: () => void
  onCancel: () => void
}

const RESEND_SECONDS = 45

// Forgotten secondary passwords are reset by the system owner in person.
const OWNER = {
  name: 'Prince AJ Y. Cuyos',
  phoneDisplay: '0905 740 4840',
  phoneHref: 'tel:+639057404840',
  facebook: 'https://www.facebook.com/Underrated.Prince.AJ',
  messenger: 'https://m.me/Underrated.Prince.AJ',
}

export function StaffVerification({ email, mode, onVerified, onCancel }: Props) {
  const supabase = createClient()
  const [step, setStep] = useState<'code' | 'secondary'>(mode === 'users' ? 'secondary' : 'code')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [needsSetup, setNeedsSetup] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [error, setError] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const startedRef = useRef(false)

  async function accessToken() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }

  const sendCode = useCallback(async () => {
    setSending(true)
    setError('')
    const { data } = await supabase.auth.getSession()
    const response = await fetch('/api/security/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
      body: JSON.stringify({ purpose: mode }),
    })
    const result = await response.json().catch(() => ({}))
    setSending(false)
    if (!response.ok) {
      setError(result?.error || 'Unable to send the code.')
      return
    }
    setSent(true)
    setCooldown(RESEND_SECONDS)
  }, [supabase, mode])

  useEffect(() => {
    if (startedRef.current || mode === 'users') return
    startedRef.current = true
    void sendCode()
  }, [sendCode, mode])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  async function submitCode(event: React.FormEvent) {
    event.preventDefault()
    const token = code.replace(/\s+/g, '')
    if (token.length !== 6) {
      setError('Enter the verification code from your email.')
      return
    }

    setBusy(true)
    setError('')
    const jwt = await accessToken()
    const verifyResponse = await fetch('/api/security/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ purpose: 'login', code: token }),
    })
    const verifyResult = await verifyResponse.json().catch(() => ({}))
    if (!verifyResponse.ok) {
      setBusy(false)
      setError(verifyResult?.error || 'That code is wrong or has expired.')
      return
    }

    const response = await fetch('/api/security/status', {
      headers: { Authorization: `Bearer ${jwt}` },
    })
    const status = await response.json().catch(() => ({}))
    setBusy(false)

    if (!response.ok) {
      setError(status?.error || 'Unable to continue. Please sign in again.')
      return
    }

    if (!status.staff) {
      onVerified()
      return
    }

    setNeedsSetup(!status.secondarySet)
    setStep('secondary')
  }

  async function submitSecondary(event: React.FormEvent) {
    event.preventDefault()
    if (!password) {
      setError('Enter your secondary password.')
      return
    }

    setBusy(true)
    setError('')
    const jwt = await accessToken()
    const response = await fetch('/api/security/secondary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ password, confirm: needsSetup ? confirm : undefined, purpose: mode }),
    })
    const result = await response.json().catch(() => ({}))
    setBusy(false)

    if (!response.ok) {
      setError(result?.error || 'Verification failed.')
      return
    }

    onVerified()
  }

  return (
    <div className={styles.backdrop} role="presentation">
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Security verification">
        <button type="button" className={styles.close} onClick={onCancel} aria-label="Cancel">
          ×
        </button>

        <div className={styles.kicker}>
          {mode === 'users'
            ? 'RESTRICTED AREA · USER MANAGEMENT'
            : `SECURITY CHECK · STEP ${step === 'code' ? 1 : 2} OF 2`}
        </div>

        {step === 'code' ? (
          <form onSubmit={submitCode}>
            <h2>Enter your email code</h2>
            <p className={styles.lead}>
              {sending && !sent
                ? 'Sending a verification code to '
                : 'We sent a verification code to '}
              <strong>{email}</strong>.{' '}
              {mode === 'users' ? 'Enter it to open user management.' : 'Enter it to continue signing in.'}
            </p>

            <input
              className={styles.codeInput}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Verification code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              autoFocus
            />

            {error ? <div className={styles.error} role="alert">{error}</div> : null}

            <button type="submit" className={styles.primary} disabled={busy || sending}>
              {busy ? 'Checking…' : 'Verify code'}
            </button>
            <button
              type="button"
              className={styles.link}
              onClick={() => void sendCode()}
              disabled={sending || cooldown > 0}
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitSecondary}>
            <h2>{needsSetup ? 'Create your secondary password' : 'Enter your secondary password'}</h2>
            <p className={styles.lead}>
              {mode === 'users'
                ? 'Type your secondary password to open user management.'
                : needsSetup
                ? 'This is your second security password, separate from your login password. You will need it every time you sign in. Use at least 8 characters.'
                : 'This is the second security password you created for this account.'}
            </p>

            <input
              className={styles.textInput}
              type="password"
              autoComplete={needsSetup ? 'new-password' : 'current-password'}
              placeholder="Secondary password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
            />
            {needsSetup ? (
              <input
                className={styles.textInput}
                type="password"
                autoComplete="new-password"
                placeholder="Confirm secondary password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            ) : null}

            {error ? <div className={styles.error} role="alert">{error}</div> : null}

            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? 'Checking…' : needsSetup ? 'Save and continue' : 'Continue'}
            </button>

            {!needsSetup ? (
              <button type="button" className={styles.link} onClick={() => setShowHelp((value) => !value)}>
                Forgot secondary password?
              </button>
            ) : null}

            {showHelp && !needsSetup ? (
              <div className={styles.help}>
                <strong>Contact the system owner to reset it</strong>
                <p>
                  A secondary password can only be reset by {OWNER.name}. Call or message
                   them and confirm who you are.
                </p>
                <a className={styles.callButton} href={OWNER.phoneHref}>
                  Call {OWNER.phoneDisplay}
                </a>
                <div className={styles.helpRow}>
                  <a className={styles.helpButton} href={OWNER.messenger} target="_blank" rel="noopener noreferrer">
                    Messenger
                  </a>
                  <a className={styles.helpButton} href={OWNER.facebook} target="_blank" rel="noopener noreferrer">
                    Facebook
                  </a>
                </div>
              </div>
            ) : null}
          </form>
        )}
      </div>
    </div>
  )
}
