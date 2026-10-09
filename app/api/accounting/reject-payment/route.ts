import { NextRequest, NextResponse } from 'next/server'
import { getCaller, hasTenantRole, isSessionVerified } from '@/lib/serverSecurity'
import { smtpConfigured } from '@/lib/mailer'
import { sendRejectedEmail } from '@/lib/notifyEmail'

const REJECT_REASONS = ['Wrong amount', 'Reference not found', 'Blurry receipt', 'Reference already used', 'Other']

export async function POST(request: NextRequest) {
  const caller = await getCaller(request)
  if (!caller) return NextResponse.json({ error: 'Your session is invalid or expired.' }, { status: 401 })
  if (!(await isSessionVerified(caller))) {
    return NextResponse.json({ error: 'Finish signing in (email code and secondary password) first.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const submissionId = typeof body.submissionId === 'string' ? body.submissionId : ''
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : ''

  if (!submissionId) return NextResponse.json({ error: 'Missing payment.' }, { status: 400 })
  if (!REJECT_REASONS.includes(reason)) return NextResponse.json({ error: 'Choose a reason for rejecting.' }, { status: 400 })
  if (reason === 'Other' && !note) return NextResponse.json({ error: 'Add a short note explaining the reason.' }, { status: 400 })

  const { data: sub } = await caller.admin.from('payment_submissions').select('id, tenant_id').eq('id', submissionId).maybeSingle()
  if (!sub) return NextResponse.json({ error: 'Payment submission not found.' }, { status: 404 })

  if (!(await hasTenantRole(caller, sub.tenant_id, ['admin', 'accounting']))) {
    return NextResponse.json({ error: 'Only accounting or admin staff can reject payments.' }, { status: 403 })
  }

  const { data, error } = await caller.admin.rpc('reject_payment_submission_as', {
    p_submission_id: submissionId,
    p_actor: caller.user.id,
    p_reason: reason,
    p_note: note || null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const result = data as {
    kind?: 'bill' | 'plan'
    amount?: number
    plan?: string
    bill_id?: string
    customer_name?: string
    customer_email?: string
    reference?: string
    reason?: string
    note?: string | null
  }

  let emailed = false
  if (result.customer_email && smtpConfigured()) {
    try {
      await sendRejectedEmail(result.customer_email, {
        name: result.customer_name,
        amount: result.amount,
        plan: result.plan,
        reference: result.reference,
        reason: result.reason || reason,
        note: result.note,
        kind: result.kind,
        billId: result.bill_id,
      })
      emailed = true
    } catch (err) {
      console.error('Rejection email failed:', err)
    }
  }

  return NextResponse.json({ ok: true, emailed, kind: result.kind })
}
