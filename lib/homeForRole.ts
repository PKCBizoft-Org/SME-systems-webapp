import type { SupabaseClient } from '@supabase/supabase-js'

// Where a signed-in staff member should land. Admins and technicians use the
// client directory; accounting and inventory staff go straight to their tool.
export async function homeForUser(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase.from('tenant_users').select('role').eq('user_id', userId)
  const roles = (data || []).map((row) => row.role)

  if (roles.includes('admin')) return '/clients'
  if (roles.includes('accounting')) return '/accounting'
  if (roles.includes('inventory')) return '/inventory'
  return '/clients'
}
