import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/serverSecurity'
import { smtpConfigured } from '@/lib/mailer'
import { sendMail, sendReminderEmail } from '@/lib/notifyEmail'

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

  let alerted = false
  const alertTo = process.env.ALERT_EMAIL || process.env.SMTP_USER
  if (problems.length > 0 && alertTo && smtpConfigured()) {
    try {
      await sendMail({
        to: alertTo,
        subject: `PKC BIZOFT daily check: ${problems.length} thing${problems.length === 1 ? '' : 's'} need attention`,
        text: problems.map((p) => `- ${p}`).join('\n'),
        html: `<p>The daily check found:</p><ul>${problems.map((p) => `<li>${p.replace(/</g, '&lt;')}</li>`).join('')}</ul><p>Open the website's Accounting section to deal with them.</p>`,
      })
      alerted = true
    } catch (err) {
      console.error('Health alert email failed:', err)
    }
  }

  return NextResponse.json({ ok: problems.length === 0, problems, alerted, billing, remindersSent: sent, remindersFailed: failed, expiredBlocked })
}
