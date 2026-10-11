import { createDb, asUser } from './lib.mjs'
import { applyMigrations } from './migrate.mjs'
import { ID, seed } from './seed.mjs'
import { t, rejects, eq, ok, section, summary } from './kit.mjs'

const { db } = await createDb()
// The snapshot only has stubs of these; use real columns.
await db.exec(`
  drop table if exists public.repair_job_crew cascade;
  create table public.repair_job_crew (id uuid primary key default gen_random_uuid(), repair_id uuid, user_id uuid, status text, added_by uuid);
  drop table if exists public.ratings cascade;
  create table if not exists public.user_profiles (user_id uuid primary key, full_name text, mobile_number text);
  create table if not exists public.user_audit (id uuid primary key default gen_random_uuid(), tenant_id uuid, actor_id uuid, actor_email text, target_user_id uuid, target_email text, action text, detail text, created_at timestamptz default now());
  create table if not exists public.technician_locations (user_id uuid primary key, latitude double precision, longitude double precision, updated_at timestamptz default now());
`)
await applyMigrations(db, [
  '20261011100000_technician_stats.sql',
  '20261011110000_install_checklist_modem_serial.sql',
  '20261011115000_role_permissions.sql',
  '20261011150000_outages_arrival_history_dispatch.sql',
])
await seed(db)

const ADMIN = 'e0000000-0000-0000-0000-000000000051'
const T1 = 'e0000000-0000-0000-0000-000000000052'
const T2 = 'e0000000-0000-0000-0000-000000000053'
const T3 = 'e0000000-0000-0000-0000-000000000054'
const CREW = 'e0000000-0000-0000-0000-000000000055'
const OUTSIDER = 'e0000000-0000-0000-0000-000000000056'
await db.exec(`
  insert into auth.users (id, email) values ('${ADMIN}', 'admin@pkc.test'), ('${T1}', 't1@pkc.test'), ('${T2}', 't2@pkc.test'),
    ('${T3}', 't3@pkc.test'), ('${CREW}', 'crew@pkc.test'), ('${OUTSIDER}', 'out@pkc.test');
  insert into public.tenant_users (user_id, tenant_id, role) values
    ('${ADMIN}', '${ID.tenant}', 'admin'), ('${T1}', '${ID.tenant}', 'technician'), ('${T2}', '${ID.tenant}', 'technician'),
    ('${T3}', '${ID.tenant}', 'technician'), ('${CREW}', '${ID.tenant}', 'technician');
  insert into public.user_profiles (user_id, full_name, mobile_number) values
    ('${T1}', 'Tony One', '0917111'), ('${T2}', 'Tina Two', '0917222'), ('${T3}', 'Tom Three', '0917333');
  update public.clients set area = 'Prk 6-A Burgos', address = 'Canocotan, Tagum' where id = '${ID.c1}';
  update public.clients set area = 'Purok 2 Magugpo' where id = '${ID.c3}';
  insert into public.technician_locations (user_id, latitude, longitude) values ('${T1}', 7.45, 125.8);
`)

const q = async (sql, params) => (await db.query(sql, params)).rows
const one = async (sql, params) => (await q(sql, params))[0]
const call = (user, sql, params) => asUser(db, user, () => db.query(sql, params)).then((r) => r.rows[0])
const pushes = async () => (await q(`select body from net.sent order by id`)).map((r) => JSON.stringify(r.body))

