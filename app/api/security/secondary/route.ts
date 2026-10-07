import { NextRequest, NextResponse } from 'next/server'
import { checkSecondary, getCaller, emailVerifiedRecently, hashSecondary, isStaff } from '@/lib/serverSecurity'

const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 15

// Final sign-in step for staff. Needs a fresh email-code sign-in on this
// session, then either sets the secondary password (first time) or checks it.
export async function POST(request: NextRequest) {
  const caller = await getCaller(request)
  if (!caller) return NextResponse.json({ error: 'Your session is invalid or expired.' }, { status: 401 })
  if (!caller.sessionId) return NextResponse.json({ error: 'Unable to identify this session.' }, { status: 400 })

  if (!(await isStaff(caller))) return NextResponse.json({ ok: true })

  const body = await request.json().catch(() => ({}))
  // 'users' = an already signed-in admin re-entering the secondary password to
  // open user management; 'login' = the last step of signing in.
  const unlockUsers = body.purpose === 'users'

  if (unlockUsers) {
    const { data: signedIn } = await caller.admin
      .from('staff_verified_sessions')
      .select('session_id')
      .eq('session_id', caller.sessionId)
      .eq('user_id', caller.user.id)
      .maybeSingle()
    if (!signedIn) {
      return NextResponse.json({ error: 'Sign in again to continue.', code: 'otp_required' }, { status: 403 })
    }
  } else if (!(await emailVerifiedRecently(caller, 'login', 15 * 60))) {
    return NextResponse.json({ error: 'Enter the email verification code first.', code: 'otp_required' }, { status: 403 })
  }

  const password = typeof body.password === 'string' ? body.password : ''
  if (!password) return NextResponse.json({ error: 'Enter your secondary password.' }, { status: 400 })

  const { data: security } = await caller.admin
    .from('staff_security')
    .select('secondary_hash, failed_attempts, locked_until')
    .eq('user_id', caller.user.id)
    .maybeSingle()

  if (!security) {
    if (unlockUsers) {
      return NextResponse.json({ error: 'Sign in again to create your secondary password.' }, { status: 403 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'The secondary password must be at least 8 characters.' }, { status: 400 })
    }
    if (typeof body.confirm !== 'string' || body.confirm !== password) {
      return NextResponse.json({ error: 'The two secondary passwords do not match.' }, { status: 400 })
    }
    const { error } = await caller.admin
      .from('staff_security')
      .insert({ user_id: caller.user.id, secondary_hash: hashSecondary(password) })
    if (error) return NextResponse.json({ error: 'Unable to save the secondary password.' }, { status: 500 })
  } else {
    if (security.locked_until && new Date(security.locked_until).getTime() > Date.now()) {
      return NextResponse.json({ error: `Too many wrong attempts. Try again in ${LOCK_MINUTES} minutes.` }, { status: 429 })
    }

    if (!checkSecondary(password, security.secondary_hash)) {
      const attempts = (security.failed_attempts || 0) + 1
      const lock = attempts >= MAX_ATTEMPTS
      await caller.admin
        .from('staff_security')
        .update({
          failed_attempts: lock ? 0 : attempts,
          locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
        })
        .eq('user_id', caller.user.id)
      return NextResponse.json(
        { error: lock ? `Too many wrong attempts. Locked for ${LOCK_MINUTES} minutes.` : 'Incorrect secondary password.' },
        { status: 401 },
      )
    }

    await caller.admin
      .from('staff_security')
      .update({ failed_attempts: 0, locked_until: null })
      .eq('user_id', caller.user.id)
  }

  const { error: markError } = unlockUsers
    ? await caller.admin.from('staff_email_verified').upsert({
        session_id: caller.sessionId,
        user_id: caller.user.id,
        purpose: 'users',
        verified_at: new Date().toISOString(),
      })
    : await caller.admin
        .from('staff_verified_sessions')
        .upsert({ session_id: caller.sessionId, user_id: caller.user.id, verified_at: new Date().toISOString() })
  if (markError) return NextResponse.json({ error: 'Unable to complete verification.' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
