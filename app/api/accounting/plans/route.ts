import { NextRequest, NextResponse } from 'next/server'
import { getCaller, isSessionVerified } from '@/lib/serverSecurity'

// The plans a business sells. Only admins change prices. The customer app reads
// the active ones live (list_plans), new bills use the current price, and bills
// already issued keep the price they were issued at.

const NAME = /^[A-Za-z0-9_.-]{1,40}$/

async function adminTenant(request: NextRequest) {
  const caller = await getCaller(request)
  if (!caller) return { error: NextResponse.json({ error: 'Your session is invalid or expired.' }, { status: 401 }) }
  if (!(await isSessionVerified(caller))) {
    return { error: NextResponse.json({ error: 'Finish signing in (email code and secondary password) first.' }, { status: 403 }) }
  }
  const { data } = await caller.admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', caller.user.id)
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle()
  if (!data?.tenant_id) {
    return { error: NextResponse.json({ error: 'Only an admin can manage plans.' }, { status: 403 }) }
  }
  return { caller, tenantId: data.tenant_id as string }
}

export async function GET(request: NextRequest) {
  const ctx = await adminTenant(request)
  if ('error' in ctx) return ctx.error

  const { data: plans, error } = await ctx.caller.admin
    .from('internet_plans')
    .select('id, plan_name, price, speed, active')
    .eq('tenant_id', ctx.tenantId)
    .order('price', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // How many customers are on each plan, so a price change is not a surprise.
  const { data: clients } = await ctx.caller.admin.from('clients').select('plan_name').eq('tenant_id', ctx.tenantId)
  const counts: Record<string, number> = {}
  for (const row of clients || []) if (row.plan_name) counts[row.plan_name] = (counts[row.plan_name] || 0) + 1

  return NextResponse.json({ plans: (plans || []).map((p) => ({ ...p, customers: counts[p.plan_name] || 0 })) })
}

export async function POST(request: NextRequest) {
  const ctx = await adminTenant(request)
  if ('error' in ctx) return ctx.error

  const body = await request.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : ''
  const planName = typeof body.planName === 'string' ? body.planName.trim() : ''
  const price = Number(body.price)
  const speed = typeof body.speed === 'string' ? body.speed.trim().slice(0, 40) : ''
  const active = body.active !== false

  if (!Number.isFinite(price) || price <= 0 || price > 100000 || Math.round(price * 100) !== price * 100) {
    return NextResponse.json({ error: 'Enter a price above zero (up to 2 decimals).' }, { status: 400 })
  }

  if (id) {
    const { data: existing } = await ctx.caller.admin
      .from('internet_plans')
      .select('id, plan_name')
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle()
    if (!existing) return NextResponse.json({ error: 'Plan not found.' }, { status: 404 })

    // The name stays: customers and bills refer to the plan by it.
    const { error } = await ctx.caller.admin
      .from('internet_plans')
      .update({ price, speed: speed || null, active })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    await ctx.caller.admin.from('audit_log').insert({
      tenant_id: ctx.tenantId,
      changed_by_email: ctx.caller.user.email || 'Unknown',
      field_name: 'plan_updated',
      old_value: existing.plan_name,
      new_value: `PHP ${price} / ${active ? 'active' : 'off'}`,
    })
    return NextResponse.json({ ok: true })
  }

  if (!NAME.test(planName)) {
    return NextResponse.json({ error: 'Plan name: letters, numbers, _ . - only (for example G1_P1250).' }, { status: 400 })
  }
  const { data: dup } = await ctx.caller.admin
    .from('internet_plans')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('plan_name', planName)
    .maybeSingle()
  if (dup) return NextResponse.json({ error: 'A plan with that name already exists.' }, { status: 400 })

  const { error } = await ctx.caller.admin
    .from('internet_plans')
    .insert({ tenant_id: ctx.tenantId, plan_name: planName, price, speed: speed || null, active })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await ctx.caller.admin.from('audit_log').insert({
    tenant_id: ctx.tenantId,
    changed_by_email: ctx.caller.user.email || 'Unknown',
    field_name: 'plan_created',
    old_value: '',
    new_value: `${planName} PHP ${price}`,
  })
  return NextResponse.json({ ok: true })
}
