import { createDb, asUser } from './lib.mjs'
import { applyMigrations } from './migrate.mjs'
import { ID, seed, addBill } from './seed.mjs'
import { t, rejects, eq, ok, section, summary } from './kit.mjs'

const { db } = await createDb()
// The snapshot only has stubs of these; use the real tables.
await db.exec(`
  drop table public.repair_job_crew cascade;
  create table public.repair_job_crew (id uuid primary key default gen_random_uuid(), repair_id uuid, user_id uuid, status text, added_by uuid);
  drop table public.ratings cascade;
  create table if not exists public.user_profiles (user_id uuid primary key, full_name text, mobile_number text);
  create table if not exists public.user_audit (id uuid primary key default gen_random_uuid(), tenant_id uuid, actor_id uuid, actor_email text, target_user_id uuid, target_email text, action text, detail text, created_at timestamptz default now());
`)
await applyMigrations(db, [
  '20261008140000_ratings.sql',
  '20261011115000_role_permissions.sql',
  '20261011120000_ticket_chat.sql',
  '20261011130000_insights_survey_permissions.sql',
  '20261011140000_permission_rules_audit_feed.sql',
])
await seed(db)

const ADMIN = 'e0000000-0000-0000-0000-000000000041'
const TECH = 'e0000000-0000-0000-0000-000000000042'
const INV = 'e0000000-0000-0000-0000-000000000043'
await db.exec(`
  insert into auth.users (id, email) values ('${ADMIN}', 'admin@pkc.test'), ('${TECH}', 'tech@pkc.test'), ('${INV}', 'inv@pkc.test');
  insert into public.tenant_users (user_id, tenant_id, role) values
    ('${ADMIN}', '${ID.tenant}', 'admin'), ('${TECH}', '${ID.tenant}', 'technician'), ('${INV}', '${ID.tenant}', 'inventory');
`)

const q = async (sql, params) => (await db.query(sql, params)).rows
const one = async (sql, params) => (await q(sql, params))[0]
const call = (user, sql, params) => asUser(db, user, () => db.query(sql, params)).then((r) => r.rows[0])
const perms = async (user) => (await call(user, `select public.my_permissions() p`)).p
const setPerm = (user, role, perm, allowed) => call(user, `select public.set_role_permission($1, $2, $3)`, [role, perm, allowed])

section('1. Role permissions')
await t('defaults: admin everything, accounting its pages, inventory and technician only theirs', async () => {
  eq((await perms(ADMIN)).length, 8)
  eq((await perms(ID.acc)).sort().join(','), 'accounting,analytics,audit,clients,ratings,tickets')
  eq((await perms(INV)).sort().join(','), 'clients,inventory')
  eq((await perms(TECH)).join(','), 'clients')
  eq((await perms(ID.u1)).length, 0)
})
await t('an admin can switch a permission on and off, and it takes effect', async () => {
  await setPerm(ADMIN, 'technician', 'analytics', true)
  eq((await perms(TECH)).sort().join(','), 'analytics,clients')
  await setPerm(ADMIN, 'technician', 'analytics', false)
  await setPerm(ADMIN, 'accounting', 'analytics', false)
  ok(!(await perms(ID.acc)).includes('analytics'), 'accounting lost analytics')
  await setPerm(ADMIN, 'accounting', 'analytics', true)
  ok((await perms(ID.acc)).includes('analytics'), 'accounting has analytics again')
})
await t('the matrix shows defaults plus changes', async () => {
  const m = (await call(ADMIN, `select public.list_role_permissions() m`)).m
  eq(m.technician.inventory, false)
  eq(m.technician.accounting, false)
  eq(m.accounting.tickets, true)
  eq(m.inventory.inventory, true)
})
await t('every change is written to the audit trail', async () => {
  const rows = await q(`select actor_email, detail from public.user_audit where action = 'permission_changed' order by created_at, id`)
  eq(rows.length, 4)
  eq(rows[0].actor_email, 'admin@pkc.test')
  eq(rows[0].detail, 'technician: analytics on')
})
await t('only admins can change or even see the matrix', async () => {
  await rejects(() => setPerm(ID.acc, 'technician', 'clients', false), /Only an admin/)
  await rejects(() => setPerm(TECH, 'accounting', 'analytics', false), /Only an admin/)
  await rejects(() => setPerm(ID.u1, 'accounting', 'analytics', false), /Only an admin/)
  await rejects(() => call(ID.acc, `select public.list_role_permissions()`), /Only an admin/)
})
await t('the rules cannot be bent: unknown role/permission, admin role, handing out Users', async () => {
  await rejects(() => setPerm(ADMIN, 'admin', 'clients', false), /always have every permission/)
  await rejects(() => setPerm(ADMIN, 'janitor', 'clients', true), /Unknown role/)
  await rejects(() => setPerm(ADMIN, 'accounting', 'payroll', true), /Unknown permission/)
  await rejects(() => setPerm(ADMIN, 'accounting', 'users', true), /Only admins can manage users/)
  await rejects(() => call(ADMIN, `select public.set_role_permission('accounting', 'clients', null)`), /Choose on or off/)
})
await t('only permissions the database enforces (or the role already has) can be switched on', async () => {
  await setPerm(ADMIN, 'technician', 'tickets', true)
  eq((await perms(TECH)).includes('tickets'), true)
  await rejects(() => setPerm(ADMIN, 'technician', 'accounting', true), /cannot be switched on for this role yet/)
  await rejects(() => setPerm(ADMIN, 'inventory', 'ratings', true), /cannot be switched on for this role yet/)
  // ...but older pages can always be switched off, and back on while they are a default.
  await setPerm(ADMIN, 'inventory', 'inventory', false)
  ok(!(await perms(INV)).includes('inventory'), 'inventory switched off')
  await setPerm(ADMIN, 'inventory', 'inventory', true)
  ok((await perms(INV)).includes('inventory'), 'inventory back on')
  await setPerm(ADMIN, 'technician', 'tickets', false)
})
await t('changes in one tenant do not touch another', async () => {
  eq((await perms(ID.acc2)).sort().join(','), 'accounting,analytics,audit,clients,ratings,tickets')
})
await t('nobody can write the permission table directly', async () => {
  await rejects(
    () => asUser(db, ID.acc, () => db.query(`insert into public.role_permissions (tenant_id, role, permission, allowed) values ('${ID.tenant}', 'accounting', 'users', true)`)),
    /permission denied/,
  )
})

