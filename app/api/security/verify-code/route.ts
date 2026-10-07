import { NextRequest, NextResponse } from 'next/server'
import { getCaller, hashCode, parsePurpose } from '@/lib/serverSecurity'

const MAX_ATTEMPTS = 5

// Checks the emailed code and marks this session as email-verified.
export async function POST(request: NextRequest) {
  const caller = await getCaller(request)
  if (!caller) return NextResponse.json({ error: 'Your session is invalid or expired.' }, { status: 401 })
  if (!caller.sessionId) return NextResponse.json({ error: 'Unable to identify this session.' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const purpose = parsePurpose(body.purpose)
  const code = typeof body.code === 'string' ? body.code.replace(/\s+/g, '') : ''
  if (!purpose || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Enter the 6-digit code from your email.' }, { status: 400 })
  }

  const { data: record } = await caller.admin
    .from('staff_email_codes')
    .select('code_hash, expires_at, attempts')
    .eq('user_id', caller.user.id)
    .eq('purpose', purpose)
    .maybeSingle()

  if (!record || new Date(record.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'That code has expired. Request a new one.' }, { status: 400 })
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'Too many wrong attempts. Request a new code.' }, { status: 429 })
  }

  if (hashCode(caller.user.id, code) !== record.code_hash) {
    await caller.admin
      .from('staff_email_codes')
      .update({ attempts: record.attempts + 1 })
      .eq('user_id', caller.user.id)
      .eq('purpose', purpose)
    return NextResponse.json({ error: 'That code is wrong.' }, { status: 401 })
  }

  // One use only.
  await caller.admin.from('staff_email_codes').delete().eq('user_id', caller.user.id).eq('purpose', purpose)

  const { error } = await caller.admin.from('staff_email_verified').upsert({
    session_id: caller.sessionId,
    user_id: caller.user.id,
    purpose,
    verified_at: new Date().toISOString(),
  })
  if (error) return NextResponse.json({ error: 'Unable to complete verification.' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