section('1. Outages')
let O1
await t('staff with the dispatch permission post an outage; only customers in the area are told', async () => {
  const r = (await call(ADMIN, `select public.create_outage($1, 'Fiber cut in Burgos', 'A cable was cut. Crews are on site.', now() + interval '3 hours') r`, [['  Burgos ', 'BURGOS']])).r
  O1 = r.id
  eq(r.notified, 1)
  const p = await pushes()
  ok(p.some((x) => x.includes(ID.u1) && x.includes('Fiber cut in Burgos')), 'u1 pushed')
  ok(!p.some((x) => x.includes(ID.u3)), 'u3 not pushed')
})
await t('customers see the banner only when their area matches', async () => {
  eq((await call(ID.u1, `select jsonb_array_length(public.active_outages_for_me()) n`)).n, 1)
  eq((await call(ID.u3, `select jsonb_array_length(public.active_outages_for_me()) n`)).n, 0)
  eq((await call(ID.u2, `select jsonb_array_length(public.active_outages_for_me()) n`)).n, 0)
  eq((await call(ID.acc2, `select jsonb_array_length(public.active_outages_for_me()) n`)).n, 0)
})
await t('an outage with no areas reaches every customer of the company', async () => {
  const r = (await call(ADMIN, `select public.create_outage('{}', 'Planned maintenance', 'Short interruption tonight.') r`)).r
  ok(r.notified >= 3, 'all customers notified')
  eq((await call(ID.u3, `select jsonb_array_length(public.active_outages_for_me()) n`)).n, 1)
  await call(ADMIN, `select public.resolve_outage($1)`, [r.id])
})
await t('resolving takes the banner away and tells the customers', async () => {
  await call(ADMIN, `select public.resolve_outage($1)`, [O1])
  eq((await call(ID.u1, `select jsonb_array_length(public.active_outages_for_me()) n`)).n, 0)
  ok((await pushes()).some((x) => x.includes('Service restored')), 'restored push')
  await rejects(() => call(ADMIN, `select public.resolve_outage($1)`, [O1]), /already marked as resolved/)
})
await t('the staff list shows outages with how many customers are in the area', async () => {
  const l = (await call(ADMIN, `select public.list_outages() l`)).l
  eq(l.length, 2)
  eq(l.find((o) => o.id === O1).customers_in_area, 1)
})
await t('input is validated', async () => {
  await rejects(() => call(ADMIN, `select public.create_outage('{}', 'Hi', 'Message here')`), /3 to 80 characters/)
  await rejects(() => call(ADMIN, `select public.create_outage('{}', 'Good title', 'x')`), /3 to 400 characters/)
  await rejects(() => call(ADMIN, `select public.create_outage('{}', 'Good title', 'A real message', now() - interval '1 hour')`), /in the past/)
  await rejects(() => call(ADMIN, `select public.create_outage($1, 'Good title', 'A real message')`, [Array.from({ length: 11 }, (_, i) => `area${i}`)]), /at most 10 areas/)
})
await t('only people with the dispatch permission can post, and it follows the permissions editor', async () => {
  await rejects(() => call(ID.acc, `select public.create_outage('{}', 'Good title', 'A real message')`), /do not have access/)
  await rejects(() => call(ID.u1, `select public.create_outage('{}', 'Good title', 'A real message')`), /do not have access/)
  await rejects(() => call(ID.acc, `select public.list_outages()`), /do not have access/)
  await call(ADMIN, `select public.set_role_permission('accounting', 'dispatch', true)`)
  ok((await call(ID.acc, `select public.list_outages() l`)).l.length >= 1, 'accounting now allowed')
  await call(ADMIN, `select public.set_role_permission('accounting', 'dispatch', false)`)
  await rejects(() => call(ID.acc, `select public.list_outages()`), /do not have access/)
})
await t('another company cannot read or resolve them', async () => {
  await rejects(() => call(ID.acc2, `select public.resolve_outage($1)`, [O1]), /could not be found/)
  await db.exec(`set role authenticated; select set_config('request.jwt.claims', '{"sub":"${ID.u1}","role":"authenticated"}', false);`)
  try {
    eq((await db.query(`select * from public.outages`)).rows.length, 0)
  } finally {
    await db.exec(`reset role`)
  }
})

section('2. Arrival check-in')
const mkJob = async (tech = T1, status = 'In Progress', client = ID.c1) =>
  (await one(`insert into public.repair_records (client_id, technician_user_id, status, problem_description, accepted_at, job_type)
    values ($1, $2, $3, 'No internet', now(), 'repair') returning id`, [client, tech, status])).id
