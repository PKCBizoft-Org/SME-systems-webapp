import { NextRequest, NextResponse } from 'next/server'
import { getCaller } from '@/lib/serverSecurity'

// Called by the Set Password page right after a person chose their own
// password. Clears the "must change password" flag set when an admin created
// the account or re-issued a temporary password.
export async function POST(request: NextRequest) {
  const caller = await getCaller(request)
  if (!caller) return NextResponse.json({ error: 'Your session is invalid or expired.' }, { status: 401 })

  if (!caller.user.app_metadata?.must_change_password) return NextResponse.json({ ok: true })

  // Setting a key to null removes it (app_metadata is merged, not replaced).
  const { error } = await caller.admin.auth.admin.updateUserById(caller.user.id, {
    app_metadata: { must_change_password: null, temp_expires_at: null },
  })
  if (error) return NextResponse.json({ error: 'Unable to finish the password change.' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
