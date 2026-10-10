import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/serverSecurity'
import { smtpConfigured } from '@/lib/mailer'
import { findUserByEmail, issueSignupCode } from '@/lib/signupCodes'
import { RESETS_PER_MONTH, limitMessage, resetsUsed } from '@/lib/resetLimit'

// Emails a password-reset code to a customer or technician of the mobile app.
// It always answers "ok" so it cannot be used to find out which emails exist.
export async function POST(request: NextRequest) {
  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Server configuration is missing.' }, { status: 500 })
  if (!smtpConfigured()) return NextResponse.json({ error: 'Email is not set up on the server yet.' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const user = await findUserByEmail(admin, email)
  if (!user || !user.email_confirmed_at) return NextResponse.json({ ok: true })

  // Staff (admin/accounting/inventory) passwords are not reset from the app.
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profile || (profile.role !== 'customer' && profile.role !== 'technician')) {
    return NextResponse.json({ ok: true })
  }

  if (resetsUsed(user.app_metadata) >= RESETS_PER_MONTH) {
    return NextResponse.json({ error: limitMessage(), limit: RESETS_PER_MONTH }, { status: 429 })
  }

  const issued = await issueSignupCode(admin, user.id, email, 'reset')
  if (!issued.ok && issued.status !== 429) {
    return NextResponse.json({ error: issued.error }, { status: issued.status })
  }

  return NextResponse.json({ ok: true, limit: RESETS_PER_MONTH })
}
