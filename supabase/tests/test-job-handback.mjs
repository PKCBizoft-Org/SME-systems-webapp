import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, asUser } from './lib.mjs'
import { applyMigrations } from './migrate.mjs'
import { seed, ID } from './seed.mjs'
import { t, rejects, eq, section, summary } from './kit.mjs'

const { db } = await createDb()
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

// The realtime publication does not exist in the sandbox: apply the rest.
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '20261012120000_pending_payment_notice_realtime.sql')
const sql = fs.readFileSync(file, 'utf8').replace(/do \$\$[\s\S]*?end \$\$;/i, '')
await db.exec(sql)

const T1 = 'e0000000-0000-0000-0000-000000000061'
const T2 = 'e0000000-0000-0000-0000-000000000062'
const OUTSIDER = 'e0000000-0000-0000-0000-000000000063'
await db.exec(`
  insert into auth.users (id, email) values ('${T1}', 't1@pkc.test'), ('${T2}', 't2@pkc.test'), ('${OUTSIDER}', 'o@pkc.test');
  insert into public.tenant_users (user_id, tenant_id, role) values
    ('${T1}', '${ID.tenant}', 'technician'), ('${T2}', '${ID.tenant}', 'technician'), ('${OUTSIDER}', '${ID.tenant2}', 'technician');
  insert into public.user_profiles (user_id, full_name) values ('${T1}', 'Tony One');
`)

const q = async (s, p) => (await db.query(s, p)).rows
const one = async (s, p) => (await q(s, p))[0]
const call = (user, s, p) => asUser(db, user, () => db.query(s, p)).then((r) => r.rows)

const SR = (await one(`insert into public.service_requests (user_id, client_id, request_type, status) values ($1, $2, 'plan_change', 'For installation') returning id`, [ID.u2, ID.c2])).id
const install = (await one(`insert into public.repair_records (client_id, status, problem_description, job_type, service_request_id) values ($1, 'Pending', 'New installation', 'installation', $2) returning id`, [ID.c2, SR])).id
const repair = (await one(`insert into public.repair_records (client_id, status, problem_description, job_type) values ($1, 'Pending', 'No internet', 'repair') returning id`, [ID.c1])).id

section('1. Handing a job back')
await t('the technician who took a job can hand it back; it becomes open again', async () => {
  await db.query(`update public.repair_records set technician_user_id = $1, status = 'Assigned' where id = $2`, [T1, repair])
  await db.query(`insert into public.repair_job_crew (repair_id, user_id, status) values ($1, $2, 'pending')`, [repair, T2])
  await call(T1, `select public.release_repair_job($1)`, [repair])
  const j = await one(`select technician_user_id, technician, status from public.repair_records where id = $1`, [repair])
  eq(j.technician_user_id, null)
  eq(j.technician, null)
  eq(j.status, 'Pending')
  eq((await q(`select * from public.repair_job_crew where repair_id = $1`, [repair])).length, 0)
})
await t('somebody else cannot hand it back', async () => {
  await db.query(`update public.repair_records set technician_user_id = $1, status = 'Assigned' where id = $2`, [T1, repair])
  await rejects(() => call(T2, `select public.release_repair_job($1)`, [repair]), /Only the technician who took this job/)
  await rejects(() => call(OUTSIDER, `select public.release_repair_job($1)`, [repair]), /Only the technician who took this job/)
})
await t('it cannot be handed back once the work started or the technician arrived', async () => {
  await db.query(`update public.repair_records set status = 'In Progress' where id = $1`, [repair])
  await rejects(() => call(T1, `select public.release_repair_job($1)`, [repair]), /already started/)
  await db.query(`update public.repair_records set status = 'Assigned', arrived_at = now() where id = $1`, [repair])
  await rejects(() => call(T1, `select public.release_repair_job($1)`, [repair]), /already started/)
})
await t('an installation request goes back to "For installation"', async () => {
  await db.query(`update public.repair_records set technician_user_id = $1, status = 'Assigned' where id = $2`, [T1, install])
  await call(T1, `select public.release_repair_job($1)`, [install])
  eq((await one(`select status from public.service_requests where id = $1`, [SR])).status, 'For installation')
  eq((await one(`select technician_user_id from public.repair_records where id = $1`, [install])).technician_user_id, null)
})
await t('the customer is told the technician changed', async () => {
  const sent = (await q(`select body from net.sent`)).map((r) => JSON.stringify(r.body)).join(' ')
  if (!/Your technician changed/.test(sent) && !/can no longer come/.test(sent)) {
    throw new Error('no notification was sent to the customer')
  }
})

section('2. Open jobs overview')
await db.query(`update public.repair_records set arrived_at = null, technician_user_id = $1, status = 'Assigned' where id = $2`, [T1, repair])
await t('another technician of the company sees who took a job', async () => {
  const rows = await call(T2, `select * from public.open_jobs_overview()`)
  const job = rows.find((r) => r.repair_id === repair)
  eq(job.technician_user_id, T1)
  eq(job.technician_name, 'Tony One')
})
await t('finished jobs are left out', async () => {
  await db.query(`update public.repair_records set status = 'Completed' where id = $1`, [repair])
  const rows = await call(T2, `select * from public.open_jobs_overview()`)
  eq(rows.some((r) => r.repair_id === repair), false)
})
await t('customers and technicians of other companies see nothing', async () => {
  eq((await call(ID.u1, `select * from public.open_jobs_overview()`)).length, 0)
  eq((await call(OUTSIDER, `select * from public.open_jobs_overview()`)).length, 0)
})

section('3. Payment waiting notice')
await t('staff of the company see a pending plan application; others do not', async () => {
  await db.query(`update public.service_requests set status = 'Payment Pending' where id = $1`, [SR])
  eq((await call(T1, `select public.client_payment_waiting($1) as w`, [ID.c2]))[0].w, true)
  eq((await call(OUTSIDER, `select public.client_payment_waiting($1) as w`, [ID.c2]))[0].w, false)
  await db.query(`update public.service_requests set status = 'For installation' where id = $1`, [SR])
  eq((await call(T1, `select public.client_payment_waiting($1) as w`, [ID.c2]))[0].w, false)
})

summary()
