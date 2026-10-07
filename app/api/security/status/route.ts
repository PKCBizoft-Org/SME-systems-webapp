import { NextRequest, NextResponse } from 'next/server'
import { getCaller, isStaff } from '@/lib/serverSecurity'

// Tells the browser whether this session still has to pass the staff checks.
export async function GET(request: NextRequest) {
  const caller = await getCaller(request)
  if (!caller) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 })

  if (!(await isStaff(caller))) {
    return NextResponse.json({ staff: false, secondarySet: false, verified: true })
  }

  const [{ data: security }, { data: verified }] = await Promise.all([
    caller.admin.from('staff_security').select('user_id').eq('user_id', caller.user.id).maybeSingle(),
    caller.sessionId
      ? caller.admin
          .from('staff_verified_sessions')
          .select('session_id')
          .eq('session_id', caller.sessionId)
          .eq('user_id', caller.user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return NextResponse.json({ staff: true, secondarySet: Boolean(security), verified: Boolean(verified) })
}
