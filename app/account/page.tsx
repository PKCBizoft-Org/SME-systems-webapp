'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabaseClient'
import { passwordWarning } from '@/lib/passwordStrength'
import { StaffHeader } from '../components/StaffHeader'
import { PkcLoader } from '../components/PkcLoader'

// Staff account page: change the password to one that is more comfortable, or
// simply keep the current one. (Customers and technicians do the same in the app.)
export default function AccountPage() {
  const router = useRouter()
  const supabase = createClient()

  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState('')
  const [roles, setRoles] = useState<string[]>([])
  const [employeeNumber, setEmployeeNumber] = useState('')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        router.replace('/login')
        return
      }
      const userId = data.session.user.id
      const [{ data: memberships }, { data: details }] = await Promise.all([
        supabase.from('tenant_users').select('role').eq('user_id', userId),
        supabase.from('user_profiles').select('employee_number').eq('user_id', userId).maybeSingle(),
      ])
      if (cancelled) return
      setEmail(data.session.user.email || '')
      setRoles((memberships || []).map((m) => m.role as string))
      setEmployeeNumber((details?.employee_number as string | null) || '')
      setChecking(false)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setDone(false)

    if (password.length < 8) {
      setError('Your password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }

    setSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }
    setPassword('')
    setConfirm('')
    setDone(true)
  }

  if (checking) {
    return <PkcLoader label="Opening your account" steps={['Checking your session', 'Opening your account']} />
  }

  const warning = passwordWarning(password, email)

  return (
    <main className="accountPage">
      <StaffHeader current="account" roles={roles} />

      <section className="content">
        <div className="eyebrow">PKC BIZOFT / MY ACCOUNT</div>
        <h1>My account</h1>
        <p className="subtitle">
          {email}
          {employeeNumber ? ` · ${employeeNumber}` : ''}
        </p>

        <div className="card">
          <h2>Password</h2>
          <p className="hint">
            Want a password that is more comfortable for you? Change it here. Or keep the one you
            have now. Nothing changes unless you save.
          </p>

          <form onSubmit={handleSubmit} className="form">
            <label>
              <span>New password</span>
              <div className="row">
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                />
                <button type="button" className="toggle" onClick={() => setShow((v) => !v)} tabIndex={-1}>
                  {show ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            <label>
              <span>Confirm new password</span>
              <input
                type={show ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </label>

            {warning ? (
              <div className="warn" role="status">
                {warning} You can still use it, but a harder one is safer.
              </div>
            ) : null}
            {error ? <div className="err" role="alert">{error}</div> : null}
            {done ? <div className="ok" role="status">Password updated.</div> : null}

            <div className="actions">
              <button type="submit" className="primary" disabled={saving || !password}>
                {saving ? 'Saving…' : 'Save my new password'}
              </button>
              <button type="button" className="secondary" onClick={() => router.back()}>
                Keep my current password
              </button>
            </div>
          </form>
        </div>
      </section>

      <style jsx>{`
        .accountPage {
          min-height: 100vh;
          background: #05090f;
          color: #eef7ff;
        }
        .content {
          width: min(560px, 100% - 32px);
          margin: 0 auto;
          padding: 56px 0 80px;
        }
        .eyebrow {
          color: #22d3ee;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.14em;
        }
        h1 {
          margin: 10px 0 4px;
          font-size: 34px;
          letter-spacing: -0.03em;
        }
        .subtitle {
          margin: 0 0 24px;
          color: #8ca1b1;
          font-size: 14px;
        }
        .card {
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: #0a1017;
          border-radius: 16px;
          padding: 26px;
        }
        h2 {
          margin: 0 0 8px;
          font-size: 18px;
        }
        .hint {
          margin: 0 0 20px;
          color: #8ca1b1;
          font-size: 13px;
          line-height: 1.6;
        }
        .form {
          display: grid;
          gap: 14px;
        }
        label {
          display: grid;
          gap: 7px;
          font-size: 12px;
          font-weight: 700;
          color: #9bb0c0;
        }
        input {
          height: 44px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: #060b11;
          color: #eef7ff;
          padding: 0 14px;
          font-size: 14px;
          width: 100%;
          box-sizing: border-box;
        }
        .row {
          display: flex;
          gap: 8px;
        }
        .toggle {
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: transparent;
          color: #8ca1b1;
          border-radius: 10px;
          padding: 0 14px;
          cursor: pointer;
          font-size: 12px;
        }
        .warn {
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid rgba(245, 158, 11, 0.4);
          background: rgba(245, 158, 11, 0.08);
          color: #fcd34d;
          font-size: 12px;
        }
        .err {
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid rgba(255, 107, 107, 0.3);
          background: rgba(255, 107, 107, 0.08);
          color: #ff9b9b;
          font-size: 12px;
        }
        .ok {
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid rgba(48, 224, 139, 0.3);
          background: rgba(48, 224, 139, 0.08);
          color: #76eeb0;
          font-size: 13px;
        }
        .actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .primary,
        .secondary {
          height: 44px;
          border-radius: 10px;
          padding: 0 18px;
          font-weight: 800;
          font-size: 13px;
          cursor: pointer;
        }
        .primary {
          background: #22d3ee;
          border: 1px solid #22d3ee;
          color: #00141b;
        }
        .primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .secondary {
          background: transparent;
          border: 1px solid rgba(34, 211, 238, 0.5);
          color: #22d3ee;
        }
      `}</style>
    </main>
  )
}
