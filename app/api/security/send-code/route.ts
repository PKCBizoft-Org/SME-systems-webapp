import { NextRequest, NextResponse } from 'next/server'
import { getCaller, hashCode, isStaff, newCode, parsePurpose } from '@/lib/serverSecurity'
import { sendCodeEmail, smtpConfigured } from '@/lib/mailer'

const CODE_MINUTES = 10
const RESEND_SECONDS = 30

// Emails a 6-digit code to the signed-in staff member's own address.
export async function POST(request: NextRequest) {
  const caller = await getCaller(request)
  if (!caller) return NextResponse.json({ error: 'Your session is invalid or expired.' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const purpose = parsePurpose(body.purpose)
  if (!purpose) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })

  if (!caller.user.email) return NextResponse.json({ error: 'This account has no email address.' }, { status: 400 })
  if (!(await isStaff(caller))) return NextResponse.json({ error: 'Not a staff account.' }, { status: 403 })

  if (!smtpConfigured()) {
    return NextResponse.json(
      { error: 'Email is not set up on the server yet. Add the SMTP_* settings to the environment.' },
      { status: 500 },
    )
  }

  const { data: existing } = await caller.admin
    .from('staff_email_codes')
    .select('created_at')
    .eq('user_id', caller.user.id)
    .eq('purpose', purpose)
    .maybeSingle()

  if (existing && Date.now() - new Date(existing.created_at).getTime() < RESEND_SECONDS * 1000) {
    return NextResponse.json({ error: 'Please wait a few seconds before requesting another code.' }, { status: 429 })
  }

  const code = newCode()
  const { error } = await caller.admin.from('staff_email_codes').upsert({
    user_id: caller.user.id,
    purpose,
    code_hash: hashCode(caller.user.id, code),
    expires_at: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(),
    attempts: 0,
    created_at: new Date().toISOString(),
  })
  if (error) return NextResponse.json({ error: 'Unable to create a code.' }, { status: 500 })

  try {
    await sendCodeEmail(caller.user.email, code, purpose)
  } catch (err) {
    console.error('Send code email failed:', err)
    return NextResponse.json({ error: 'The email could not be sent. Check the SMTP settings.' }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