section('2. Revenue analytics')
// Two bills for c1 this month: one paid in full, one part-paid and overdue.
const b1 = await addBill(db, { billId: 'B-1', amount: 750, dueOffset: -3, status: 'Unpaid', periodStartOffset: -30 })
const b2 = await addBill(db, { billId: 'B-2', amount: 1000, dueOffset: -2, status: 'Unpaid', periodStartOffset: 0 })
await addBill(db, { client: ID.c3, billId: 'B-3', amount: 500, dueOffset: -2, status: 'Cancelled', periodStartOffset: 0 })
const b4 = await addBill(db, { client: ID.c2, billId: 'B-4', amount: 750, dueOffset: -1, status: 'Paid', periodStartOffset: 0 })
await db.exec(`
  insert into public.payments (tenant_id, client_id, billing_id, payment_id, amount_paid, payment_date, payment_method)
  values ('${ID.tenant}', '${ID.c1}', '${b2}', 'P-1', 400, current_date, 'GCash'),
         ('${ID.tenant}', '${ID.c2}', '${b4}', 'P-2', 750, current_date, 'GCash');
`)
const report = async (user = ID.acc, months = 3) => (await call(user, `select public.revenue_report($1) r`, [months])).r
await t('totals: customers, MRR, overdue amount and bills, 30-day collections', async () => {
  const r = (await report()).totals
  eq(r.active_customers, 2)
  eq(Number(r.mrr), 750) // only c1 has an active service in the seed
  eq(r.overdue_bills, 2) // B-1 (unpaid) and B-2 (part-paid); cancelled and paid are left out
  eq(Number(r.overdue_amount), 750 + 600) // B-1 in full + the 600 still owed on B-2
  eq(Number(r.collected_30d), 1150)
})
await t('months are listed oldest first, with billed (cancelled left out) and collected', async () => {
  const r = await report()
  eq(r.months.length, 3)
  const cur = r.months[r.months.length - 1]
  eq(cur.month, (await one(`select to_char(current_date, 'YYYY-MM') m`)).m)
  ok(Number(cur.collected) >= 1150, 'collected this month')
  ok(Number(cur.billed) >= 1750, 'billed this month (the cancelled bill is left out)')
  ok(r.months[0].month < cur.month, 'oldest first')
})
await t('plans show how much each earns', async () => {
  const r = await report()
  eq(r.plans.length, 1)
  eq(r.plans[0].plan, 'G1_P750')
  eq(r.plans[0].customers, 1)
})
await t('the month window is limited to 1 to 24', async () => {
  eq((await report(ID.acc, 0)).months.length, 1)
  eq((await report(ID.acc, 99)).months.length, 24)
})
await t('it needs the analytics permission and only shows your own tenant', async () => {
  await rejects(() => report(TECH), /do not have access/)
  await rejects(() => report(ID.u1), /do not have access/)
  await setPerm(ADMIN, 'accounting', 'analytics', false)
  await rejects(() => report(ID.acc), /do not have access/)
  await setPerm(ADMIN, 'accounting', 'analytics', true)
  eq((await report(ID.acc2)).totals.active_customers, 0)
})

