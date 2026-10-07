'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabaseClient'

// Every staff page renders this (through StaffHeader). A signed-in staff
// session that has not passed the email code + secondary password is signed
// out and sent back to the login page.
export function StaffGuard() {
  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    async function check() {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) return

      const response = await fetch('/api/security/status', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (cancelled || !response.ok) return

      const status = await response.json()
      if (status.staff && !status.verified) {
        await supabase.auth.signOut()
        window.location.href = '/login'
      }
    }

    void check()
    return () => {
      cancelled = true
    }
  }, [])

  return null
}
