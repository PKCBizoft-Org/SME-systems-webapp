import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient, emailVerifiedRecently, getCaller } from '@/lib/serverSecurity'
import { smtpConfigured } from '@/lib/mailer'
import { sendMail } from '@/lib/notifyEmail'

export const TEMP_PASSWORD_HOURS = 24

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  technician: 'Technician',
  accounting: 'Accounting',
  inventory: 'Inventory',
  customer: 'Customer',
}

export function roleLabel(role: string) {
  return ROLE_LABEL[role] || role
}

// 14 characters from an alphabet without look-alikes (no 0/O, 1/l/I), with at
// least one lowercase, uppercase, digit and symbol. Uses crypto.randomInt.
export function generateTempPassword() {
  const lower = 'abcdefghijkmnopqrstuvwxyz'
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const symbols = '!@#$%&*?'
  const all = lower + upper + digits + symbols
  const pick = (set: string) => set[randomInt(set.length)]

  const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)]
  while (chars.length < 14) chars.push(pick(all))

  // Fisher-Yates shuffle with crypto randomness.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

// gmail ignores dots and "+tag", so a.b+x@gmail.com and ab@gmail.com are the
// same mailbox. Used to catch look-alike duplicates.
export function canonicalEmail(email: string) {
  const [localRaw, domainRaw] = email.trim().toLowerCase().split('@')
  const domain = domainRaw === 'googlemail.com' ? 'gmail.com' : domainRaw
  let local = localRaw.split('+')[0]
  if (domain === 'gmail.com') local = local.replace(/\./g, '')
  return `${local}@${domain}`
}

export type AdminContext = {
  admin: SupabaseClient
  actorId: string
  actorEmail: string
  tenantId: string
}

// Shared checks for every user-management endpoint: valid session, emailed
// code + secondary password done recently, and the caller is an admin of the
// tenant. Returns either the context or a ready-made error response.
export async function requireTenantAdmin(
  request: NextRequest,
  tenantId: string,
): Promise<AdminContext | NextResponse> {
  const caller = await getCaller(request)
  if (!caller) {
    return NextResponse.json({ error: 'Your session is invalid or expired.' }, { status: 401 })
  }

  if (!(await emailVerifiedRecently(caller, 'users', 10 * 60))) {
    return NextResponse.json(
      { error: 'Verification is required. Enter your secondary password.', code: 'otp_required' },
      { status: 403 },
    )
  }

  if (!tenantId) {
    return NextResponse.json({ error: 'A tenant is required.' }, { status: 400 })
  }

  const admin = adminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration is missing.' }, { status: 500 })
  }

  const { data: membership } = await admin
    .from('tenant_users')
    .select('role')
    .eq('user_id', caller.user.id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!membership || membership.role !== 'admin') {
    return NextResponse.json({ error: 'Only tenant admins can manage users.' }, { status: 403 })
  }

  return { admin, actorId: caller.user.id, actorEmail: caller.user.email || '', tenantId }
}

export async function logUserAudit(
  ctx: AdminContext,
  entry: { targetUserId?: string | null; targetEmail?: string | null; action: string; detail?: string },
) {
  const { error } = await ctx.admin.from('user_audit').insert({
    tenant_id: ctx.tenantId,
    actor_id: ctx.actorId,
    actor_email: ctx.actorEmail,
    target_user_id: entry.targetUserId ?? null,
    target_email: entry.targetEmail ?? null,
    action: entry.action,
    detail: entry.detail ?? null,
  })
  if (error) console.error('user_audit insert failed:', error.message)
}

export function tempPasswordMetadata() {
  return {
    must_change_password: true,
    temp_expires_at: new Date(Date.now() + TEMP_PASSWORD_HOURS * 3600 * 1000).toISOString(),
  }
}

