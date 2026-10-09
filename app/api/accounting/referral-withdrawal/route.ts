import { NextRequest, NextResponse } from 'next/server'
import { getCaller, hasTenantRole, isSessionVerified } from '@/lib/serverSecurity'
import { smtpConfigured } from '@/lib/mailer'
import { sendWithdrawalEmail } from '@/lib/notifyEmail'

const ACTIONS = ['processing', 'paid', 'reject']

// Accounting works a customer's referral withdrawal: start it, mark it paid
// once the money was sent (with the transfer reference), or refuse it with a
// reason (the reward goes back into the customer's balance).
export async function POST(request: NextRequest) {
  const caller = await getCaller(request)
  if (!caller) return NextResponse.json({ error: 'Your session is invalid or expired.' }, { status: 401 })
  if (!(await isSessionVerified(caller))) {
    return NextResponse.json({ error: 'Finish signing in (email code and secondary password) first.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const withdrawalId = typeof body.withdrawalId === 'string' ? body.withdrawalId : ''
  const action = typeof body.action === 'string' ? body.action : ''
  const reference = typeof body.reference === 'string' ? body.reference.trim().slice(0, 80) : ''
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : ''

  if (!withdrawalId) return NextResponse.json({ error: 'Missing withdrawal.' }, { status: 400 })
  if (!ACTIONS.includes(action)) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  if (action === 'paid' && !reference) {
    return NextResponse.json({ error: 'Enter the reference number of the transfer you sent.' }, { status: 400 })
  }
  if (action === 'reject' && !note) {
    return NextResponse.json({ error: 'Tell the customer why the withdrawal was not approved.' }, { status: 400 })
  }

  const { data: withdrawal } = await caller.admin
    .from('referral_withdrawals')
    .select('id, referrer_client_id')
    .eq('id', withdrawalId)
    .maybeSingle()
  if (!withdrawal) return NextResponse.json({ error: 'Withdrawal not found.' }, { status: 404 })

  const { data: client } = await caller.admin
    .from('clients')
    .select('tenant_id')
    .eq('id', withdrawal.referrer_client_id)
    .maybeSingle()

  if (!(await hasTenantRole(caller, client?.tenant_id ?? null, ['admin', 'accounting']))) {
    return NextResponse.json({ error: 'Only accounting or admin staff can process withdrawals.' }, { status: 403 })
  }

  const { data, error } = await caller.admin.rpc('process_referral_withdrawal_as', {
    p_withdrawal_id: withdrawalId,
    p_actor: caller.user.id,
    p_action: action,
    p_reference: reference || null,
    p_note: note || null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const result = data as {
    gross?: number
    net?: number
    method?: string
    account_number?: string
    reference?: string
    reason?: string
    customer_name?: string
    customer_email?: string
  }

  // The customer is also told by push notification; email covers the final outcomes.
  let emailed = false
  if (action !== 'processing' && result.customer_email && smtpConfigured()) {
    try {
      await sendWithdrawalEmail(result.customer_email, {
        name: result.customer_name,
        paid: action === 'paid',
        net: result.net,
        gross: result.gross,
        method: result.method,
        accountNumber: result.account_number,
        reference: result.reference,
        reason: result.reason,
      })
      emailed = true
    } catch (err) {
      console.error('Withdrawal email failed:', err)
    }
  }

  return NextResponse.json({ ok: true, result, emailed })
}
