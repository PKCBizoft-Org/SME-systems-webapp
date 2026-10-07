import type { SupabaseClient } from '@supabase/supabase-js'
import { hashCode, newCode } from '@/lib/serverSecurity'
import { sendCodeEmail } from '@/lib/mailer'

const CODE_MINUTES = 10
const RESEND_SECONDS = 30

export type IssueResult = { ok: true } | { ok: false; status: number; error: string }

// Creates a fresh signup code for the user and emails it. Throttled per user.
export async function issueSignupCode(admin: SupabaseClient, userId: string, email: string): Promise<IssueResult> {
  const { data: existing } = await admin.from('signup_codes').select('created_at').eq('user_id', userId).maybeSingle()

  if (existing && Date.now() - new Date(existing.created_at).getTime() < RESEND_SECONDS * 1000) {
    return { ok: false, status: 429, error: 'Please wait a few seconds before requesting another code.' }
  }

  const code = newCode()
  const { error } = await admin.from('signup_codes').upsert({
    user_id: userId,
    code_hash: hashCode(userId, code),
    expires_at: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(),
    attempts: 0,
    created_at: new Date().toISOString(),
  })
  if (error) return { ok: false, status: 500, error: 'Unable to create a verification code.' }

  try {
    await sendCodeEmail(email, code, 'signup')
  } catch (err) {
    console.error('Signup code email failed:', err)
    return { ok: false, status: 502, error: 'The verification email could not be sent. Please try again.' }
  }

  return { ok: true }
}

export async function findUserByEmail(admin: SupabaseClient, email: string) {
  // Small user base: scan pages until found.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error || !data) return null
    const hit = data.users.find((u) => u.email?.toLowerCase() === email)
    if (hit) return hit
    if (data.users.length < 200) return null
  }
  return null
}