function esc(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function shell(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#04121a;font-family:Segoe UI,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#04121a;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#0a2230;border:1px solid #17475c;border-radius:16px">
        <tr><td style="padding:24px">
          <div style="color:#22d3ee;font-size:11px;letter-spacing:2px;font-weight:700">PKC BIZOFT</div>
          <h1 style="color:#eaf7ff;font-size:20px;margin:8px 0 14px">${esc(title)}</h1>
          ${body}
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`
}

export async function sendWelcomeEmail(
  to: string,
  d: { name: string; role: string; password: string; loginUrl: string; hours: number; reissued?: boolean },
) {
  const title = d.reissued ? 'Your temporary password was reset' : 'Your PKC BIZOFT staff account is ready'
  const html = shell(
    title,
    `<p style="color:#8fa8b8;font-size:14px;line-height:1.6;margin:0 0 14px">Hi ${esc(d.name)}, you ${
      d.reissued ? 'have a new temporary password' : `were added as <b style="color:#eaf7ff">${esc(roleLabel(d.role))}</b>`
    }. Sign in with these details:</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#061a25;border:1px solid #17475c;border-radius:12px">
       <tr><td style="padding:12px 14px;color:#8fa8b8;font-size:12px">EMAIL</td><td style="padding:12px 14px;color:#eaf7ff;font-size:14px;text-align:right">${esc(to)}</td></tr>
       <tr><td style="padding:12px 14px;color:#8fa8b8;font-size:12px;border-top:1px solid #17475c">TEMPORARY PASSWORD</td><td style="padding:12px 14px;color:#22d3ee;font-size:16px;font-weight:700;font-family:Consolas,monospace;text-align:right;border-top:1px solid #17475c">${esc(d.password)}</td></tr>
     </table>
     <p style="color:#8fa8b8;font-size:13px;line-height:1.6;margin:14px 0">You will be asked to choose your own password the first time you sign in. This temporary password expires in ${d.hours} hours.</p>
     <a href="${esc(d.loginUrl)}" style="display:inline-block;background:#22d3ee;color:#00141b;font-weight:800;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:14px">Sign in</a>
     <p style="color:#5f758a;font-size:11px;margin:18px 0 0">If you did not expect this email, ignore it and tell your administrator.</p>`,
  )
  await sendMail({
    to,
    subject: d.reissued ? 'Your PKC BIZOFT temporary password' : 'Your PKC BIZOFT staff account',
    text: `Hi ${d.name},\n\n${d.reissued ? 'Your temporary password was reset.' : `You were added to PKC BIZOFT as ${roleLabel(d.role)}.`}\n\nEmail: ${to}\nTemporary password: ${d.password}\n\nYou must choose your own password at first sign-in. This temporary password expires in ${d.hours} hours.\nSign in: ${d.loginUrl}\n`,
    html,
  })
}

// Tells tenant admins (the acting admin included) about additions and role
// changes. Never throws: a failed notice must not undo the change.
export async function sendAdminNotice(ctx: AdminContext, subject: string, lines: string[]) {
  if (!smtpConfigured()) return
  try {
    const { data: admins } = await ctx.admin
      .from('tenant_users')
      .select('user_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('role', 'admin')
    const ids = (admins || []).map((a) => a.user_id as string)
    if (ids.length === 0) return

    // The login account's email is the source of truth: profiles.email can be
    // stale (e.g. after the address was changed in the Supabase dashboard) and
    // a notice sent there bounces.
    const found = await Promise.all(ids.map((id) => ctx.admin.auth.admin.getUserById(id)))
    const recipients = [
      ...new Set(found.map((r) => r.data.user?.email?.toLowerCase()).filter((e): e is string => Boolean(e))),
    ]

    const html = shell(
      subject,
      `<p style="color:#8fa8b8;font-size:14px;line-height:1.7;margin:0">${lines.map(esc).join('<br/>')}</p>
       <p style="color:#5f758a;font-size:11px;margin:18px 0 0">Done by ${esc(ctx.actorEmail)}. If this was not you or someone you trust, change your password now.</p>`,
    )
    // One bad address must not stop the others.
    await Promise.allSettled(
      recipients.map((to) =>
        sendMail({ to, subject: `PKC BIZOFT: ${subject}`, text: `${lines.join('\n')}\n\nDone by ${ctx.actorEmail}.`, html }),
      ),
    )
  } catch (error) {
    console.error('Admin notice email failed:', error)
  }
}
