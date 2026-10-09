import { NextRequest, NextResponse } from 'next/server'
import { getCaller, hasTenantRole, isSessionVerified, verifySecondaryPassword } from '@/lib/serverSecurity'
import { smtpConfigured } from '@/lib/mailer'
import { sendApprovedEmail } from '@/lib/notifyEmail'

// Same rule as verifying a payment: large amounts need the secondary password again.
const SECONDARY_THRESHOLD = Number(process.env.APPROVAL_SECONDARY_THRESHOLD || 1500)

const METHODS = ['Cash', 'GCash', 'Bank Transfer']

// Accounting records a payment the customer made in person (cash at the office,
// a collector, a transfer sent straight to Accounting). Customers' own app
// payments go through Payment verification instead.
export async function POST(request: NextRequest) {
  const caller = await getCaller(request)
  if (!caller) return NextResponse.json({ error: 'Your session is invalid or expired.' }, { status: 401 })
  if (!(await isSessionVerified(caller))) {
    return NextResponse.json({ error: 'Finish signing in (email code and secondary password) first.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const billingId = typeof body.billingId === 'string' ? body.billingId : ''
  const amount = Number(body.amount)
  const method = typeof body.method === 'string' ? body.method : ''
  const reference = typeof body.reference === 'string' ? body.reference.trim().slice(0, 80) : ''
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : ''
  const paidOn = typeof body.paidOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.paidOn) ? body.paidOn : null
  const secondary = typeof body.secondary === 'string' ? body.secondary : ''

  if (!billingId) return NextResponse.json({ error: 'Choose the bill this payment is for.' }, { status: 400 })
  if (!METHODS.includes(method)) return NextResponse.json({ error: 'Choose how the customer paid.' }, { status: 400 })
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Enter the amount received.' }, { status: 400 })
  if (method !== 'Cash' && !reference) {
    return NextResponse.json({ error: 'Enter the transaction reference number.' }, { status: 400 })
  }

  const { data: bill } = await caller.admin.from('billing').select('id, tenant_id').eq('id', billingId).maybeSingle()
  if (!bill) return NextResponse.json({ error: 'Bill not found.' }, { status: 404 })

  if (!(await hasTenantRole(caller, bill.tenant_id, ['admin', 'accounting']))) {
    return NextResponse.json({ error: 'Only accounting or admin staff can record payments.' }, { status: 403 })
  }

  if (amount >= SECONDARY_THRESHOLD) {
    if (!secondary) {
      return NextResponse.json(
        { error: 'Enter your secondary password to record this amount.', code: 'secondary_required', threshold: SECONDARY_THRESHOLD },
        { status: 428 },
      )
    }
    const check = await verifySecondaryPassword(caller, secondary)
    if (!check.ok) return NextResponse.json({ error: check.error, code: 'secondary_wrong' }, { status: check.status })
  }

  const { data, error } = await caller.admin.rpc('record_payment_as', {
    p_actor: caller.user.id,
    p_billing_id: billingId,
    p_amount: Math.round(amount * 100) / 100,
    p_method: method,
    p_reference: reference || null,
    p_paid_on: paidOn,
    p_note: note || null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const result = data as {
    receipt_number?: string
    amount?: number
    bill_id?: string
    remaining?: number
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
        reference: result.reference,
        receipt: result.receipt_number,
        newCustomer: false,
        kind: 'bill',
        billId: result.bill_id,
        remaining: result.remaining,
        recorded: true,
      })
      emailed = true
    } catch (err) {
      console.error('Payment-recorded email failed:', err)
    }
  }

  return NextResponse.json({ ok: true, result, emailed })
}
