import { NextRequest, NextResponse } from 'next/server'
import { getCaller, hasTenantRole, isSessionVerified } from '@/lib/serverSecurity'

// Persists (or clears) an OCR-mismatch signal for a payment submission, so a receipt whose
// image contradicts what the customer typed also appears in the signals inbox and the daily
// digest — not just on the reviewer's screen. The OCR runs in the staff browser; this route
// only records the finding, after checking the caller may review that tenant's payments.
export async function POST(request: NextRequest) {
  const caller = await getCaller(request)
  if (!caller) return NextResponse.json({ error: 'Your session is invalid or expired.' }, { status: 401 })
  if (!(await isSessionVerified(caller))) {
    return NextResponse.json({ error: 'Finish signing in first.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const submissionId = typeof body.submissionId === 'string' ? body.submissionId : ''
  const mismatch = Boolean(body.mismatch)
  const summary = typeof body.summary === 'string' ? body.summary.slice(0, 300) : 'Receipt image does not match the typed details.'
  const details = body.details && typeof body.details === 'object' ? body.details : {}
  if (!submissionId) return NextResponse.json({ error: 'Missing payment.' }, { status: 400 })

  const { data: sub } = await caller.admin
    .from('payment_submissions')
    .select('id, tenant_id')
    .eq('id', submissionId)
    .maybeSingle()
  if (!sub || !sub.tenant_id) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 })

  if (!(await hasTenantRole(caller, sub.tenant_id, ['admin', 'accounting']))) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 })
  }

  if (mismatch) {
    const { error } = await caller.admin.from('ops_signals').upsert(
      {
        tenant_id: sub.tenant_id,
        kind: 'ocr_mismatch',
        severity: 'alert',
        entity_type: 'payment_submission',
        entity_id: submissionId,
        summary,
        details,
        status: 'open',
        resolved_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,kind,entity_type,entity_id' },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  } else {
    // OCR now agrees with the typed details: clear any earlier mismatch flag.
    await caller.admin
      .from('ops_signals')
      .update({ status: 'resolved', resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('entity_id', submissionId)
      .eq('kind', 'ocr_mismatch')
      .eq('status', 'open')
  }

  return NextResponse.json({ ok: true })
}