const J1 = await mkJob()
await t('the technician on the job checks in; time and GPS are saved and the customer is told', async () => {
  const at = (await call(T1, `select public.check_in_arrival($1, 7.4478, 125.807) a`, [J1])).a
  ok(at, 'arrival time returned')
  const j = await one(`select arrived_at, arrived_latitude, arrived_longitude from public.repair_records where id = $1`, [J1])
  eq(j.arrived_latitude, 7.4478)
  ok((await pushes()).some((x) => x.includes(ID.u1) && x.includes('has arrived')), 'customer pushed')
})
await t('checking in again keeps the first time', async () => {
  const first = (await one(`select arrived_at from public.repair_records where id = $1`, [J1])).arrived_at
  const again = (await call(T1, `select public.check_in_arrival($1) a`, [J1])).a
  eq(new Date(again).getTime(), new Date(first).getTime())
})
await t('GPS is optional but must be valid when given', async () => {
  const J = await mkJob()
  await rejects(() => call(T1, `select public.check_in_arrival($1, 123, 10)`, [J]), /not valid/)
  ok((await call(T1, `select public.check_in_arrival($1) a`, [J])).a, 'works without GPS')
})
await t('an accepted crew member can check in, others cannot', async () => {
  const J = await mkJob()
  await db.exec(`insert into public.repair_job_crew (repair_id, user_id, status) values ('${J}', '${CREW}', 'accepted'), ('${J}', '${T3}', 'pending')`)
  ok((await call(CREW, `select public.check_in_arrival($1) a`, [J])).a, 'crew ok')
  await rejects(() => call(T3, `select public.check_in_arrival($1)`, [J]), /Only the technician on this job/)
  await rejects(() => call(T2, `select public.check_in_arrival($1)`, [J]), /Only the technician on this job/)
  await rejects(() => call(ID.u1, `select public.check_in_arrival($1)`, [J]), /Only the technician on this job/)
})
await t('finished jobs and unknown jobs are refused', async () => {
  const done = await mkJob(T1, 'Completed')
  await rejects(() => call(T1, `select public.check_in_arrival($1)`, [done]), /already finished/)
  await rejects(() => call(T1, `select public.check_in_arrival('d0000000-0000-0000-0000-0000000000ff')`), /could not be found/)
})

section('3. Job history by customer')
await db.query(`update public.repair_records set status = 'Completed', resolution = 'Replaced the patch cord' where problem_description = 'No internet' and technician_user_id = '${T1}' and id <> '${J1}'`)
await db.query(`update public.clients set modem_serial = 'ZTE-HIST0001' where id = '${ID.c1}'`)
const hist = (user, client = ID.c1) => call(user, `select public.client_job_history($1) h`, [client]).then((r) => r.h)
await t('a technician working a job at the customer sees the history', async () => {
  const h = await hist(T1)
  eq(h.modem_serial, 'ZTE-HIST0001')
  ok(h.jobs.length >= 3, 'past jobs listed')
  ok(h.jobs.some((j) => j.resolution === 'Replaced the patch cord'), 'resolution shown')
})
await t('admins and accounting can; technicians with no job there, customers and other companies cannot', async () => {
  ok((await hist(ADMIN)).jobs.length > 0, 'admin')
  ok((await hist(ID.acc)).jobs.length > 0, 'accounting')
  await rejects(() => hist(T2), /customers you are working for/)
  await rejects(() => hist(ID.u1), /customers you are working for/)
  await rejects(() => hist(ID.acc2), /customers you are working for/)
  await rejects(() => hist(T1, ID.c3), /customers you are working for/)
})
await t('a technician who finished all jobs there loses access', async () => {
  const only = await mkJob(T2, 'Assigned', ID.c3)
  ok((await hist(T2, ID.c3)).jobs.length === 1, 'sees while working')
  await db.query(`update public.repair_records set status = 'Completed' where id = $1`, [only])
  await rejects(() => hist(T2, ID.c3), /customers you are working for/)
})

