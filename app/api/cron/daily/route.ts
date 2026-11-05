import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/serverSecurity'
import { smtpConfigured } from '@/lib/mailer'
import { sendMail, sendReminderEmail } from '@/lib/notifyEmail'
import { buildMorningEmail, type MorningReport } from '@/lib/morningEmail'

// Called once a day by Vercel Cron (see vercel.json). Vercel sends
// "Authorization: Bearer <CRON_SECRET>" when the CRON_SECRET variable is set.
// Without that secret the endpoint refuses to run, so nobody can trigger it.
export const maxDuration = 60

const MAX_EMAILS_PER_RUN = 100

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 401 })
  }

  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Server configuration is missing.' }, { status: 500 })

  // Bills, overdue marks, disconnection flags, stale jobs.
  const { data: billing, error: billingError } = await admin.rpc('run_billing_automation')
  if (billingError) console.error('run_billing_automation failed:', billingError.message)

  // Fraud guard: recompute the payment signals (duplicate receipt / reference, amount
  // mismatch) so today's digest can report anything still open for review.
  const { data: signals, error: signalsError } = await admin.rpc('refresh_payment_signals')
  if (signalsError) console.error('refresh_payment_signals failed:', signalsError.message)

  let sent = 0
  let failed = 0

  if (smtpConfigured()) {
    const { data: reminders, error } = await admin.rpc('pending_billing_reminders')
    if (error) {
      console.error('pending_billing_reminders failed:', error.message)
    } else {
      const rows = (reminders || []) as {
        billing_id: string
        kind: string
        customer_name: string | null
        customer_email: string
        amount: number
        due_date: string | null
        bill_ref: string | null
      }[]

      for (const row of rows.slice(0, MAX_EMAILS_PER_RUN)) {
        try {
          await sendReminderEmail(row.customer_email, row.kind, {
            name: row.customer_name,
            amount: row.amount,
            due: row.due_date,
            ref: row.bill_ref,
          })
          await admin.from('billing_reminders_sent').insert({ billing_id: row.billing_id, kind: row.kind })
          sent += 1
        } catch (err) {
          failed += 1
          console.error('Reminder email failed:', err)
        }
      }
    }
  }

  // Temporary passwords nobody used within 24 hours stop working: block those
  // accounts until an admin re-issues a password (that also unblocks them).
  let expiredBlocked = 0
  try {
    const { data: page } = await admin.auth.admin.listUsers({ perPage: 200 })
    for (const user of page?.users || []) {
      const meta = user.app_metadata as { must_change_password?: boolean; temp_expires_at?: string } | undefined
      if (!meta?.must_change_password || !meta.temp_expires_at) continue
      if (new Date(meta.temp_expires_at) >= new Date()) continue
      const bannedUntil = (user as { banned_until?: string | null }).banned_until
      if (bannedUntil && new Date(bannedUntil) > new Date()) continue
      const { error } = await admin.auth.admin.updateUserById(user.id, { ban_duration: '876000h' })
      if (error) console.error('Blocking expired temporary password failed:', error.message)
      else expiredBlocked += 1
    }
  } catch (err) {
    console.error('Temporary password sweep failed:', err)
  }

  // Health check: tell an admin by email when something needs a human, so a
  // quiet failure (no bills, stuck payments) is never discovered by a customer.
  const problems: string[] = []
  if (billingError) problems.push(`The nightly billing run failed: ${billingError.message}`)
  if (failed > 0) problems.push(`${failed} reminder email(s) could not be sent.`)
  if (!smtpConfigured()) problems.push('Email (SMTP) is not configured, so customers get no reminders or receipts.')

  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString()
  const { count: stuck } = await admin
    .from('payment_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'Pending')
    .lt('created_at', twoDaysAgo)
  if (stuck) problems.push(`${stuck} customer payment(s) have waited over 2 days in Payment verification.`)

  const sig = signals as {
    open?: number; duplicate_reference?: number; duplicate_image?: number
    amount_mismatch?: number; ocr_mismatch?: number; alert?: number
  } | null
  if (sig && (sig.open || 0) > 0) {
    const parts: string[] = []
    if (sig.duplicate_image) parts.push(`${sig.duplicate_image} duplicate receipt image(s)`)
    if (sig.duplicate_reference) parts.push(`${sig.duplicate_reference} reused reference number(s)`)
    if (sig.amount_mismatch) parts.push(`${sig.amount_mismatch} amount mismatch(es)`)
    if (sig.ocr_mismatch) parts.push(`${sig.ocr_mismatch} receipt(s) that don't match their image`)
    problems.push(
      `Fraud guard: ${sig.open} pending payment(s) flagged${parts.length ? ' — ' + parts.join(', ') : ''}` +
        `${sig.alert ? ` (${sig.alert} already-approved match${sig.alert === 1 ? '' : 'es'} — urgent)` : ''}. ` +
        `Review in Payment verification.`,
    )
  }

  // Every morning: one designed email with yesterday's numbers and anything that
  // needs a human (the health-check problems above are listed first).
  let alerted = false
  let summarySent = false
  const alertTo = process.env.ALERT_EMAIL || process.env.SMTP_USER
  if (alertTo && smtpConfigured()) {
    const yesterday = new Date(Date.now() + 8 * 3_600_000 - 86_400_000).toISOString().slice(0, 10) // the job runs at 9am PH
    const { data: report, error: reportError } = await admin.rpc('morning_report', { p_day: yesterday })
    if (reportError) console.error('morning_report failed:', reportError.message)
    try {
      if (report) {
        const siteUrl = (process.env.PUBLIC_SITE_URL || 'https://bizoftph.com').replace(/\/$/, '')
        const email = buildMorningEmail(report as MorningReport, problems, siteUrl)
        await sendMail({ to: alertTo, ...email })
        summarySent = true
        alerted = problems.length > 0
      } else if (problems.length > 0) {
        // The summary could not be built; still send the problems.
        await sendMail({
          to: alertTo,
          subject: `PKC BIZOFT daily check: ${problems.length} thing${problems.length === 1 ? '' : 's'} need attention`,
          text: problems.map((p) => `- ${p}`).join('\n'),
          html: `<p>The daily check found:</p><ul>${problems.map((p) => `<li>${p.replace(/</g, '&lt;')}</li>`).join('')}</ul>`,
        })
        alerted = true
      }
    } catch (err) {
      console.error('Morning email failed:', err)
    }
  }

  return NextResponse.json({ ok: problems.length === 0, problems, alerted, summarySent, billing, remindersSent: sent, remindersFailed: failed, expiredBlocked })
}
