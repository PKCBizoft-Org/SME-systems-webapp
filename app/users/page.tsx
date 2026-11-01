'use client'

import { useCallback, useEffect, useState } from 'react'
import { StaffHeader } from '../components/StaffHeader'
import { StaffMotion } from '../components/StaffMotion'
import { PkcLoader } from '../components/PkcLoader'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabaseClient'
import { StaffVerification } from '../components/StaffVerification'
import { EMPTY_LOCATION, LocationFields, LocationValue } from '../components/LocationFields'


type TenantRole = 'admin' | 'technician' | 'customer' | 'accounting' | 'inventory'

type UserRow = {
  id: string
  email: string
  profileRole: string | null
  tenantRole: TenantRole
  status: 'active' | 'pending' | 'deactivated' | 'expired'
  invitedByEmail: string | null
  mustChangePassword: boolean
  fullName: string | null
  employeeNumber: string | null
  mobileNumber: string | null
  addressText: string | null
}

type AuditRow = {
  id: string
  actor_email: string | null
  target_email: string | null
  action: string
  detail: string | null
  created_at: string
}

const ROLE_ACCESS: Record<TenantRole, string> = {
  admin: 'Full access: manages users, accounting, clients, inventory and ratings.',
  technician: 'Sees and accepts installation/repair jobs, updates client locations and installation status, uses materials.',
  accounting: 'Verifies payments, bills and receipts, and processes referral withdrawals.',
  inventory: 'Manages inventory items, kits and stock movements.',
  customer: 'Own account only, through the customer portal / mobile app.',
}

const AUDIT_LABEL: Record<string, string> = {
  user_added: 'Added user',
  access_granted: 'Gave access',
  role_changed: 'Changed role',
  password_reissued: 'Re-issued temporary password',
  user_deactivated: 'Deactivated',
  user_reactivated: 'Reactivated',
  profile_updated: 'Updated profile',
}

function statusOf(u: Record<string, unknown>): UserRow['status'] {
  if (u.deactivated) return 'deactivated'
  if (
    u.mustChangePassword &&
    typeof u.tempExpiresAt === 'string' &&
    new Date(u.tempExpiresAt) < new Date()
  ) {
    return 'expired'
  }
  return u.status === 'active' ? 'active' : 'pending'
}

const ROLE_OPTIONS: { value: TenantRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'technician', label: 'Technician' },
  { value: 'accounting', label: 'Accounting' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'customer', label: 'Customer' },
]

