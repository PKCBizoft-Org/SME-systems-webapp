import { NextRequest, NextResponse } from 'next/server'
import { getCaller, hasTenantRole, isSessionVerified } from '@/lib/serverSecurity'

const TYPES = ['Installation Fee', 'Adjustment']

// Accounting adds a bill the nightly job does not create: the one-time installation fee, or an
// adjustment (extra materials, a visit fee). Monthly bills stay automatic. The database checks the
// rules again, this only turns the form into a call.
export async function POST(request: NextRequest) {
  const caller = await getCaller(request)
  if (!caller) return NextResponse.json({ error: 'Your session is invalid or expired.' }, { status: 401 })
  if (!(await isSessionVerified(caller))) {
    return NextResponse.json({ error: 'Finish signing in (email code and secondary password) first.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const clientId = typeof body.clientId === 'string' ? body.clientId : ''
  const billType = typeof body.billType === 'string' ? body.billType : ''
  const amount = Number(body.amount)
  const dueDate = typeof body.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate) ? body.dueDate : null
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : ''

  if (!clientId) return NextResponse.json({ error: 'Choose the customer.' }, { status: 400 })
  if (!TYPES.includes(billType)) {
    return NextResponse.json({ error: 'Choose Installation Fee or Adjustment.' }, { status: 400 })
  }
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Enter the amount.' }, { status: 400 })

  const { data: client } = await caller.admin.from('clients').select('id, tenant_id').eq('id', clientId).maybeSingle()
  if (!client) return NextResponse.json({ error: 'Customer not found.' }, { status: 404 })

  if (!(await hasTenantRole(caller, client.tenant_id, ['admin', 'accounting']))) {
    return NextResponse.json({ error: 'Only accounting or admin staff can add bills.' }, { status: 403 })
  }

  const { data, error } = await caller.admin.rpc('add_manual_bill_as', {
    p_actor: caller.user.id,
    p_client_id: clientId,
    p_bill_type: billType,
    p_amount: Math.round(amount * 100) / 100,
    p_due_date: dueDate,
    p_note: note || null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, result: data })
}
