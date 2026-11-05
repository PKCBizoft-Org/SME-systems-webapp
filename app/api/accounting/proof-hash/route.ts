import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getCaller, hasTenantRole, isSessionVerified } from '@/lib/serverSecurity'

// Fills payment_submissions.proof_hash (SHA-256 of the receipt image) for the given
// pending submissions, so the verification screen can flag re-submitted screenshots.
// Read-only toward the customer's record except for the one hash column; never touches money.
export async function POST(request: NextRequest) {
  const caller = await getCaller(request)
  if (!caller) return NextResponse.json({ error: 'Your session is invalid or expired.' }, { status: 401 })
  if (!(await isSessionVerified(caller))) {
    return NextResponse.json({ error: 'Finish signing in first.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const ids = Array.isArray(body.submissionIds)
    ? (body.submissionIds as unknown[]).filter((v): v is string => typeof v === 'string').slice(0, 100)
    : []
  if (ids.length === 0) return NextResponse.json({ hashes: {} })

  const { data: subs } = await caller.admin
    .from('payment_submissions')
    .select('id, tenant_id, proof_path, proof_hash')
    .in('id', ids)
  if (!subs || subs.length === 0) return NextResponse.json({ hashes: {} })

  // Compute the fingerprint only for rows this staff member may review and that
  // are still missing it. Rows already hashed are skipped — the client reads those
  // from its own RLS-scoped query, so the route never echoes a stored hash and
  // never discloses anything about another tenant's submissions.
  const allowed = new Map<string, boolean>()
  const hashes: Record<string, string> = {}

  for (const sub of subs) {
    if (sub.proof_hash || !sub.proof_path || !sub.tenant_id) continue

    if (!allowed.has(sub.tenant_id)) {
      allowed.set(sub.tenant_id, await hasTenantRole(caller, sub.tenant_id, ['admin', 'accounting']))
    }
    if (!allowed.get(sub.tenant_id)) continue

    const { data: file, error } = await caller.admin.storage.from('payment-proofs').download(sub.proof_path)
    if (error || !file) continue

    const buf = Buffer.from(await file.arrayBuffer())
    const hash = crypto.createHash('sha256').update(buf).digest('hex')

    const { error: upErr } = await caller.admin
      .from('payment_submissions')
      .update({ proof_hash: hash })
      .eq('id', sub.id)
    if (!upErr) hashes[sub.id] = hash
  }

  return NextResponse.json({ hashes })
}
