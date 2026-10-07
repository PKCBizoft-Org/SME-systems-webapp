import { NextRequest, NextResponse } from 'next/server'
import { adminClient, hashCode } from '@/lib/serverSecurity'
import { findUserByEmail } from '@/lib/signupCodes'

const MAX_ATTEMPTS = 5

// Checks the emailed reset code and sets the new password.
export async function POST(request: NextRequest) {
  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Server configuration is missing.' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const code = typeof body.code === 'string' ? body.code.replace(/\s+/g, '') : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!email || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Enter the 6-digit code from your email.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Your new password must be at least 8 characters.' }, { status: 400 })
  }

  const user = await findUserByEmail(admin, email)
  if (!user) return NextResponse.json({ error: 'That code is wrong or has expired.' }, { status: 400 })

  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profile || (profile.role !== 'customer' && profile.role !== 'technician')) {
    return NextResponse.json({ error: 'That code is wrong or has expired.' }, { status: 400 })
  }

  const { data: record } = await admin
    .from('signup_codes')
    .select('code_hash, expires_at, attempts')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!record || new Date(record.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'That code has expired. Request a new one.' }, { status: 400 })
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'Too many wrong attempts. Request a new code.' }, { status: 429 })
  }

  if (hashCode(user.id, code) !== record.code_hash) {
    await admin.from('signup_codes').update({ attempts: record.attempts + 1 }).eq('user_id', user.id)
    return NextResponse.json({ error: 'That code is wrong.' }, { status: 401 })
  }

  const { error } = await admin.auth.admin.updateUserById(user.id, { password })
  if (error) return NextResponse.json({ error: 'Unable to set the new password.' }, { status: 500 })

  await admin.from('signup_codes').delete().eq('user_id', user.id)
  return NextResponse.json({ ok: true })
}
