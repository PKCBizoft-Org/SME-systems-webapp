import { NextRequest, NextResponse } from 'next/server'
import { getCaller, hasTenantRole, isSessionVerified, verifySecondaryPassword } from '@/lib/serverSecurity'
import { smtpConfigured } from '@/lib/mailer'
import { sendApprovedEmail } from '@/lib/notifyEmail'

// Payments at or above this amount need the accountant's secondary password again.
const SECONDARY_THRESHOLD = Number(process.env.APPROVAL_SECONDARY_THRESHOLD || 1500)

export async function POST(request: NextRequest) {
  const caller = await getCaller(request)
  if (!caller) return NextResponse.json({ error: 'Your session is invalid or expired.' }, { status: 401 })
  if (!(await isSessionVerified(caller))) {
    return NextResponse.json({ error: 'Finish signing in (email code and secondary password) first.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const submissionId = typeof body.submissionId === 'string' ? body.submissionId : ''
  const secondary = typeof body.secondary === 'string' ? body.secondary : ''
  if (!submissionId) return NextResponse.json({ error: 'Missing payment.' }, { status: 400 })

  const { data: sub } = await caller.admin
    .from('payment_submissions')
    .select('id, tenant_id, amount_claimed, status')
    .eq('id', submissionId)
    .maybeSingle()
  if (!sub) return NextResponse.json({ error: 'Payment submission not found.' }, { status: 404 })

  if (!(await hasTenantRole(caller, sub.tenant_id, ['admin', 'accounting']))) {
    return NextResponse.json({ error: 'Only accounting or admin staff can verify payments.' }, { status: 403 })
  }

  if (Number(sub.amount_claimed) >= SECONDARY_THRESHOLD) {
    if (!secondary) {
      return NextResponse.json(
        { error: 'Enter your secondary password to approve this amount.', code: 'secondary_required', threshold: SECONDARY_THRESHOLD },
        { status: 428 },
      )
    }
    const check = await verifySecondaryPassword(caller, secondary)
    if (!check.ok) return NextResponse.json({ error: check.error, code: 'secondary_wrong' }, { status: check.status })
  }

  const { data, error } = await caller.admin.rpc('verify_payment_submission_as', {
    p_submission_id: submissionId,
    p_actor: caller.user.id,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const result = data as {
    kind?: 'bill' | 'plan'
    receipt_number?: string
    amount?: number
    plan?: string
    bill_id?: string
    remaining?: number
    new_customer?: boolean
    customer_name?: string
    customer_email?: string
    reference?: string
  }

  // The payment is already recorded; a failed email must never undo that.
  let emailed = false
  if (result.customer_email && smtpConfigured()) {
    try {
      await sendApprovedEmail(result.customer_email, {
        name: result.customer_name,
        amount: result.amount,
        plan: result.plan,
        reference: result.reference,
        receipt: result.receipt_number,
        newCustomer: Boolean(result.new_customer),
        kind: result.kind,
        billId: result.bill_id,
        remaining: result.remaining,
      })
      emailed = true
    } catch (err) {
      console.error('Approval email failed:', err)
    }
  }

  return NextResponse.json({ ok: true, result, emailed })
}
