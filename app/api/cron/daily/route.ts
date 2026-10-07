import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/serverSecurity'
import { smtpConfigured } from '@/lib/mailer'
import { sendReminderEmail } from '@/lib/notifyEmail'

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

  return NextResponse.json({ ok: true, billing, remindersSent: sent, remindersFailed: failed })
}
