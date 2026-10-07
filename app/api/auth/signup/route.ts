import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/serverSecurity'
import { smtpConfigured } from '@/lib/mailer'
import { findUserByEmail, issueSignupCode } from '@/lib/signupCodes'

// Only these profile fields are accepted from the app.
const META_KEYS = [
  'full_name',
  'purok',
  'region_code',
  'province_code',
  'city_municipality_code',
  'barangay_code',
  'area',
  'referral_code',
  'mobile_number',
  'birthday',
  'gender',
]

// Customer sign-up from the mobile app. The account is created UNCONFIRMED and
// Supabase sends no email; our own 6-digit code (sent from Gmail) confirms it.
export async function POST(request: NextRequest) {
  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Server configuration is missing.' }, { status: 500 })
  if (!smtpConfigured()) return NextResponse.json({ error: 'Email is not set up on the server yet.' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Your password must be at least 8 characters.' }, { status: 400 })
  }

  const metadata: Record<string, unknown> = {}
  const incoming = body.metadata && typeof body.metadata === 'object' ? body.metadata : {}
  for (const key of META_KEYS) {
    if (incoming[key] !== undefined && incoming[key] !== null) metadata[key] = incoming[key]
  }

  let user = await findUserByEmail(admin, email)

  if (user?.email_confirmed_at) {
    return NextResponse.json({ error: 'An account with this email already exists. Please log in instead.' }, { status: 409 })
  }

  if (user) {
    // Started signing up before but never verified: take the newest details.
    const { error } = await admin.auth.admin.updateUserById(user.id, { password, user_metadata: metadata })
    if (error) return NextResponse.json({ error: 'Unable to update your sign-up details.' }, { status: 500 })
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: metadata,
    })
    if (error || !data.user) {
      return NextResponse.json({ error: error?.message || 'The account could not be created.' }, { status: 400 })
    }
    user = data.user
  }

  const issued = await issueSignupCode(admin, user.id, email)
  if (!issued.ok) return NextResponse.json({ error: issued.error }, { status: issued.status })

  return NextResponse.json({ ok: true, email })
}