section('4. Dispatch board and assignment')
await db.query(`delete from public.repair_records`)
const U1 = await one(`insert into public.repair_records (client_id, status, problem_description, job_type) values ($1, 'Pending', 'Router keeps rebooting', 'repair') returning id`, [ID.c1])
const U2 = await one(`insert into public.repair_records (client_id, status, problem_description, job_type) values ($1, 'Pending', 'New installation', 'installation') returning id`, [ID.c3])
await db.query(`insert into public.repair_records (client_id, status, problem_description) values ($1, 'Completed', 'Old finished job')`, [ID.c1])
await t('the board lists open jobs and technicians with their workload and last position', async () => {
  const b = (await call(ADMIN, `select public.dispatch_board() b`)).b
  eq(b.jobs.length, 2)
  ok(b.jobs.every((j) => j.technician_user_id === null), 'both unassigned')
  eq(b.technicians.length, 4)
  const tony = b.technicians.find((x) => x.name === 'Tony One')
  eq(tony.active_jobs, 0)
  eq(tony.latitude, 7.45)
})
await t('assigning gives the job to the technician with the normal rules and notifies everyone', async () => {
  await call(ADMIN, `select public.dispatch_assign($1, $2)`, [U1.id, T1])
  const j = await one(`select technician_user_id, technician, technician_phone, accepted_at from public.repair_records where id = $1`, [U1.id])
  eq(j.technician_user_id, T1)
  eq(j.technician, 'Tony One')
  eq(j.technician_phone, '0917111')
  ok(j.accepted_at, 'accepted time set')
  ok((await pushes()).some((x) => x.includes(T1) && x.includes('New job assigned')), 'technician pushed')
  const a = await one(`select * from public.audit_log where field_name = 'job_assigned' order by id desc limit 1`)
  eq(a.new_value, 'Tony One')
  eq(a.changed_by_email, 'admin@pkc.test')
})
await t('reassigning hands it to the other technician and clears the old arrival and crew', async () => {
  await db.query(`update public.repair_records set arrived_at = now() where id = $1`, [U1.id])
  await db.exec(`insert into public.repair_job_crew (repair_id, user_id, status) values ('${U1.id}', '${CREW}', 'accepted')`)
  await call(ADMIN, `select public.dispatch_assign($1, $2)`, [U1.id, T2])
  const j = await one(`select technician_user_id, technician, arrived_at, status from public.repair_records where id = $1`, [U1.id])
  eq(j.technician_user_id, T2)
  eq(j.technician, 'Tina Two')
  eq(j.arrived_at, null)
  eq(j.status, 'Pending')
  eq((await q(`select * from public.repair_job_crew where repair_id = $1`, [U1.id])).length, 0)
  const a = await one(`select * from public.audit_log where field_name = 'job_assigned' order by id desc limit 1`)
  eq(a.old_value, 'Tony One')
  eq(a.new_value, 'Tina Two')
})
await t('assigning the same technician again changes nothing', async () => {
  const before = (await q(`select count(*)::int n from public.audit_log where field_name = 'job_assigned'`))[0].n
  await call(ADMIN, `select public.dispatch_assign($1, $2)`, [U1.id, T2])
  eq((await q(`select count(*)::int n from public.audit_log where field_name = 'job_assigned'`))[0].n, before)
})
await t('the three-active-jobs rule still applies', async () => {
  for (let i = 0; i < 2; i++) await mkJob(T3, 'In Progress', ID.c1)
  await mkJob(T3, 'In Progress', ID.c3)
  await rejects(() => call(ADMIN, `select public.dispatch_assign($1, $2)`, [U2.id, T3]), /already have 3 active jobs/)
  eq((await one(`select technician_user_id from public.repair_records where id = $1`, [U2.id])).technician_user_id, null)
})
await t('a job can be taken back (unassigned)', async () => {
  await call(ADMIN, `select public.dispatch_assign($1, null)`, [U1.id])
  const j = await one(`select technician_user_id, technician, status from public.repair_records where id = $1`, [U1.id])
  eq(j.technician_user_id, null)
  eq(j.technician, null)
})
await t('only technicians of the company can be chosen, and finished jobs cannot be changed', async () => {
  await rejects(() => call(ADMIN, `select public.dispatch_assign($1, $2)`, [U2.id, ID.acc]), /not a technician/)
  await rejects(() => call(ADMIN, `select public.dispatch_assign($1, $2)`, [U2.id, OUTSIDER]), /not a technician/)
  const done = (await one(`select id from public.repair_records where status = 'Completed' limit 1`)).id
  await rejects(() => call(ADMIN, `select public.dispatch_assign($1, $2)`, [done, T1]), /already finished/)
})
await t('it needs the dispatch permission and stays inside the company', async () => {
  await rejects(() => call(ID.acc, `select public.dispatch_board()`), /do not have access/)
  await rejects(() => call(T1, `select public.dispatch_board()`), /do not have access/)
  await rejects(() => call(ID.acc, `select public.dispatch_assign($1, $2)`, [U2.id, T1]), /do not have access/)
  await rejects(() => call(ID.acc2, `select public.dispatch_assign($1, $2)`, [U2.id, T1]), /do not have access/)
  await rejects(() => call(ID.u1, `select public.dispatch_assign($1, $2)`, [U2.id, T1]), /do not have access/)
})
await t('anonymous callers cannot run any of it', async () => {
  await db.exec(`set role anon`)
  try {
    for (const fn of ['public.dispatch_board()', 'public.list_outages()', 'public.active_outages_for_me()']) {
      await rejects(() => db.query(`select ${fn}`), /permission denied/)
    }
  } finally {
    await db.exec(`reset role`)
  }
})

summary()
