import { NextRequest } from 'next/server'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto'

const STAFF_ROLES = ['admin', 'technician', 'accounting', 'inventory']

export type Caller = {
  user: User
  sessionId: string | null
  admin: SupabaseClient
}

export function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function decodeClaims(token: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
  } catch {
    return {}
  }
}

// Validates the bearer token with Supabase, then reads the session claims.
export async function getCaller(request: NextRequest): Promise<Caller | null> {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  const token = authorization.slice(7).trim()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const admin = adminClient()
  if (!url || !anon || !admin) return null

  const anonClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await anonClient.auth.getUser(token)
  if (error || !data.user) return null

  const claims = decodeClaims(token)

  return {
    user: data.user,
    sessionId: typeof claims.session_id === 'string' ? claims.session_id : null,
    admin,
  }
}

export type CodePurpose = 'login' | 'users'

export function parsePurpose(value: unknown): CodePurpose | null {
  return value === 'login' || value === 'users' ? value : null
}

// True when this session entered a valid emailed code for `purpose` recently.
export async function emailVerifiedRecently(caller: Caller, purpose: CodePurpose, maxAgeSeconds: number) {
  if (!caller.sessionId) return false
  const { data } = await caller.admin
    .from('staff_email_verified')
    .select('verified_at')
    .eq('session_id', caller.sessionId)
    .eq('purpose', purpose)
    .maybeSingle()
  if (!data) return false
  return Date.now() - new Date(data.verified_at).getTime() <= maxAgeSeconds * 1000
}

export function hashCode(userId: string, code: string) {
  return createHash('sha256').update(`${userId}:${code}`).digest('hex')
}

export function newCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export async function isStaff(caller: Caller) {
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    caller.admin.from('profiles').select('role').eq('id', caller.user.id).maybeSingle(),
    caller.admin.from('tenant_users').select('role').eq('user_id', caller.user.id),
  ])
  if (profile?.role && STAFF_ROLES.includes(profile.role)) return true
  return (memberships || []).some((m) => m.role && m.role !== 'customer')
}

export function hashSecondary(password: string) {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

export function checkSecondary(password: string, stored: string) {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return timingSafeEqual(actual, expected)
}
