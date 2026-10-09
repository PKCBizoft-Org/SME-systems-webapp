import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/serverSecurity'
import { sendSms, smsConfigured } from '@/lib/sms'

// Called by the database (a trigger on repair_records) the moment a technician
// accepts a job. Texts the customer who the technician is. The shared secret is
// the same one the push-notification trigger uses (public.push_config), so
// nobody else can call this. It sends at most one SMS per job.
export async function POST(request: NextRequest) {
  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Server configuration is missing.' }, { status: 500 })

  const provided = request.headers.get('x-push-secret') || ''
  const { data: config } = await admin.from('push_config').select('secret').limit(1).maybeSingle()
  if (!config?.secret || provided !== config.secret) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 401 })
  }

  // Not set up yet (the Semaphore account belongs to the owner): do nothing,
  // and leave the job unmarked so nothing is lost silently.
  if (!smsConfigured()) return NextResponse.json({ ok: true, skipped: 'sms not configured' })

  const body = await request.json().catch(() => ({}))
  const repairId = typeof body.repair_id === 'string' ? body.repair_id : ''
  if (!repairId) return NextResponse.json({ error: 'A job is required.' }, { status: 400 })

  // Claim the job so a retry can never text twice.
  const { data: claimed } = await admin
    .from('repair_records')
    .update({ accept_sms_sent_at: new Date().toISOString() })
    .eq('id', repairId)
    .is('accept_sms_sent_at', null)
    .not('technician_user_id', 'is', null)
    .select('id, client_id, job_type, technician, technician_phone')
    .maybeSingle()

  if (!claimed) return NextResponse.json({ ok: true, skipped: 'already sent or not accepted' })

  const release = () => admin.from('repair_records').update({ accept_sms_sent_at: null }).eq('id', repairId)

  try {
    const { data: client } = await admin
      .from('clients')
      .select('customer_name, mobile_number')
      .eq('id', claimed.client_id)
      .maybeSingle()

    if (!client?.mobile_number) {
      return NextResponse.json({ ok: true, skipped: 'customer has no mobile number' })
    }

    const first = String(client.customer_name || '').trim().split(/\s+/)[0]
    const tech = String(claimed.technician || 'A technician').trim()
    const job = claimed.job_type === 'installation' ? 'installation' : 'repair'
    const call = claimed.technician_phone ? ` Contact: ${claimed.technician_phone}.` : ''
    const message = `PKC BIZOFT: Hi${first ? ` ${first}` : ''}, ${tech} accepted your ${job} request and will visit you soon.${call}`

    await sendSms(client.mobile_number, message)
    return NextResponse.json({ ok: true, sent: true })
  } catch (error) {
    console.error('Job accepted SMS failed:', error)
    await release()
    return NextResponse.json({ error: 'The SMS could not be sent.' }, { status: 502 })
  }
}