section('3. Staff tickets')
const REQ = (await one(`insert into public.service_requests (user_id, client_id, request_type, issue_type, description, status)
  values ('${ID.u1}', '${ID.c1}', 'repair', 'No Internet Connection', 'down since morning', 'Pending') returning id`)).id
await call(ID.u1, `select public.send_ticket_message($1, 'Please help')`, [REQ])
await t('staff see recent tickets with their chat activity', async () => {
  const list = (await call(ID.acc, `select public.staff_tickets() l`)).l
  eq(list.length, 1)
  eq(list[0].customer_name, 'Active Customer')
  eq(list[0].issue_type, 'No Internet Connection')
  eq(list[0].messages, 1)
  eq(list[0].last_sender_role, 'customer')
})
await t('other tenants, technicians and customers do not', async () => {
  eq((await call(ID.acc2, `select public.staff_tickets() l`)).l.length, 0)
  await rejects(() => call(TECH, `select public.staff_tickets()`), /do not have access/)
  await rejects(() => call(ID.u1, `select public.staff_tickets()`), /do not have access/)
})

section('4. Audit feed')
await db.exec(`insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
  values ('${ID.tenant}', '${ID.c1}', 'acc@pkc.test', 'payment_verified', '', '750'),
         ('${ID.tenant2}', null, 'other@pkc.test', 'payment_verified', '', '999')`)
const feed = async (user, since = null) => (await call(user, `select public.audit_feed(100, $1) f`, [since])).f
await t('it merges record changes and staff/permission changes, newest first', async () => {
  const f = await feed(ID.acc)
  ok(f.some((e) => e.source === 'record' && e.what === 'payment_verified' && e.customer === 'Active Customer' && e.detail === '750'), 'record event')
  ok(f.some((e) => e.source === 'staff' && e.what === 'permission_changed'), 'permission event')
  ok(f.every((e, i) => i === 0 || new Date(f[i - 1].at) >= new Date(e.at)), 'newest first')
})
await t('events of another tenant never show up', async () => {
  const f = await feed(ID.acc)
  ok(!f.some((e) => e.detail === '999'), 'no foreign events')
  eq((await feed(ID.acc2)).length, 1)
})
await t('the date filter works and the limit is capped', async () => {
  eq((await feed(ID.acc, new Date(Date.now() + 86400000).toISOString())).length, 0)
  eq((await call(ID.acc, `select jsonb_array_length(public.audit_feed(0)) n`)).n, 1)
})
await t('it follows the audit permission', async () => {
  await rejects(() => feed(TECH), /do not have access/)
  await rejects(() => feed(ID.u1), /do not have access/)
  await setPerm(ADMIN, 'accounting', 'audit', false)
  await rejects(() => feed(ID.acc), /do not have access/)
  await setPerm(ADMIN, 'accounting', 'audit', true)
  ok((await feed(ID.acc)).length > 0, 'accounting back in')
})

section('5. Satisfaction survey')
const R1 = (await one(`insert into public.ratings (tenant_id, client_id, user_id, kind, stars) values ('${ID.tenant}', '${ID.c1}', '${ID.u1}', 'service', 4) returning id`)).id
const survey = (user, id, a, b, c) => call(user, `select public.add_rating_survey($1, $2, $3, $4)`, [id, a, b, c])
await t('the customer answers once, on their own rating', async () => {
  await survey(ID.u1, R1, true, true, false)
  const r = await one(`select on_time, explained, tidy, survey_at from public.ratings where id = $1`, [R1])
  eq(r.on_time, true)
  eq(r.tidy, false)
  ok(r.survey_at, 'timestamp set')
  await rejects(() => survey(ID.u1, R1, false, false, false), /already answered/)
})
await t('nobody else can answer for them, and an empty survey is refused', async () => {
  const R3 = (await one(`insert into public.ratings (tenant_id, client_id, user_id, kind, stars) values ('${ID.tenant}', '${ID.c3}', '${ID.u3}', 'service', 5) returning id`)).id
  await rejects(() => survey(ID.u1, R3, true, true, true), /could not be found/)
  await rejects(() => survey(ID.u3, R3, null, null, null), /at least one question/)
})

summary()