export default function UsersPage() {
  const router = useRouter()
  const supabase = createClient()

  const [checking, setChecking] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [adminEmail, setAdminEmail] = useState('')
  // User management stays locked until the admin enters the emailed code.
  const [codeVerified, setCodeVerified] = useState(false)

  const [users, setUsers] = useState<UserRow[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [listError, setListError] = useState('')

  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<TenantRole | ''>('')
  const [inviteName, setInviteName] = useState('')
  const [inviteMobile, setInviteMobile] = useState('')
  const [inviteBirthday, setInviteBirthday] = useState('')
  const [inviteGender, setInviteGender] = useState('')
  const [inviteLocation, setInviteLocation] = useState<LocationValue>(EMPTY_LOCATION)
  const [locationReset, setLocationReset] = useState(0)
  const [inviting, setInviting] = useState(false)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [editUser, setEditUser] = useState<UserRow | null>(null)
  const [editMobile, setEditMobile] = useState('')
  const [editChangeAddress, setEditChangeAddress] = useState(false)
  const [editLocation, setEditLocation] = useState<LocationValue>(EMPTY_LOCATION)
  const [editError, setEditError] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [rowNotice, setRowNotice] = useState('')
  const [handoverPassword, setHandoverPassword] = useState<{ email: string; password: string } | null>(null)
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [showAudit, setShowAudit] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')

  const loadUsers = useCallback(
    async (forTenantId: string) => {
      setLoadingUsers(true)
      setListError('')

      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const accessToken = sessionData.session?.access_token

        if (!accessToken) {
          setListError('Your session has expired. Please sign in again.')
          setLoadingUsers(false)
          return
        }

        const response = await fetch(
          `/api/admin/list-users?tenantId=${encodeURIComponent(forTenantId)}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        )

        const result = await response.json()

        if (!response.ok) {
          if (result?.code === 'otp_required') setCodeVerified(false)
          setListError(result?.error || 'Unable to load users.')
          setLoadingUsers(false)
          return
        }

        const rows: UserRow[] = (result.users || []).map((u: Partial<UserRow> & { status?: string }) => ({
          id: u.id ?? '',
          email: u.email ?? '',
          profileRole: u.profileRole ?? null,
          tenantRole: (u.tenantRole as TenantRole) || 'customer',
          status: statusOf(u as Record<string, unknown>),
          invitedByEmail: u.invitedByEmail || null,
          mustChangePassword: Boolean((u as Record<string, unknown>).mustChangePassword),
          fullName: ((u as Record<string, unknown>).fullName as string | null) || null,
          employeeNumber: ((u as Record<string, unknown>).employeeNumber as string | null) || null,
          mobileNumber: ((u as Record<string, unknown>).mobileNumber as string | null) || null,
          addressText: ((u as Record<string, unknown>).addressText as string | null) || null,
        }))

        setUsers(rows)
      } catch (err) {
        setListError(
          err instanceof Error ? err.message : 'Unable to load users.',
        )
      } finally {
        setLoadingUsers(false)
      }
    },
    [supabase],
  )

  useEffect(() => {
    let cancelled = false

    async function init() {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession()

      if (sessionError || !sessionData.session) {
        router.replace('/login')
        return
      }

      const session = sessionData.session

      const { data: memberships, error: membershipError } = await supabase
        .from('tenant_users')
        .select('tenant_id, role')
        .eq('user_id', session.user.id)

      if (cancelled) return

      if (membershipError) {
        setListError(
          `Unable to verify access: ${membershipError.message || 'Unknown error'}`,
        )
        setChecking(false)
        return
      }

      const adminMembership = (memberships || []).find(
        (m) => m.role === 'admin',
      )

      if (!adminMembership) {
        router.replace('/clients')
        return
      }

      setAdminEmail(session.user.email || '')
      setAuthorized(true)
      setTenantId(adminMembership.tenant_id)
      setChecking(false)
    }

    init()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadAudit = useCallback(
    async (forTenantId: string) => {
      const { data } = await supabase
        .from('user_audit')
        .select('id, actor_email, target_email, action, detail, created_at')
        .eq('tenant_id', forTenantId)
        .order('created_at', { ascending: false })
        .limit(25)
      setAudit((data || []) as AuditRow[])
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  async function runAction(user: UserRow, action: 'reset' | 'deactivate' | 'reactivate') {
    if (!tenantId) return
    const question =
      action === 'reset'
        ? `Generate a new temporary password for ${user.email} and email it to them?`
        : action === 'deactivate'
          ? `Deactivate ${user.email}? They will not be able to sign in until you reactivate them.`
          : `Reactivate ${user.email}?`
    if (!window.confirm(question)) return

    setBusyUserId(user.id)
    setRowNotice('')
    setHandoverPassword(null)
    setListError('')

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const response = await fetch('/api/admin/user-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session?.access_token}`,
        },
        body: JSON.stringify({ tenantId, userId: user.id, action }),
      })
      const result = await response.json()

      if (!response.ok) {
        if (result?.code === 'otp_required') setCodeVerified(false)
        setListError(result?.error || 'That action could not be completed.')
        return
      }

      if (action === 'reset') {
        if (result.emailSent) {
          setRowNotice(`A new temporary password was emailed to ${user.email}.`)
        } else {
          setHandoverPassword({ email: user.email, password: result.tempPassword })
          setRowNotice('The email could not be sent. Give this temporary password to the user yourself:')
        }
      } else {
        setRowNotice(action === 'deactivate' ? `${user.email} was deactivated.` : `${user.email} was reactivated.`)
      }

      await loadUsers(tenantId)
      await loadAudit(tenantId)
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'That action could not be completed.')
    } finally {
      setBusyUserId(null)
    }
  }

  function openEdit(user: UserRow) {
    setEditUser(user)
    setEditMobile(user.mobileNumber || '')
    setEditChangeAddress(false)
    setEditLocation(EMPTY_LOCATION)
    setEditError('')
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault()
    if (!editUser || !tenantId) return
    setEditError('')

    const mobile = editMobile.replace(/[\s-]/g, '')
    const mobileChanged = mobile !== (editUser.mobileNumber || '')

    if (mobileChanged && !/^(\+63|0)9\d{9}$/.test(mobile)) {
      setEditError('Enter a valid mobile number, like 09123456789.')
      return
    }
    if (editChangeAddress && (!editLocation.complete || !editLocation.purok)) {
      setEditError('Choose the region, province, city / municipality and barangay, and enter the Purok.')
      return
    }
    if (!mobileChanged && !editChangeAddress) {
      setEditError('Change the mobile number or the address first.')
      return
    }

    setEditSaving(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const response = await fetch('/api/admin/staff-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session?.access_token}`,
        },
        body: JSON.stringify({
          tenantId,
          userId: editUser.id,
          ...(mobileChanged ? { mobileNumber: mobile } : {}),
          ...(editChangeAddress
            ? {
                address: {
                  regionCode: editLocation.regionCode,
                  provinceCode: editLocation.provinceCode || null,
                  cityCode: editLocation.cityCode,
                  barangayCode: editLocation.barangayCode,
                  purok: editLocation.purok,
                },
              }
            : {}),
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        if (result?.code === 'otp_required') setCodeVerified(false)
        setEditError(result?.error || 'Unable to save.')
        return
      }
      setEditUser(null)
      setRowNotice('Profile updated.')
      await loadUsers(tenantId)
      await loadAudit(tenantId)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Unable to save.')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault()
    setInviteError('')
    setInviteSuccess('')

    const email = inviteEmail.trim().toLowerCase()

    if (!email) {
      setInviteError('Please enter an email address.')
      return
    }

    if (!tenantId) {
      setInviteError('No tenant selected.')
      return
    }

    const name = inviteName.trim()
    const mobile = inviteMobile.replace(/[\s-]/g, '')

    if (name.length < 3 || !name.includes(' ')) {
      setInviteError('Enter the full name (first and last name).')
      return
    }
    if (!/^(\+63|0)9\d{9}$/.test(mobile)) {
      setInviteError('Enter a valid mobile number, like 09123456789.')
      return
    }
    if (!inviteBirthday) {
      setInviteError('Enter the birthday.')
      return
    }
    if (!inviteGender) {
      setInviteError('Choose the gender.')
      return
    }
    if (!inviteLocation.complete) {
      setInviteError('Choose the region, province, city / municipality and barangay.')
      return
    }
    if (!inviteLocation.purok) {
      setInviteError('Enter the Purok.')
      return
    }
    if (!inviteRole) {
      setInviteError('Choose the role for this user.')
      return
    }

    setInviting(true)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token

      if (!accessToken) {
        setInviteError('Your session has expired. Please sign in again.')
        setInviting(false)
        return
      }

      const response = await fetch('/api/admin/invite-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email,
          role: inviteRole,
          tenantId,
          fullName: name,
          mobileNumber: mobile,
          birthday: inviteBirthday,
          gender: inviteGender,
          regionCode: inviteLocation.regionCode,
          provinceCode: inviteLocation.provinceCode || null,
          cityCode: inviteLocation.cityCode,
          barangayCode: inviteLocation.barangayCode,
          purok: inviteLocation.purok,
          address: inviteLocation.area,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        if (result?.code === 'otp_required') setCodeVerified(false)
        setInviteError(result?.error || 'Unable to invite this user.')
        setInviting(false)
        return
      }

      if (result.newAccount && !result.emailSent) {
        setInviteSuccess(
          `${email} was added, but the email could not be sent. Give them this temporary password yourself (it expires in 24 hours): ${result.tempPassword}`,
        )
      } else if (result.newAccount) {
        setInviteSuccess(`${email} was added. A temporary password was emailed to them.`)
      } else {
        setInviteSuccess(`${email} already had an account, so they were given access to this tenant.`)
      }
      setInviteEmail('')
      setInviteRole('')
      setInviteName('')
      setInviteMobile('')
      setInviteBirthday('')
      setInviteGender('')
      setInviteLocation(EMPTY_LOCATION)
      setLocationReset((n) => n + 1)
      await loadUsers(tenantId)
      await loadAudit(tenantId)
    } catch (err) {
      setInviteError(
        err instanceof Error ? err.message : 'Unexpected error sending invite.',
      )
    } finally {
      setInviting(false)
    }
  }

  if (checking) {
    return <PkcLoader label="Checking access" steps={['Verifying your role', 'Opening user management']} />
  }

  if (!authorized) {
    return null
  }

  return (
    <main className="usersPage">
      <StaffHeader current="users" roles={['admin']} />
      {!codeVerified && (
        <StaffVerification
          email={adminEmail}
          mode="users"
          onVerified={() => {
            setCodeVerified(true)
            if (tenantId) void loadUsers(tenantId)
          }}
          onCancel={() => router.replace('/clients')}
        />
      )}
      <StaffMotion targets={['.pageHeader', '.usersTable', '.tableRow']} />

      <section className="content">
        <div className="pageHeader">
          <div>
            <div className="eyebrow">
              <span className="liveDot" />
              PKC BIZOFT / ACCESS CONTROL
            </div>
            <h1>Users</h1>
            <p className="subtitle">
              Add staff and manage who has access to this tenant&apos;s data.
              Everyone you add is scoped to this tenant only.
            </p>
          </div>

          <div className="headerActions">
            <button
              type="button"
              className="inviteButton"
              onClick={() => {
                setShowInvite(true)
                setInviteError('')
                setInviteSuccess('')
              }}
            >
              + Add User
            </button>
          </div>
        </div>

        {listError && <div className="errorBanner" role="alert">{listError}</div>}
        {rowNotice && (
          <div className="noticeBanner" role="status">
            {rowNotice}
            {handoverPassword && (
              <strong className="handover">{handoverPassword.password}</strong>
            )}
          </div>
        )}

        <div className="usersTable">
          <div className="tableHead">
            <span>Email</span>
            <span>System role</span>
            <span>Tenant role</span>
            <span>Status</span>
            <span>Invited by</span>
            <span>Actions</span>
          </div>

          {loadingUsers ? (
            <div className="tableEmpty">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="tableEmpty">
              No users yet. Invite your first teammate above.
            </div>
          ) : (
            users.map((u) => (
              <div className="tableRow" key={u.id}>
                <span className="cellEmail">
                  {u.email}
                  {(u.employeeNumber || u.fullName) && (
                    <small className="cellSub">
                      {[u.employeeNumber, u.fullName].filter(Boolean).join(' · ')}
                    </small>
                  )}
                </span>
                <span className="cellRole">{u.profileRole || '—'}</span>
                <span className={`roleTag roleTag-${u.tenantRole}`}>
                  {u.tenantRole}
                </span>
                <span className={`statusTag statusTag-${u.status}`}>
                  <i />
                  {{ active: 'Active', pending: 'Pending', deactivated: 'Deactivated', expired: 'Password expired' }[u.status]}
                </span>
                <span className="cellInvitedBy">
                  {u.invitedByEmail || '—'}
                </span>
                <span className="rowActions">
                  <button
                    type="button"
                    className="miniButton"
                    onClick={() => openEdit(u)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="miniButton"
                    disabled={busyUserId === u.id}
                    onClick={() => void runAction(u, 'reset')}
                  >
                    {u.mustChangePassword ? 'Resend' : 'Reset'}
                  </button>
                  {u.status === 'deactivated' ? (
                    <button
                      type="button"
                      className="miniButton"
                      disabled={busyUserId === u.id}
                      onClick={() => void runAction(u, 'reactivate')}
                    >
                      Reactivate
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="miniButton danger"
                      disabled={busyUserId === u.id}
                      onClick={() => void runAction(u, 'deactivate')}
                    >
                      Deactivate
                    </button>
                  )}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="auditPanel">
          <button
            type="button"
            className="auditToggle"
            onClick={() => {
              setShowAudit((v) => !v)
              if (!showAudit && tenantId) void loadAudit(tenantId)
            }}
          >
            {showAudit ? '▾' : '▸'} Recent user activity
          </button>
          {showAudit &&
            (audit.length === 0 ? (
              <div className="tableEmpty">No user changes recorded yet.</div>
            ) : (
              <ul className="auditList">
                {audit.map((a) => (
                  <li key={a.id}>
                    <span className="auditWhen">{new Date(a.created_at).toLocaleString('en-PH')}</span>
                    <span>
                      <b>{AUDIT_LABEL[a.action] || a.action}</b> {a.target_email || ''}
                      {a.detail ? ` (${a.detail})` : ''} <em>by {a.actor_email || 'unknown'}</em>
                    </span>
                  </li>
                ))}
              </ul>
            ))}
        </div>
      </section>

      {editUser && (
        <div className="modalBackdrop" role="presentation" onClick={() => setEditUser(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit staff profile"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="modalClose" aria-label="Close" onClick={() => setEditUser(null)}>
              ×
            </button>
            <h2>Edit profile</h2>
            <p className="modalSubtitle">
              {editUser.email}
              {editUser.employeeNumber ? ` · ${editUser.employeeNumber}` : ''}. Only the mobile number and
              address can be changed here.
            </p>

            <form onSubmit={saveEdit} className="inviteForm">
              <label>
                <span>Mobile number</span>
                <input
                  type="tel"
                  value={editMobile}
                  onChange={(e) => setEditMobile(e.target.value)}
                  placeholder="09123456789"
                  autoComplete="off"
                />
              </label>

              <div className="rolePreview">
                <b>Current address:</b> {editUser.addressText || 'Not set'}
              </div>

              {editChangeAddress ? (
                <>
                  <LocationFields onChange={setEditLocation} />
                  <button type="button" className="miniButton" onClick={() => setEditChangeAddress(false)}>
                    Keep the current address
                  </button>
                </>
              ) : (
                <button type="button" className="miniButton" onClick={() => setEditChangeAddress(true)}>
                  Change address
                </button>
              )}

              {editError && <div className="formError">{editError}</div>}

              <button type="submit" className="submitButton" disabled={editSaving}>
                {editSaving ? 'Saving...' : 'Save changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showInvite && (
        <div
          className="modalBackdrop"
          role="presentation"
          onClick={() => setShowInvite(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Invite user"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="modalClose"
              onClick={() => setShowInvite(false)}
              aria-label="Close"
            >
              ×
            </button>

            <h2>Add a user</h2>
            <p className="modalSubtitle">
              Every field is required. A strong temporary password is generated
              and emailed to them from PKC BIZOFT. It expires in 24 hours, and
              they must choose their own password the first time they sign in.
              Their account has access to this tenant only.
            </p>

            <form onSubmit={handleInvite} className="inviteForm">
              <label>
                <span>Full name</span>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Juan Dela Cruz"
                  autoComplete="off"
                  required
                />
              </label>

              <label>
                <span>Mobile number</span>
                <input
                  type="tel"
                  value={inviteMobile}
                  onChange={(e) => setInviteMobile(e.target.value)}
                  placeholder="09123456789"
                  autoComplete="off"
                  required
                />
              </label>

              <label>
                <span>Birthday</span>
                <input
                  type="date"
                  value={inviteBirthday}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setInviteBirthday(e.target.value)}
                  required
                />
              </label>

              <label>
                <span>Gender</span>
                <select
                  value={inviteGender}
                  onChange={(e) => setInviteGender(e.target.value)}
                  required
                >
                  <option value="" disabled>Select gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </label>

              <LocationFields key={locationReset} onChange={setInviteLocation} />

              <label>
                <span>Email address</span>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                />
              </label>

              <label>
                <span>Role</span>
                <select
                  value={inviteRole}
                  onChange={(e) =>
                    setInviteRole(e.target.value as TenantRole)
                  }
                  required
                >
                  <option value="" disabled>Select role</option>
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {inviteRole && (
                <div className="rolePreview" role="note">
                  <b>{ROLE_OPTIONS.find((o) => o.value === inviteRole)?.label} can:</b>{' '}
                  {ROLE_ACCESS[inviteRole]}
                </div>
              )}

              {inviteError && (
                <div className="formError">{inviteError}</div>
              )}
              {inviteSuccess && (
                <div className="formSuccess">{inviteSuccess}</div>
              )}

              <button
                type="submit"
                className="submitButton"
                disabled={inviting}
              >
                {inviting ? 'Adding user...' : 'Add user'}
              </button>
            </form>
          </div>
        </div>
      )}

      <style jsx>{styles}</style>
    </main>
  )
}

const styles = `
  .usersPage {
    min-height: 100vh;
    background: #05090d;
    color: #eef7ff;
    font-family: var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system,
      BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .topBar {
    height: 76px;
    padding: 0 34px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    background: rgba(5, 9, 13, 0.94);
    backdrop-filter: blur(14px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 20;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 13px;
    color: #fff;
    text-decoration: none;
  }

  .brandLogo {
    width: 38px;
    height: 38px;
    object-fit: contain;
    display: block;
    flex: 0 0 auto;
  }

  .brandText {
    font-size: 19px;
    font-weight: 400;
    letter-spacing: -0.03em;
  }

  .brandText strong {
    color: #1599ff;
    font-weight: 800;
  }

  .topActions {
    display: flex;
    align-items: center;
    gap: 18px;
  }

  .topNav {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    border-radius: 11px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
  }

  .topNavLink {
    padding: 8px 16px;
    border-radius: 8px;
    color: #9bb0c0;
    text-decoration: none;
    font-size: 13px;
    font-weight: 600;
    transition: 0.2s ease;
  }

  .topNavLink:hover {
    color: white;
    background: rgba(255,255,255,0.04);
  }

  .topNavLink.active {
    color: #eef7ff;
    background: rgba(21,153,255,0.14);
    box-shadow: inset 0 0 0 1px rgba(21,153,255,0.3);
  }

  .sessionPill {
    border: 1px solid rgba(48, 224, 139, 0.2);
    background: rgba(48, 224, 139, 0.06);
    color: #76eeb0;
    padding: 8px 12px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
  }

  .sessionDot, .liveDot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #38e08b;
    box-shadow: 0 0 12px rgba(56,224,139,0.8);
  }

  .content {
    width: min(1200px, calc(100% - 48px));
    margin: 0 auto;
    padding: 44px 0 60px;
  }

  .pageHeader {
    display: flex;
    justify-content: space-between;
    gap: 30px;
    align-items: flex-end;
    margin-bottom: 32px;
  }

  .eyebrow {
    display: flex;
    align-items: center;
    gap: 9px;
    color: #1599ff;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.16em;
    margin-bottom: 12px;
  }

  h1 {
    margin: 0;
    font-size: clamp(34px, 5vw, 52px);
    line-height: 0.98;
    letter-spacing: -0.05em;
    font-weight: 750;
  }

  .subtitle {
    margin: 15px 0 0;
    color: #8ca1b1;
    font-size: 14px;
    max-width: 560px;
    line-height: 1.6;
  }

  .inviteButton {
    height: 44px;
    padding: 0 20px;
    border-radius: 11px;
    border: 1px solid rgba(21,153,255,0.4);
    background: #1599ff;
    color: #04101c;
    font-weight: 800;
    font-size: 13px;
    cursor: pointer;
    transition: 0.2s;
  }

  .inviteButton:hover {
    background: #3caeff;
    transform: translateY(-1px);
  }

  .errorBanner {
    margin-bottom: 20px;
    padding: 12px 16px;
    border-radius: 10px;
    border: 1px solid rgba(255,107,107,0.3);
    background: rgba(255,107,107,0.08);
    color: #ff9b9b;
    font-size: 13px;
  }

  .usersTable {
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px;
    overflow: hidden;
    background: rgba(255,255,255,0.02);
  }

  .tableHead, .tableRow {
    display: grid;
    grid-template-columns: 1.6fr 0.7fr 0.8fr 1fr 1.2fr 1.3fr;
    gap: 12px;
    align-items: center;
    padding: 14px 20px;
  }

  .tableHead {
    color: #6f8497;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }

  .tableRow {
    border-bottom: 1px solid rgba(255,255,255,0.04);
    font-size: 14px;
  }

  .tableRow:last-child {
    border-bottom: 0;
  }

  .tableRow:hover {
    background: rgba(255,255,255,0.02);
  }

  .cellEmail {
    color: #eef7ff;
    font-weight: 600;
  }

  .cellSub {
    display: block;
    margin-top: 2px;
    color: #6c8195;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .cellRole {
    color: #8ca1b1;
  }

  .roleTag {
    justify-self: start;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: capitalize;
    width: fit-content;
  }

  .roleTag-admin {
    color: #ffb85c;
    background: rgba(255,184,92,0.1);
    border: 1px solid rgba(255,184,92,0.25);
  }

  .roleTag-technician {
    color: #1599ff;
    background: rgba(21,153,255,0.1);
    border: 1px solid rgba(21,153,255,0.25);
  }

  .roleTag-customer {
    color: #76eeb0;
    background: rgba(48,224,139,0.08);
    border: 1px solid rgba(48,224,139,0.22);
  }

  .roleTag-inventory {
    color: #ffcf7a;
    background: rgba(255,180,60,0.1);
    border: 1px solid rgba(255,180,60,0.28);
  }

  .roleTag-accounting {
    color: #c9a9ff;
    background: rgba(160,120,255,0.1);
    border: 1px solid rgba(160,120,255,0.28);
  }

  .statusTag {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px 4px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
  }

  .statusTag i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    display: inline-block;
  }

  .statusTag-active {
    color: #76eeb0;
    background: rgba(48,224,139,0.08);
  }

  .statusTag-active i {
    background: #38e08b;
    box-shadow: 0 0 8px rgba(56,224,139,0.8);
  }

  .statusTag-pending {
    color: #ffc96b;
    background: rgba(255,201,107,0.08);
  }

  .statusTag-pending i {
    background: #ffb85c;
    box-shadow: 0 0 8px rgba(255,184,92,0.6);
  }

  .rowActions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .miniButton {
    border: 1px solid rgba(255,255,255,0.14);
    background: rgba(255,255,255,0.04);
    color: #cfe3f1;
    font-size: 11px;
    font-weight: 700;
    padding: 5px 10px;
    border-radius: 8px;
    cursor: pointer;
  }

  .miniButton:hover:not(:disabled) {
    border-color: #22d3ee;
    color: #22d3ee;
  }

  .miniButton.danger:hover:not(:disabled) {
    border-color: #ff6b6b;
    color: #ff8a8a;
  }

  .miniButton:disabled {
    opacity: 0.5;
    cursor: wait;
  }

  .statusTag-deactivated, .statusTag-expired {
    color: #ff9a9a;
    background: rgba(255,107,107,0.08);
  }

  .statusTag-deactivated i, .statusTag-expired i {
    background: #ff6b6b;
  }

  .noticeBanner {
    margin: 0 0 14px;
    padding: 12px 16px;
    border-radius: 12px;
    border: 1px solid rgba(34,211,238,0.3);
    background: rgba(34,211,238,0.07);
    color: #bfefff;
    font-size: 13px;
  }

  .handover {
    display: block;
    margin-top: 6px;
    font-family: Consolas, monospace;
    font-size: 16px;
    color: #22d3ee;
    user-select: all;
  }

  .rolePreview {
    border: 1px solid rgba(34,211,238,0.25);
    background: rgba(34,211,238,0.06);
    color: #bfefff;
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 12px;
    line-height: 1.5;
  }

  .auditPanel {
    margin-top: 18px;
  }

  .auditToggle {
    background: none;
    border: 0;
    color: #8ca1b1;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    padding: 6px 2px;
  }

  .auditList {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }

  .auditList li {
    display: grid;
    grid-template-columns: 170px 1fr;
    gap: 10px;
    font-size: 12px;
    color: #cfe3f1;
    padding: 8px 12px;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px;
  }

  .auditWhen {
    color: #6c8195;
  }

  .auditList em {
    color: #6c8195;
  }

  .cellInvitedBy {
    color: #6c8195;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tableEmpty {
    padding: 40px 20px;
    text-align: center;
    color: #6c8195;
    font-size: 13px;
  }

  .modalBackdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(0,4,8,0.7);
    backdrop-filter: blur(6px);
  }

  .modal {
    position: relative;
    width: min(440px, 100%);
    padding: 30px;
    max-height: calc(100vh - 40px);
    overflow-y: auto;
    overscroll-behavior: contain;
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.1);
    background: #0a1017;
    box-shadow: 0 30px 80px rgba(0,0,0,0.5);
  }

  .modalClose {
    position: absolute;
    top: 14px;
    right: 14px;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.02);
    color: #9bb0c0;
    font-size: 18px;
    cursor: pointer;
  }

  .modalClose:hover {
    color: white;
  }

  .modal h2 {
    margin: 0 0 8px;
    font-size: 22px;
    letter-spacing: -0.02em;
  }

  .modalSubtitle {
    margin: 0 0 22px;
    color: #8ca1b1;
    font-size: 13px;
    line-height: 1.6;
  }

  .inviteForm {
    display: grid;
    gap: 16px;
  }

  .inviteForm label {
    display: grid;
    gap: 7px;
    font-size: 12px;
    font-weight: 700;
    color: #9bb0c0;
  }

  .inviteForm input,
  .inviteForm select {
    height: 42px;
    padding: 0 12px;
    border-radius: 9px;
    border: 1px solid rgba(255,255,255,0.1);
    background: #05090d;
    color: #eef7ff;
    font: inherit;
    font-size: 14px;
  }

  .inviteForm input:focus,
  .inviteForm select:focus {
    outline: none;
    border-color: rgba(21,153,255,0.5);
  }

  .formError {
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid rgba(255,107,107,0.3);
    background: rgba(255,107,107,0.08);
    color: #ff9b9b;
    font-size: 12px;
  }

  .formSuccess {
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid rgba(48,224,139,0.3);
    background: rgba(48,224,139,0.08);
    color: #76eeb0;
    font-size: 12px;
  }

  .submitButton {
    height: 44px;
    border-radius: 10px;
    border: 1px solid rgba(21,153,255,0.4);
    background: #1599ff;
    color: #04101c;
    font-weight: 800;
    font-size: 14px;
    cursor: pointer;
  }

  .submitButton:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (max-width: 900px) {
    .topNav { display: none; }
    .content { width: calc(100% - 28px); }
    .pageHeader { flex-direction: column; align-items: flex-start; }
    .tableHead { display: none; }
    .tableRow {
      grid-template-columns: 1fr;
      gap: 4px;
      padding: 14px 16px;
    }
  }
`