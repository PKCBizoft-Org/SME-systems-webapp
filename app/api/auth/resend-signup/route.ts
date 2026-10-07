import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/serverSecurity'
import { findUserByEmail, issueSignupCode } from '@/lib/signupCodes'

// Sends a new sign-up code to an account that has not verified its email yet.
export async function POST(request: NextRequest) {
  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Server configuration is missing.' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const user = await findUserByEmail(admin, email)

  // Same answer whether or not the account exists, so this cannot be used to probe emails.
  if (!user || user.email_confirmed_at) return NextResponse.json({ ok: true })

  const issued = await issueSignupCode(admin, user.id, email)
  if (!issued.ok) return NextResponse.json({ error: issued.error }, { status: issued.status })

  return NextResponse.json({ ok: true })
}
